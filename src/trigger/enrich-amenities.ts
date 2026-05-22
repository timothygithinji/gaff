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

import { neon } from "@neondatabase/serverless";
import { logger, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { nanoid } from "nanoid";
import * as schema from "../../db/schema";
import { PROMPT_VERSION } from "../lib/ai/config";
import { env } from "../lib/env";
import { getAmenityCounts } from "../lib/overpass";
import { scrapeQueue } from "./queues";

export type EnrichAmenitiesPayload = {
  clusterId: string;
};

export type EnrichAmenitiesOutput = {
  clusterId: string;
  totalAmenities: number;
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

export const enrichAmenitiesTask = task({
  id: "enrich-amenities",
  queue: scrapeQueue,
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
          amenities,
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
          .set({ amenities })
          .where(
            and(
              eq(schema.enrichments.listingId, listingId),
              eq(schema.enrichments.promptVersion, PROMPT_VERSION)
            )
          );
      }
      touched += 1;
    }

    logger.log("enrich-amenities: done", {
      clusterId,
      totalAmenities: total,
      listingsTouched: touched,
    });

    return { clusterId, totalAmenities: total, listingsTouched: touched };
  },
});
