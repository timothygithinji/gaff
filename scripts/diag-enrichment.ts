#!/usr/bin/env bun
/**
 * One-off prod diagnostic: why are listings still un-enriched?
 *
 * Reports the AI-enrichment coverage across listings and the failure
 * breakdown of ai_runs, so we can tell whether the gap is budget caps,
 * missing rawJson, or never-fired tasks.
 *
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/diag-enrichment.ts
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";

const PROMPT_VERSION = "v2.1.0";

const db = getDb();

async function q(label: string, query: ReturnType<typeof sql>) {
  const rows = await db.execute(query);
  console.log(`\n## ${label}`);
  console.table(rows.rows ?? rows);
}

// 1. Listing totals
await q(
  "Listings overview",
  sql`
    SELECT
      COUNT(*)                                            AS total_listings,
      COUNT(*) FILTER (WHERE cluster_id IS NOT NULL)      AS clustered,
      COUNT(*) FILTER (WHERE status = 'active')           AS active,
      COUNT(*) FILTER (WHERE raw_json ? 'description')    AS has_description,
      COUNT(*) FILTER (WHERE lat IS NULL OR lng IS NULL)  AS missing_coords
    FROM listings
  `
);

// 2. AI enrichment coverage (features.summary populated at current version)
await q(
  "AI enrichment coverage (current prompt version)",
  sql`
    SELECT
      COUNT(DISTINCT l.id)                                                       AS total_listings,
      COUNT(DISTINCT e.listing_id)                                               AS has_enrichment_row_any_ver,
      COUNT(DISTINCT e.listing_id) FILTER (WHERE e.prompt_version = ${PROMPT_VERSION}) AS row_current_ver,
      COUNT(DISTINCT e.listing_id) FILTER (
        WHERE e.features ? 'summary' AND (e.features ->> 'summary') IS NOT NULL
      )                                                                          AS has_ai_summary_any_ver
    FROM listings l
    LEFT JOIN enrichments e ON e.listing_id = l.id
  `
);

// 3. ai_runs breakdown by status + error
await q(
  "ai_runs by status / error",
  sql`
    SELECT status, COALESCE(error_message, '(none)') AS error, COUNT(*) AS n
    FROM ai_runs
    GROUP BY status, error_message
    ORDER BY n DESC
  `
);

// 4. ai_runs over time (per UTC day) + budget-skip count
await q(
  "ai_runs per UTC day (last 14)",
  sql`
    SELECT
      date_trunc('day', started_at AT TIME ZONE 'UTC')::date AS day,
      COUNT(*)                                                       AS runs,
      COUNT(*) FILTER (WHERE status = 'success')                     AS success,
      COUNT(*) FILTER (WHERE error_message = 'daily_budget_exceeded') AS budget_skipped,
      COUNT(*) FILTER (WHERE status = 'failure' AND error_message <> 'daily_budget_exceeded') AS other_failures,
      ROUND(SUM(cost_usd)::numeric, 4)                              AS spend_usd
    FROM ai_runs
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 14
  `
);

// 5. Listings with NO ai_run at all (never fired)
await q(
  "Listings never AI-enriched, by whether they have a description",
  sql`
    SELECT
      (l.raw_json ? 'description') AS has_description,
      COUNT(*)                     AS listings_without_any_ai_run
    FROM listings l
    WHERE NOT EXISTS (SELECT 1 FROM ai_runs r WHERE r.listing_id = l.id)
    GROUP BY 1
  `
);

// 6. Listings whose ONLY ai_run outcome was budget_skip / failure (no success ever)
await q(
  "Listings tried but never succeeded (latest failure reason)",
  sql`
    WITH per AS (
      SELECT listing_id,
             bool_or(status = 'success') AS ever_succeeded,
             COUNT(*)                     AS attempts
      FROM ai_runs
      GROUP BY listing_id
    )
    SELECT COUNT(*) AS listings_tried_never_succeeded
    FROM per
    WHERE NOT ever_succeeded
  `
);

console.log("\nDone.");
