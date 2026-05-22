/**
 * Per-cluster crime enrichment.
 *
 * Hits data.police.uk's `crimes-street/all-crime` endpoint for the
 * cluster's lat/lng. Crime data is per-month and lags ~2 months — we
 * query "default" (latest available) and record the month label on
 * the resulting row so the UI can show "data as of March 2026" rather
 * than implying it's current.
 *
 * Fan-out: dispatched alongside enrich-epc / enrich-commute from
 * `clusterTask.onSuccess`. No-ops when the cluster has no lat/lng or
 * when the API returns no records (rural areas, very recent months).
 */

import { neon } from "@neondatabase/serverless";
import { logger, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { nanoid } from "nanoid";
import * as schema from "../../db/schema";
import { PROMPT_VERSION } from "../lib/ai/config";
import { env } from "../lib/env";
import { getCrimeAggregate } from "../lib/police-uk";
import { scrapeQueue } from "./queues";

export type EnrichCrimePayload = {
  clusterId: string;
};

export type EnrichCrimeOutput = {
  clusterId: string;
  total: number;
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

export const enrichCrimeTask = task({
  id: "enrich-crime",
  queue: scrapeQueue,
  maxDuration: 60,

  run: async (payload: EnrichCrimePayload): Promise<EnrichCrimeOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const empty = { clusterId, total: 0, listingsTouched: 0 };

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`enrich-crime: cluster ${clusterId} not found`);
    }
    const lat = parseNumeric(cluster.lat);
    const lng = parseNumeric(cluster.lng);
    if (lat === null || lng === null) {
      logger.warn("enrich-crime: cluster has no lat/lng, skipping", {
        clusterId,
      });
      return empty;
    }

    const aggregate = await getCrimeAggregate({ lat, lng });
    if (!aggregate) {
      logger.log("enrich-crime: no crime records for cluster area, skipping", {
        clusterId,
        lat,
        lng,
      });
      return empty;
    }

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
          crime: aggregate,
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
          .set({ crime: aggregate })
          .where(
            and(
              eq(schema.enrichments.listingId, listingId),
              eq(schema.enrichments.promptVersion, PROMPT_VERSION)
            )
          );
      }
      touched += 1;
    }

    logger.log("enrich-crime: done", {
      clusterId,
      month: aggregate.month,
      total: aggregate.total,
      listingsTouched: touched,
    });

    return {
      clusterId,
      total: aggregate.total,
      listingsTouched: touched,
    };
  },
});
