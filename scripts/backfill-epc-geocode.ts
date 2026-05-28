#!/usr/bin/env bun
/**
 * EPC re-resolve backfill (geocode upgrade).
 *
 * `enrich-epc` now reverse-geocodes the cluster's lat/lng via Google
 * Maps to lift the match address from street-only to a real door number.
 * Houses → exact certificate match; flats → estimate scoped to a single
 * building rather than the whole postcode.
 *
 * That improvement only affects clusters processed *after* the change
 * deploys. This script re-fires `enrich-epc` for every cluster whose
 * latest enrichment row carries `epc.source = "estimate"` (the ones the
 * upgrade can move from estimate→exact or shrink the estimate sample
 * for) so we don't wait for re-clustering to see the benefit.
 *
 * Cost: one Google geocode + one EPC search per triggered cluster.
 * Geocode is ~$5/1000, EPC is free. ~106 clusters in prod today.
 *
 * Usage (prod target — the only one this backfill makes sense for):
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/backfill-epc-geocode.ts [--all] [--limit N] [--dry-run]
 *
 * Flags:
 *   --dry-run   Print how many clusters would be triggered, don't fire.
 *   --limit N   Cap the number of clusters processed (handy for smoke tests).
 *   --all       Re-fire every cluster with EPC enrichment, not just the
 *               estimate-source ones. Use after a logic change that also
 *               affects the exact-match path.
 */

import { tasks } from "@trigger.dev/sdk";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";

const BATCH_SIZE = 50;

type Args = {
  dryRun: boolean;
  limit: number | undefined;
  all: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, limit: undefined, all: false };
  // biome-ignore lint/style/useForOf: index-based parser consuming `--flag value` pairs via lookahead (argv[++i]).
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--all") {
      out.all = true;
    } else if (a === "--limit") {
      const next = argv[++i];
      if (!next) {
        throw new Error("--limit needs a value");
      }
      out.limit = Number.parseInt(next, 10);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error(
      "TRIGGER_SECRET_KEY not set — run via `doppler run ... -- bun scripts/backfill-epc-geocode.ts`"
    );
  }

  const db = getDb();
  // Distinct cluster IDs whose listings carry an EPC enrichment we want
  // to re-run. The estimate-only filter targets the cohort the geocode
  // upgrade can move — exact rows are already as good as they get
  // without a user override.
  const filter = args.all
    ? sql`${schema.enrichments.epc} IS NOT NULL`
    : sql`${schema.enrichments.epc} ->> 'source' = 'estimate'`;
  const rows = await db
    .selectDistinct({ id: schema.listings.clusterId })
    .from(schema.enrichments)
    .innerJoin(
      schema.listings,
      sql`${schema.listings.id} = ${schema.enrichments.listingId}`
    )
    .where(sql`${filter} AND ${schema.listings.clusterId} IS NOT NULL`);

  const clusterIds = rows
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));
  const limited = args.limit ? clusterIds.slice(0, args.limit) : clusterIds;
  console.log(
    `Found ${clusterIds.length} cluster(s) ${args.all ? "with EPC enrichment" : "with epc.source = estimate"}; backfilling ${limited.length}`
  );

  if (args.dryRun) {
    console.log("\n--dry-run: not triggering anything.");
    return;
  }
  if (limited.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let triggered = 0;
  for (let i = 0; i < limited.length; i += BATCH_SIZE) {
    const slice = limited.slice(i, i + BATCH_SIZE);
    const payloads = slice.map((id) => ({ payload: { clusterId: id } }));
    const handle = await tasks.batchTrigger("enrich-epc", payloads);
    triggered += slice.length;
    console.log(
      `  batch ${i / BATCH_SIZE + 1}: triggered ${slice.length} runs (batchId=${handle.batchId})`
    );
  }
  console.log(`\nDone. Triggered ${triggered} enrich-epc runs.`);
  console.log(
    "Track via the Trigger.dev dashboard — each run logs source, propertyType, and geocodedLocationType."
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
