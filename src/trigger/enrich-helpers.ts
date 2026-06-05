/**
 * Shared helpers for the per-cluster enrichment tasks.
 *
 * Every enrichment task (amenities, broadband, commute, epc,
 * flood) fetches its data once per cluster, then fans the result out
 * onto each listing's `enrichments` row. That fan-out is identical
 * across tasks — only the column being written differs — so the upsert
 * lives here. The `numeric`-column coercion is shared for the same
 * reason.
 */
import { logger } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { getDb } from "../../db";
import * as schema from "../../db/schema";
import { PROMPT_VERSION } from "../lib/ai/config";

type Db = ReturnType<typeof getDb>;

/** A subset of `enrichments` columns to write — e.g. `{ flood }`. */
type EnrichmentPatch = Partial<typeof schema.enrichments.$inferInsert>;

/**
 * Convert a possibly-null drizzle `numeric` column to a number, or
 * null. `numeric` columns come back as strings to preserve precision;
 * the enrichment tasks only need approximate lat/lng math, so `Number()`
 * is fine.
 */
export function parseNumeric(value: string | null): number | null {
  if (value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Two-step UPSERT per listing: INSERT with ON CONFLICT DO NOTHING, then
 * UPDATE just the patched column(s) when a row already existed (the AI
 * task may have written `features` first). This preserves the other
 * side's payload and avoids a no-op write when neither has run yet.
 * Returns the number of listings touched.
 */
export async function upsertEnrichmentForListings(
  db: Db,
  listingIds: string[],
  patch: EnrichmentPatch
): Promise<number> {
  let touched = 0;
  for (const listingId of listingIds) {
    try {
      const inserted = await db
        .insert(schema.enrichments)
        .values({
          id: nanoid(),
          listingId,
          promptVersion: PROMPT_VERSION,
          features: {},
          ...patch,
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
          .set(patch)
          .where(
            and(
              eq(schema.enrichments.listingId, listingId),
              eq(schema.enrichments.promptVersion, PROMPT_VERSION)
            )
          );
      }
    } catch (err) {
      // The neon-http driver rethrows as a generic `Failed query: <sql>`
      // and strips the underlying error, so prod failures are a black box.
      // Surface the real cause (rate-limit / timeout / Postgres error)
      // before letting the task retry on it.
      logger.error("enrich-helpers: enrichment write failed", {
        listingId,
        columns: Object.keys(patch),
        cause:
          (err as { cause?: unknown }).cause ??
          (err as { sourceError?: unknown }).sourceError ??
          null,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    touched += 1;
  }
  return touched;
}

/**
 * Load every listing in a cluster and apply `patch` to each one's
 * enrichment row. For the lat/lng- and postcode-keyed tasks that don't
 * already have a listing-id list in hand. We touch listings, not the
 * cluster, because `enrichments` is per-listing.
 */
export async function upsertEnrichmentForCluster(
  db: Db,
  clusterId: string,
  patch: EnrichmentPatch
): Promise<number> {
  const listings = await db
    .select({ id: schema.listings.id })
    .from(schema.listings)
    .where(eq(schema.listings.clusterId, clusterId));
  return upsertEnrichmentForListings(
    db,
    listings.map((l) => l.id),
    patch
  );
}
