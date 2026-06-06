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
import { env, mapsServerKey, mapsServerReferer } from "../lib/env";
import { computeRoute } from "../lib/google-routes";
import { type NearbyPlace, gatherNearbyPlaces } from "../lib/nearby-places";
import { parseNumeric, upsertEnrichmentForListings } from "./enrich-helpers";
import { enrichQueue } from "./queues";

/**
 * Station kinds the transport filter matches on. We compute real routed
 * walk minutes for the nearest few of each so the queue stops guessing
 * from straight-line distance; bus/non-station kinds keep the heuristic
 * (they're always close, and routing every stop would be wasteful).
 */
const WALK_STATION_KINDS = new Set(["tube", "rail", "tram"]);
/** Nearest N stops per station kind to route — cheap, and the 2nd-nearest
 * covers the case where the straight-line nearest has an awkward walk. */
const WALK_ROUTES_PER_KIND = 2;

/**
 * Mutate `places`, stamping `walkMinutes` (Google Routes WALK) onto the
 * nearest {@link WALK_ROUTES_PER_KIND} stops of each station kind. A
 * single failed route leaves that stop's `walkMinutes` unset so the
 * filter falls back to the distance heuristic for it — one bad route
 * shouldn't sink the cluster.
 */
async function attachWalkMinutes(
  places: NearbyPlace[],
  origin: { lat: number; lng: number },
  apiKey: string,
  referer: string,
  clusterId: string
): Promise<void> {
  // Group station stops by kind, then keep the nearest few of each as
  // direct references — mutating a reference updates the array element.
  const byKind = new Map<string, NearbyPlace[]>();
  for (const place of places) {
    if (place.kind && WALK_STATION_KINDS.has(place.kind)) {
      const arr = byKind.get(place.kind) ?? [];
      arr.push(place);
      byKind.set(place.kind, arr);
    }
  }

  const targets: NearbyPlace[] = [];
  for (const arr of byKind.values()) {
    arr.sort((a, b) => a.distanceMiles - b.distanceMiles);
    targets.push(...arr.slice(0, WALK_ROUTES_PER_KIND));
  }

  await Promise.all(
    targets.map(async (place) => {
      try {
        const r = await computeRoute({
          apiKey,
          referer,
          origin,
          destination: { lat: place.lat, lng: place.lng },
          travelMode: "WALK",
        });
        place.walkMinutes = Math.round(r.durationSeconds / 60);
      } catch (err) {
        logger.warn("enrich-nearby-transit: walk route failed", {
          clusterId,
          station: place.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );
}

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
  queue: enrichQueue,
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

    // A thrown sweep means the upstream API failed (auth, quota, outage)
    // — NOT "no places here". Let it propagate so the run fails visibly
    // and Trigger retries, instead of silently stamping an empty result
    // and reporting success. (This is exactly how a referrer-restricted
    // GOOGLE_MAPS_API_KEY used server-side hid for so long: 403 →
    // swallowed → green.) A genuinely empty area still returns [] below.
    const places: NearbyPlace[] = await gatherNearbyPlaces(
      { lat: ctx.lat, lng: ctx.lng },
      {
        googleKey: mapsServerKey(),
        googleHeaders: { Referer: mapsServerReferer() },
        tflAppKey: TFL_APP_KEY,
      }
    );

    if (places.length === 0) {
      logger.warn("enrich-nearby-transit: no places within radius", {
        clusterId,
      });
      return empty;
    }

    // Stamp real routed walk minutes onto the nearest station stops so the
    // transport filter matches on Google time, not a straight-line guess.
    await attachWalkMinutes(
      places,
      { lat: ctx.lat, lng: ctx.lng },
      mapsServerKey(),
      mapsServerReferer(),
      clusterId
    );

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
