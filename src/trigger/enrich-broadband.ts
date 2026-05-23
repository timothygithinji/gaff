/**
 * Per-cluster broadband enrichment.
 *
 * Calls BT Wholesale's availability API via Zyte (see `src/lib/broadband.ts`
 * for the proxy reasoning). Keyed on the cluster's postcode — broadband
 * availability is street-level not address-level, so the postcode is
 * the right granularity.
 *
 * Status: best-effort. BT's undocumented API is brittle; on parse
 * failure we still write a row with null fields so the UI can fall back
 * to the AI's verbatim broadband string when present.
 *
 * Fan-out: dispatched from `clusterTask.onSuccess` alongside the other
 * enrichment tasks. No-ops when the cluster has no postcode.
 */

import { logger, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { PROMPT_VERSION } from "../lib/ai/config";
import { getBroadband } from "../lib/broadband";
import { scrapeQueue } from "./queues";

export type EnrichBroadbandPayload = {
  clusterId: string;
};

export type EnrichBroadbandOutput = {
  clusterId: string;
  technology: string | null;
  listingsTouched: number;
};

function getZyteKey(): string {
  const key = process.env.ZYTE_API_KEY;
  if (!key) {
    throw new Error("ZYTE_API_KEY not set in the Trigger.dev worker env");
  }
  return key;
}

export const enrichBroadbandTask = task({
  id: "enrich-broadband",
  queue: scrapeQueue,
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

    const broadband = await getBroadband({
      zyteApiKey: getZyteKey(),
      postcode: cluster.postcode,
    });

    if (broadband.technology === null) {
      logger.warn(
        "enrich-broadband: BT returned no usable products, writing nulls",
        { clusterId, postcode: cluster.postcode }
      );
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
          broadband,
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
          .set({ broadband })
          .where(
            and(
              eq(schema.enrichments.listingId, listingId),
              eq(schema.enrichments.promptVersion, PROMPT_VERSION)
            )
          );
      }
      touched += 1;
    }

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
