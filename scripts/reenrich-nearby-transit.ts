#!/usr/bin/env bun
/**
 * Re-fire `enrich-nearby-transit` for every cluster in the review queue's
 * candidate pool (clustered listings under an active search), so the fixed
 * `classifyKind` (bare `transit_station` no longer becomes fake "rail")
 * re-writes `nearby_transit` and the queue's station-time filter sees real
 * Google-routed walk times instead of mislabelled 0.03mi "rail" stops.
 *
 * Pre-condition: Trigger workers redeployed with the classifyKind fix
 * (prod worker >= 20260606.3) — otherwise child runs run the OLD code.
 *
 * Cost: Google Places (a few sweeps) + Routes per cluster, paid by the
 * worker runs. ~225 clusters.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/reenrich-nearby-transit.ts [--apply]
 */
import { tasks } from "@trigger.dev/sdk";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 50;

async function main(): Promise<void> {
  if (APPLY && !process.env.TRIGGER_SECRET_KEY) {
    throw new Error(
      "TRIGGER_SECRET_KEY not set — run via `doppler run --project gaff --config prd ... -- bun scripts/reenrich-nearby-transit.ts --apply`"
    );
  }
  const db = getDb();

  const rows = await db
    .selectDistinct({ clusterId: schema.listings.clusterId })
    .from(schema.listings)
    .innerJoin(schema.searches, eq(schema.listings.searchId, schema.searches.id))
    .where(
      and(
        isNotNull(schema.listings.clusterId),
        eq(schema.searches.active, true)
      )
    );
  const clusterIds = rows
    .map((r) => r.clusterId)
    .filter((id): id is string => Boolean(id));

  console.log(`Candidate clusters to re-enrich: ${clusterIds.length}`);
  if (!APPLY) {
    console.log("\n--dry-run (default): not triggering. Re-run with --apply.");
    return;
  }

  let triggered = 0;
  for (let i = 0; i < clusterIds.length; i += BATCH_SIZE) {
    const slice = clusterIds.slice(i, i + BATCH_SIZE);
    const handle = await tasks.batchTrigger(
      "enrich-nearby-transit",
      slice.map((clusterId) => ({ payload: { clusterId } }))
    );
    triggered += slice.length;
    console.log(
      `  batch ${i / BATCH_SIZE + 1}: ${slice.length} runs (batchId=${handle.batchId})`
    );
  }
  console.log(`\nDone. Triggered ${triggered} enrich-nearby-transit runs.`);
  console.log("Track via the Trigger.dev dashboard (prod).");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
