/**
 * Per-cluster broadband enrichment.
 *
 * Looks the cluster's postcode up against the Ofcom Connected Nations
 * coverage snapshot in `broadband_coverage` (see `src/lib/broadband.ts`).
 * Broadband availability is street-level not address-level, so the
 * postcode is the right granularity; most scraped postcodes are
 * outcode-only, and the lookup falls back to an outcode aggregate.
 *
 * Status: best-effort. When the postcode is missing from the snapshot we
 * still write a row with null fields so the UI can fall back to the AI's
 * verbatim broadband string when present.
 *
 * Fan-out: dispatched from `clusterTask.onSuccess` alongside the other
 * enrichment tasks. No-ops when the cluster has no postcode.
 */

import { logger, task } from "@trigger.dev/sdk";
import { getDb } from "../../db";
import { getBroadbandForPostcode } from "../lib/broadband";
import { upsertEnrichmentForCluster } from "./enrich-helpers";
import { enrichQueue } from "./queues";

export type EnrichBroadbandPayload = {
  clusterId: string;
};

export type EnrichBroadbandOutput = {
  clusterId: string;
  technology: string | null;
  listingsTouched: number;
};

export const enrichBroadbandTask = task({
  id: "enrich-broadband",
  queue: enrichQueue,
  maxDuration: 60,

  run: async (
    payload: EnrichBroadbandPayload
  ): Promise<EnrichBroadbandOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const empty = {
      clusterId,
      technology: null,
      listingsTouched: 0,
    };

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`enrich-broadband: cluster ${clusterId} not found`);
    }
    if (!cluster.postcode) {
      logger.warn("enrich-broadband: cluster has no postcode, skipping", {
        clusterId,
      });
      return empty;
    }

    const broadband = await getBroadbandForPostcode(db, cluster.postcode);

    if (broadband.technology === null) {
      logger.warn(
        "enrich-broadband: postcode not in Ofcom snapshot, writing nulls",
        { clusterId, postcode: cluster.postcode }
      );
    }

    const touched = await upsertEnrichmentForCluster(db, clusterId, {
      broadband,
    });

    logger.log("enrich-broadband: done", {
      clusterId,
      technology: broadband.technology,
      downloadMbps: broadband.downloadMbps,
      listingsTouched: touched,
    });

    return {
      clusterId,
      technology: broadband.technology,
      listingsTouched: touched,
    };
  },
});
