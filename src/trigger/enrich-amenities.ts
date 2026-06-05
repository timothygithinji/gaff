/**
 * Per-cluster amenity enrichment via Overpass / OpenStreetMap.
 *
 * One Overpass round-trip per cluster (500 m radius by default).
 * Counts are bucketed by category and stored alongside the cluster's
 * listings as `enrichments.amenities`.
 *
 * Fan-out: dispatched alongside the other enrichment tasks from
 * `clusterTask.onSuccess`. No-ops when the cluster has no lat/lng.
 */

import { logger, task } from "@trigger.dev/sdk";
import { getDb } from "../../db";
import { getAmenityCounts } from "../lib/overpass";
import { parseNumeric, upsertEnrichmentForCluster } from "./enrich-helpers";
import { enrichQueue } from "./queues";

export type EnrichAmenitiesPayload = {
  clusterId: string;
};

export type EnrichAmenitiesOutput = {
  clusterId: string;
  totalAmenities: number;
  listingsTouched: number;
};

export const enrichAmenitiesTask = task({
  id: "enrich-amenities",
  queue: enrichQueue,
  maxDuration: 60,

  run: async (
    payload: EnrichAmenitiesPayload
  ): Promise<EnrichAmenitiesOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const empty = { clusterId, totalAmenities: 0, listingsTouched: 0 };

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`enrich-amenities: cluster ${clusterId} not found`);
    }
    const lat = parseNumeric(cluster.lat);
    const lng = parseNumeric(cluster.lng);
    if (lat === null || lng === null) {
      logger.warn("enrich-amenities: cluster has no lat/lng, skipping", {
        clusterId,
      });
      return empty;
    }

    const amenities = await getAmenityCounts({ lat, lng });
    const total = Object.values(amenities.counts).reduce((a, b) => a + b, 0);

    const touched = await upsertEnrichmentForCluster(db, clusterId, {
      amenities,
    });

    logger.log("enrich-amenities: done", {
      clusterId,
      totalAmenities: total,
      listingsTouched: touched,
    });

    return { clusterId, totalAmenities: total, listingsTouched: touched };
  },
});
