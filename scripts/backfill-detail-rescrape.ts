#!/usr/bin/env bun
/**
 * Detail-scrape backfill.
 *
 * Re-fires `scrapeDetailTask` for every existing listing in the DB so
 * the new columns (`size_sq_ft`, `council_tax_band`, `published_at`,
 * `pets_accepted`) populate without waiting for natural sweep churn.
 * Also writes `scrape_runs.raw_key` for the first time on every run.
 *
 * Pre-conditions:
 *   1. Migration 0008 has been applied (the four new columns exist).
 *   2. Trigger.dev workers have been redeployed with the new parser
 *      code. If they haven't, this script still triggers — but every
 *      child run will run the OLD code and produce no new field data.
 *
 * Cost: ~$0.0004–$0.0008 per listing in Zyte fees, paid by the worker
 * runs (not this script). 59 listings ≈ $0.05 — negligible.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/backfill-detail-rescrape.ts [--limit N] [--dry-run]
 *
 * Flags:
 *   --dry-run     Print the listing IDs that would be triggered, don't fire.
 *   --limit N     Cap the number of listings re-scraped (handy for smoke tests).
 *   --search ID   Restrict to listings under a specific search.
 */

import { tasks } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";

const BATCH_SIZE = 50;

type Args = {
  dryRun: boolean;
  limit: number | undefined;
  searchId: string | undefined;
  portal: string | undefined;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    dryRun: false,
    limit: undefined,
    searchId: undefined,
    portal: undefined,
  };
  // biome-ignore lint/style/useForOf: index-based arg parser that advances `i` to consume the next token (`argv[++i]`) for `--flag value` pairs — a for-of can't express the lookahead.
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--limit") {
      const next = argv[++i];
      if (!next) {
        throw new Error("--limit needs a value");
      }
      out.limit = Number.parseInt(next, 10);
    } else if (a === "--search") {
      const next = argv[++i];
      if (!next) {
        throw new Error("--search needs an id");
      }
      out.searchId = next;
    } else if (a === "--portal") {
      const next = argv[++i];
      if (!next) {
        throw new Error("--portal needs a value");
      }
      out.portal = next;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error(
      "TRIGGER_SECRET_KEY not set — run via `doppler run ... -- bun scripts/backfill-detail-rescrape.ts`"
    );
  }

  const db = getDb();
  // Read just the columns we need so the script stays cheap on a big DB.
  const rows = await (() => {
    const conds: ReturnType<typeof eq>[] = [];
    if (args.searchId) {
      conds.push(eq(schema.listings.searchId, args.searchId));
    }
    if (args.portal) {
      conds.push(eq(schema.listings.portal, args.portal));
    }
    const q = db
      .select({ id: schema.listings.id, portal: schema.listings.portal })
      .from(schema.listings);
    if (conds.length === 0) {
      return q;
    }
    if (conds.length === 1) {
      return q.where(conds[0] as ReturnType<typeof eq>);
    }
    return q.where(and(...conds));
  })();

  const limited = args.limit ? rows.slice(0, args.limit) : rows;

  console.log(`Found ${rows.length} listings; backfilling ${limited.length}`);
  const byPortal = new Map<string, number>();
  for (const r of limited) {
    byPortal.set(r.portal, (byPortal.get(r.portal) ?? 0) + 1);
  }
  for (const [portal, n] of byPortal) {
    console.log(`  ${portal}: ${n}`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: not triggering anything.");
    return;
  }

  // Batches of BATCH_SIZE to avoid hitting Trigger.dev's per-request size cap.
  let triggered = 0;
  for (let i = 0; i < limited.length; i += BATCH_SIZE) {
    const slice = limited.slice(i, i + BATCH_SIZE);
    const payloads = slice.map((r) => ({
      payload: { listingId: r.id },
    }));
    const handle = await tasks.batchTrigger("scrape-detail", payloads);
    triggered += slice.length;
    console.log(
      `  batch ${i / BATCH_SIZE + 1}: triggered ${slice.length} runs (batchId=${handle.batchId})`
    );
  }
  console.log(`\nDone. Triggered ${triggered} scrape-detail runs.`);
  console.log(
    "Track via the Trigger.dev dashboard — onSuccess populates the new columns."
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
