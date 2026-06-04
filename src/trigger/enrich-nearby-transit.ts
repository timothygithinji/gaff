/**
 * Per-cluster nearby-transit enrichment.
 *
 * Sweeps every public-transport stop within ~1 mile of the cluster via
 * Google Places Nearby (New) and stores it as `enrichments.nearby_transit`.
 * This is what the detail page's "Where it sits" map plots — a full,
 * portal-agnostic picture of the transport around a property (tube, rail,
 * tram and buses), each with coordinates so the map can draw an on-demand
 * route to it when the user taps a chip.
 *
 * It complements, rather than replaces, `enrich-station-routes`:
 *   - `station_routes` = realistic walk/transit MINUTES to the nearest
 *     few stations (the review-card headline), Rightmove-sourced.
 *   - `nearby_transit` = every stop within a mile WITH coordinates, for
 *     the map + the commute feed filter.
 *
 * Fan-out: `clusterTask.onSuccess` triggers one run per newly-created
 * cluster (mirroring the other enrichers). Per cluster: load lat/lng,
 * call Places, fan the result onto every listing's enrichment row.
 *
 * No-ops gracefully when the cluster lacks lat/lng or has no listings,
 * and when Places returns nothing within the radius (rural / bad coords).
 */

import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { env, mapsServerKey } from "../lib/env";
import { type NearbyPlace, gatherNearbyPlaces } from "../lib/nearby-places";
import { parseNumeric, upsertEnrichmentForListings } from "./enrich-helpers";
import { scrapeQueue } from "./queues";

export type EnrichNearbyTransitPayload = {
  clusterId: string;
};

export type EnrichNearbyTransitOutput = {
  clusterId: string;
  stopsFound: number;
  listingsTouched: number;
};

type NearbyTransitContext = {
  lat: number;
  lng: number;
  listingIds: string[];
};

async function loadContext(
  db: ReturnType<typeof getDb>,
  clusterId: string,
  logSkip: (reason: string) => void
): Promise<NearbyTransitContext | null> {
  const cluster = await db.query.propertyClusters.findFirst({
    where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
  });
  if (!cluster) {
    throw new Error(`enrich-nearby-transit: cluster ${clusterId} not found`);
  }
  const lat = parseNumeric(cluster.lat);
  const lng = parseNumeric(cluster.lng);
  if (lat === null || lng === null) {
    logSkip("cluster has no lat/lng");
    return null;
  }

  const listings = await db
    .select({ id: schema.listings.id })
    .from(schema.listings)
    .where(eq(schema.listings.clusterId, clusterId));
  if (listings.length === 0) {
    logSkip("cluster has no listings");
    return null;
  }

  return { lat, lng, listingIds: listings.map((l) => l.id) };
}

export const enrichNearbyTransitTask = task({
  id: "enrich-nearby-transit",
  queue: scrapeQueue,
  maxDuration: 120,

  run: async (
    payload: EnrichNearbyTransitPayload
  ): Promise<EnrichNearbyTransitOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const { TFL_APP_KEY } = env();
    const empty = { clusterId, stopsFound: 0, listingsTouched: 0 };

    const ctx = await loadContext(db, clusterId, (reason) => {
      logger.warn(`enrich-nearby-transit: ${reason}, skipping`, { clusterId });
    });
    if (!ctx) {
      return empty;
    }

    let places: NearbyPlace[];
    try {
      places = await gatherNearbyPlaces(
        { lat: ctx.lat, lng: ctx.lng },
        { googleKey: mapsServerKey(), tflAppKey: TFL_APP_KEY }
      );
    } catch (err) {
      logger.warn("enrich-nearby-transit: Places sweep failed", {
        clusterId,
        error: err instanceof Error ? err.message : String(err),
      });
      return empty;
    }

    if (places.length === 0) {
      logger.warn("enrich-nearby-transit: no places within radius", {
        clusterId,
      });
      return empty;
    }

    const touched = await upsertEnrichmentForListings(db, ctx.listingIds, {
      nearbyTransit: places,
    });

    logger.log("enrich-nearby-transit: done", {
      clusterId,
      placesFound: places.length,
      listingsTouched: touched,
    });

    return { clusterId, stopsFound: places.length, listingsTouched: touched };
  },
});
