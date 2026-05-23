/**
 * Per-cluster EPC (Energy Performance Certificate) enrichment.
 *
 * Fires fire-and-forget from `clusterTask.onSuccess` for every newly
 * created cluster. EPC data is keyed on UK postcode, so one query per
 * cluster — not per listing — keeps API usage proportional to the
 * unique buildings we see rather than the cross-portal duplicates.
 *
 * Flow per cluster:
 *
 *   1. Load `property_clusters` row. If `postcode` is null, skip — the
 *      EPC search endpoint requires at least a postcode.
 *   2. Call the typed EPC client's `/domestic/search?postcode=...`
 *      endpoint. If zero results, skip silently (the postcode is in a
 *      building the EPC dataset hasn't got a record for, e.g. very new
 *      build or commercial unit).
 *   3. If multiple results, pick the one whose lat/lng is closest to
 *      the cluster's lat/lng. Falls back to the first row when either
 *      side has no coordinates.
 *   4. For every listing in the cluster, UPSERT an `enrichments` row:
 *      - row exists at `(listing_id, current promptVersion)` → UPDATE
 *        the `epc` column only, leaving `features` untouched.
 *      - row doesn't exist → INSERT with `features={}` (a valid empty
 *        object) and the EPC blob populated. The AI enrichment task
 *        will fill in `features` later via ON CONFLICT DO NOTHING.
 *
 * No AI cost — this path doesn't count against the daily budget. The
 * EPC API is free (with attribution); the only consumption is a single
 * external request per new cluster.
 */

import { logger, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { PROMPT_VERSION } from "../lib/ai/config";
import {
  type Certificate,
  createEpcClient,
  getDomesticSearch,
} from "../lib/api-clients/epc";
import { env } from "../lib/env";
import { scrapeQueue } from "./queues";

export type EnrichEpcPayload = {
  clusterId: string;
};

export type EnrichEpcOutput = {
  clusterId: string;
  certificateFound: boolean;
  listingsTouched: number;
};

/**
 * Convert a possibly-null `numeric` column value to a number, or null.
 * drizzle's `numeric` columns come back as strings to preserve
 * precision; we only need approximate distance comparisons here so
 * Number() is fine.
 */
function parseNumeric(value: string | null): number | null {
  if (value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pick the certificate whose lat/lng is closest to the cluster's
 * lat/lng. Uses a flat Euclidean distance on raw degrees — accurate
 * enough at UK latitudes to pick between certificates within a single
 * postcode. Falls back to the first certificate if either side lacks
 * coordinates.
 *
 * The EPC dataset's lat/lng fields aren't part of the strongly-typed
 * shape (`Certificate` is `{ [key: string]: unknown }` in the
 * generated SDK), so we sniff the well-known field names defensively.
 */
function pickClosestCertificate(
  certs: Certificate[],
  clusterLat: number | null,
  clusterLng: number | null
): Certificate | null {
  if (certs.length === 0) {
    return null;
  }
  if (certs.length === 1) {
    return certs[0] ?? null;
  }
  if (clusterLat == null || clusterLng == null) {
    return certs[0] ?? null;
  }

  let best: Certificate | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const cert of certs) {
    const lat = Number(cert.latitude ?? cert.lat);
    const lng = Number(cert.longitude ?? cert.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    const dLat = lat - clusterLat;
    const dLng = lng - clusterLng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = cert;
    }
  }
  return best ?? certs[0] ?? null;
}

export const enrichEpcTask = task({
  id: "enrich-epc",
  queue: scrapeQueue,
  maxDuration: 60,

  run: async (payload: EnrichEpcPayload): Promise<EnrichEpcOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const { EPC_OPENDATA_TOKEN } = env();

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`enrich-epc: cluster ${clusterId} not found`);
    }
    if (!cluster.postcode) {
      logger.warn("enrich-epc: cluster has no postcode, skipping", {
        clusterId,
      });
      return { clusterId, certificateFound: false, listingsTouched: 0 };
    }

    const epc = createEpcClient({ token: EPC_OPENDATA_TOKEN });
    const search = await getDomesticSearch({
      client: epc,
      query: { postcode: cluster.postcode, size: 25 },
    });
    if (search.error) {
      const message =
        typeof search.error === "object" &&
        search.error !== null &&
        "message" in search.error
          ? String((search.error as { message: unknown }).message)
          : JSON.stringify(search.error);
      throw new Error(`enrich-epc: EPC search failed: ${message}`);
    }
    const certs = search.data ?? [];

    const clusterLat = parseNumeric(cluster.lat);
    const clusterLng = parseNumeric(cluster.lng);
    const cert = pickClosestCertificate(certs, clusterLat, clusterLng);

    if (!cert) {
      logger.warn("enrich-epc: no certificates for postcode", {
        clusterId,
        postcode: cluster.postcode,
      });
      return { clusterId, certificateFound: false, listingsTouched: 0 };
    }

    // Load every listing in this cluster so we can write the EPC blob
    // onto each. We touch listings, not the cluster, because
    // `enrichments` is per-listing (cluster-level enrichment would
    // require a separate column on property_clusters which the schema
    // deliberately doesn't have).
    const listings = await db
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(eq(schema.listings.clusterId, clusterId));

    let touched = 0;
    for (const { id: listingId } of listings) {
      // Two-step UPSERT: try INSERT first with ON CONFLICT DO NOTHING.
      // If a row already exists at this prompt version (AI enrichment
      // got there first), we then UPDATE just the `epc` column. This
      // preserves any `features` payload the AI task wrote and avoids
      // a no-op write when neither side has run yet.
      const inserted = await db
        .insert(schema.enrichments)
        .values({
          id: nanoid(),
          listingId,
          promptVersion: PROMPT_VERSION,
          features: {},
          epc: cert,
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
          .set({ epc: cert })
          .where(
            and(
              eq(schema.enrichments.listingId, listingId),
              eq(schema.enrichments.promptVersion, PROMPT_VERSION)
            )
          );
      }
      touched += 1;
    }

    logger.log("enrich-epc: done", {
      clusterId,
      postcode: cluster.postcode,
      certificateFound: true,
      listingsTouched: touched,
    });

    return {
      clusterId,
      certificateFound: true,
      listingsTouched: touched,
    };
  },
});
