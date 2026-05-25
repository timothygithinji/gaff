/**
 * Per-cluster flood-risk enrichment.
 *
 * Single round-trip to the Environment Agency's ArcGIS REST layer for
 * Risk of Flooding from Rivers and Sea. The layer covers England only;
 * we persist "unknown" rather than throwing for points outside the
 * dataset (Scotland/Wales/NI listings, or any geo gap).
 *
 * Fan-out: dispatched from `clusterTask.onSuccess` alongside the other
 * enrichment tasks. No-ops when the cluster has no lat/lng.
 */

import { logger, task } from "@trigger.dev/sdk";
import { getDb } from "../../db";
import { getFloodRisk } from "../lib/flood-risk";
import { parseNumeric, upsertEnrichmentForCluster } from "./enrich-helpers";
import { scrapeQueue } from "./queues";

export type EnrichFloodPayload = {
  clusterId: string;
};

export type EnrichFloodOutput = {
  clusterId: string;
  riskLevel: string;
  listingsTouched: number;
};

export const enrichFloodTask = task({
  id: "enrich-flood",
  queue: scrapeQueue,
  maxDuration: 60,

  run: async (payload: EnrichFloodPayload): Promise<EnrichFloodOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const empty = { clusterId, riskLevel: "unknown", listingsTouched: 0 };

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`enrich-flood: cluster ${clusterId} not found`);
    }
    const lat = parseNumeric(cluster.lat);
    const lng = parseNumeric(cluster.lng);
    if (lat === null || lng === null) {
      logger.warn("enrich-flood: cluster has no lat/lng, skipping", {
        clusterId,
      });
      return empty;
    }

    const flood = await getFloodRisk({ lat, lng });

    const touched = await upsertEnrichmentForCluster(db, clusterId, {
      flood,
    });

    logger.log("enrich-flood: done", {
      clusterId,
      riskLevel: flood.riskLevel,
      listingsTouched: touched,
    });

    return {
      clusterId,
      riskLevel: flood.riskLevel,
      listingsTouched: touched,
    };
  },
});
