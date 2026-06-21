#!/usr/bin/env bun
/**
 * Council tax authority backfill.
 *
 * `enrich-council-tax` only fires for clusters created after it shipped
 * (fanned out from `clusterTask.onSuccess`). This script fires it for
 * EXISTING clusters so their `council_tax_authority_code` populates
 * without waiting for the building to be re-clustered — which then lets
 * the listing-detail screen show the estimated annual bill (once
 * `council_tax_rates` is seeded; see `seed-council-tax.ts`).
 *
 * By default it only targets clusters that have a postcode but no
 * authority code yet, so re-runs are cheap and idempotent. `--all`
 * re-resolves every cluster with a postcode (e.g. after a boundary
 * change).
 *
 * Cost: one postcodes.io lookup per cluster — free, fast, no AI budget.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/<org> \
 *     -- bun scripts/neon-env.ts bun scripts/backfill-council-tax-authority.ts [--all] [--limit N] [--dry-run]
 *
 * Flags:
 *   --dry-run   Print how many clusters would be triggered, don't fire.
 *   --limit N   Cap the number of clusters processed (handy for smoke tests).
 *   --all       Include clusters that already have an authority code.
 */

import { tasks } from "@trigger.dev/sdk";
import { and, isNotNull, isNull, or } from "drizzle-orm";
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
      "TRIGGER_SECRET_KEY not set — run via `doppler run ... -- bun scripts/backfill-council-tax-authority.ts`"
    );
  }

  const db = getDb();
  // The task resolves from a full postcode OR lat/lng, so require at
  // least one of those (it no-ops without any location). Unless --all,
  // skip clusters that already carry an authority code.
  const hasLocation = or(
    isNotNull(schema.propertyClusters.postcode),
    isNotNull(schema.propertyClusters.lat)
  );
  const where = args.all
    ? hasLocation
    : and(
        hasLocation,
        isNull(schema.propertyClusters.councilTaxAuthorityCode)
      );
  const rows = await db
    .select({ id: schema.propertyClusters.id })
    .from(schema.propertyClusters)
    .where(where);

  const limited = args.limit ? rows.slice(0, args.limit) : rows;
  console.log(
    `Found ${rows.length} cluster(s) ${args.all ? "with a location" : "needing an authority code"}; backfilling ${limited.length}`
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
    const payloads = slice.map((r) => ({ payload: { clusterId: r.id } }));
    const handle = await tasks.batchTrigger("enrich-council-tax", payloads);
    triggered += slice.length;
    console.log(
      `  batch ${i / BATCH_SIZE + 1}: triggered ${slice.length} runs (batchId=${handle.batchId})`
    );
  }
  console.log(`\nDone. Triggered ${triggered} enrich-council-tax runs.`);
  console.log(
    "Track via the Trigger.dev dashboard — each run stamps the cluster's billing authority."
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
