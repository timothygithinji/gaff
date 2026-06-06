#!/usr/bin/env bun
/**
 * Re-enrich listings whose newest AI read predates the CURRENT
 * `PROMPT_VERSION`. Use this after a prompt/context bump (e.g. v2.1.0 →
 * v2.2.0, which added `enrichment.stationRoutes` and the transport-
 * grounding rule) to roll the improvement out to existing rows.
 *
 * This is DISTINCT from `backfill-ai-enrich.ts`: that one drains the
 * never-enriched backlog (no summary at ANY version) and deliberately
 * leaves older-version rows alone. This one targets rows that ARE
 * enriched but at a stale version, which the backlog query skips.
 *
 * ⚠️ ORDERING: the re-fired `enrich-ai` runs execute the DEPLOYED Trigger
 * task. Run this only AFTER deploying the new task code, or the runs will
 * re-write rows with the OLD prompt and nothing improves.
 *
 * Idempotent: a row already at the current version is not selected, so a
 * second run is a no-op. enrich-ai upserts on (listing_id, prompt_version)
 * so no duplicate rows are created.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/reenrich-stale-prompt.ts [--limit N] [--dry-run]
 */
import { tasks } from "@trigger.dev/sdk";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { PROMPT_VERSION } from "../src/lib/ai/config";

const TRIGGER_BATCH_SIZE = 50;

function parseArgs(argv: string[]): { dryRun: boolean; limit: number } {
  let dryRun = false;
  let limit = Number.POSITIVE_INFINITY;
  let expectingLimit = false;
  for (const arg of argv) {
    if (expectingLimit) {
      const n = Number(arg);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit needs a positive number, got "${arg}"`);
      }
      limit = n;
      expectingLimit = false;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--limit") {
      expectingLimit = true;
    }
  }
  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const db = getDb();
  const cap = Number.isFinite(limit) ? limit : 100_000;

  // Listings that have grounding text and at least one usable AI read,
  // but NONE at the current prompt version → due for a refresh.
  const rows = await db
    .select({ id: schema.listings.id })
    .from(schema.listings)
    .where(
      sql`
        (${schema.listings.rawJson} ? 'description')
        AND EXISTS (
          SELECT 1 FROM ${schema.enrichments} e
          WHERE e.listing_id = ${schema.listings.id}
            AND e.features ? 'summary'
            AND (e.features ->> 'summary') IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM ${schema.enrichments} e2
          WHERE e2.listing_id = ${schema.listings.id}
            AND e2.prompt_version = ${PROMPT_VERSION}
        )
      `
    )
    .limit(cap);

  const listingIds = rows.map((r) => r.id);
  console.log(
    `[reenrich-stale-prompt] target version ${PROMPT_VERSION}: ${listingIds.length} listing(s) on an older version`
  );

  if (dryRun) {
    console.log("[reenrich-stale-prompt] --dry-run: triggering nothing.");
    return;
  }
  if (listingIds.length === 0) {
    return;
  }

  let fired = 0;
  for (let i = 0; i < listingIds.length; i += TRIGGER_BATCH_SIZE) {
    const batch = listingIds.slice(i, i + TRIGGER_BATCH_SIZE);
    await tasks.batchTrigger(
      "enrich-ai",
      batch.map((listingId) => ({ payload: { listingId } }))
    );
    fired += batch.length;
    console.log(`[reenrich-stale-prompt] re-fired ${fired}/${listingIds.length}`);
  }
  console.log(`[reenrich-stale-prompt] done — ${fired} enrich-ai run(s) queued.`);
}

await main();
