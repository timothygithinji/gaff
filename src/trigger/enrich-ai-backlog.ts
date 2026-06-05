/**
 * The "needs an AI read" backlog query, shared by the recurring
 * `enrich-ai-sweep` schedule and the one-off `backfill-ai-enrich` script
 * so the two can never drift on what counts as un-enriched.
 *
 * A listing is in the backlog when it has grounding text (`rawJson`
 * carries a `description` — without it `enrich-ai` can only fail with
 * `missing_listing_detail`) but no enrichment row at ANY prompt version
 * carries a non-null `features.summary`. "Any version" is deliberate: a
 * row enriched under an older prompt still renders highlights in the UI
 * (the read-time `feature-filter` keeps old rows useful), so re-running
 * it would spend a call to replace a perfectly good read.
 */
import { sql } from "drizzle-orm";
import type { getDb } from "../../db";
import * as schema from "../../db/schema";

type Db = ReturnType<typeof getDb>;

export async function findEnrichmentBacklog(
  db: Db,
  limit: number
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.listings.id })
    .from(schema.listings)
    .where(
      sql`
        (${schema.listings.rawJson} ? 'description')
        AND NOT EXISTS (
          SELECT 1
          FROM ${schema.enrichments} e
          WHERE e.listing_id = ${schema.listings.id}
            AND e.features ? 'summary'
            AND (e.features ->> 'summary') IS NOT NULL
        )
      `
    )
    .limit(limit);
  return rows.map((r) => r.id);
}
