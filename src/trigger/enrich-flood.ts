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

import { neon } from "@neondatabase/serverless";
import { logger, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { nanoid } from "nanoid";
import * as schema from "../../db/schema";
import { PROMPT_VERSION } from "../lib/ai/config";
import { env } from "../lib/env";
import { getFloodRisk } from "../lib/flood-risk";
import { scrapeQueue } from "./queues";

export type EnrichFloodPayload = {
  clusterId: string;
};

export type EnrichFloodOutput = {
  clusterId: string;
  riskLevel: string;
  listingsTouched: number;
};

function getDb() {
  const { DATABASE_URL } = env();
  return drizzle(neon(DATABASE_URL), { schema });
}

function parseNumeric(value: string | null): number | null {
  if (value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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

    const listings = await db
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(eq(schema.listings.clusterId, clusterId));

    let touched = 0;
    for (const { id: listingId } of listings) {
      const inserted = await db
        .insert(schema.enrichments)
        .values({
          id: nanoid(),
          listingId,
          promptVersion: PROMPT_VERSION,
          features: {},
          flood,
        })
        .onConflictDoNothing({
          target: [
            schema.enrichments.listingId,
            schema.enrichments.promptVersion,
          ],
        })
        .returning({ id: schema.enrichments.id });

      if (inserted.length === 0) {
        await db
          .update(schema.enrichments)
          .set({ flood })
          .where(
            and(
              eq(schema.enrichments.listingId, listingId),
              eq(schema.enrichments.promptVersion, PROMPT_VERSION)
            )
          );
      }
      touched += 1;
    }

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
