#!/usr/bin/env bun
/**
 * One-off AI-enrichment backfill.
 *
 * Re-fires `enrich-ai` for every listing currently in the enrichment
 * backlog (has a description, no AI summary at any prompt version). Use
 * it to drain a backlog immediately rather than waiting for the
 * `enrich-ai-sweep` schedule's next tick — e.g. right after removing the
 * old daily spend cap that had dropped listings into `daily_budget_exceeded`.
 *
 * Shares the backlog predicate with the sweep (`findEnrichmentBacklog`)
 * so the two can't disagree about what's un-enriched.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/backfill-ai-enrich.ts [--limit N] [--dry-run]
 *
 * Flags:
 *   --dry-run   Report how many listings would be re-fired; trigger nothing.
 *   --limit N   Cap the number of listings re-fired (default: all).
 */
import { tasks } from "@trigger.dev/sdk";
import { getDb } from "../db";
import { findEnrichmentBacklog } from "../src/trigger/enrich-ai-backlog";

// Trigger spreads these across enrichQueue (concurrencyLimit 15); batch
// the API calls so one trigger request doesn't carry hundreds of items.
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
  const listingIds = await findEnrichmentBacklog(db, cap);

  console.log(
    `[backfill-ai-enrich] ${listingIds.length} listing(s) in the enrichment backlog`
  );

  if (dryRun) {
    console.log("[backfill-ai-enrich] --dry-run: triggering nothing.");
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
    console.log(`[backfill-ai-enrich] re-fired ${fired}/${listingIds.length}`);
  }

  console.log(`[backfill-ai-enrich] done — ${fired} enrich-ai run(s) queued.`);
}

await main();
