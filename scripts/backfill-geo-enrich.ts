#!/usr/bin/env bun
/**
 * One-off geo-enrichment backfill.
 *
 * Promotes listing coords onto coordinate-less clusters, then re-fires
 * the lat/lng-gated enrichers (amenities, nearby-transit,
 * station-routes, council-tax) for every located cluster still missing
 * the amenities/nearby-transit pair. Use it to drain the backlog
 * immediately instead of waiting for the `enrich-geo-sweep` schedule.
 *
 * Supersedes `backfill-listing-coords.ts` for the re-fire step: that
 * script only re-fired amenities/council-tax and left
 * nearby-transit + station-routes (which had never run post-coords) at
 * zero. Shares the promotion + backlog query with the sweep.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/backfill-geo-enrich.ts [--limit N] [--dry-run]
 */
import { tasks } from "@trigger.dev/sdk";
import { getDb } from "../db";
import {
  GEO_SWEEP_TASK_IDS,
  findGeoBacklogClusterIds,
  promoteClusterCoords,
} from "../src/trigger/enrich-geo-backlog";

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

  if (dryRun) {
    // Don't mutate on a dry run — report the would-be backlog as-is.
    const ids = await findGeoBacklogClusterIds(
      db,
      Number.isFinite(limit) ? limit : 100_000
    );
    console.log(
      `[backfill-geo-enrich] --dry-run: ${ids.length} located cluster(s) missing the geo trio (coords NOT promoted).`
    );
    return;
  }

  const located = await promoteClusterCoords(db);
  console.log(`[backfill-geo-enrich] located ${located} previously-uncoordinated cluster(s)`);

  const clusterIds = await findGeoBacklogClusterIds(
    db,
    Number.isFinite(limit) ? limit : 100_000
  );
  console.log(
    `[backfill-geo-enrich] ${clusterIds.length} cluster(s) need geo enrichment`
  );
  if (clusterIds.length === 0) {
    return;
  }

  for (const taskId of GEO_SWEEP_TASK_IDS) {
    let fired = 0;
    for (let i = 0; i < clusterIds.length; i += TRIGGER_BATCH_SIZE) {
      const batch = clusterIds.slice(i, i + TRIGGER_BATCH_SIZE);
      await tasks.batchTrigger(
        taskId,
        batch.map((clusterId) => ({ payload: { clusterId } }))
      );
      fired += batch.length;
    }
    console.log(`[backfill-geo-enrich] re-fired ${taskId}: ${fired} runs`);
  }
  console.log("[backfill-geo-enrich] done.");
}

await main();
