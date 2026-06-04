#!/usr/bin/env bun
/**
 * One-off backfill for `enrichments.broadband`. Runs the same Ofcom
 * coverage lookup as `src/trigger/enrich-broadband.ts`, but as a script
 * so we can populate existing clusters without waiting on the worker.
 *
 * Requires `broadband_coverage` to be loaded first — see
 * `scripts/load-ofcom-broadband.ts`.
 *
 * Usage (resolves the per-branch Neon DB via neon-env):
 *   doppler run --project gaff --config dev --scope ~/.t-stack/orgs/timothygithinji -- \
 *     bun scripts/neon-env.ts bun scripts/backfill-broadband.ts [clusterId] [--all]
 *
 * Pass a single clusterId to backfill just that cluster; omit to do every
 * cluster with a postcode that doesn't already have broadband. `--all`
 * re-does every cluster with a postcode.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getBroadbandForPostcode } from "../src/lib/broadband";
import { upsertEnrichmentForCluster } from "../src/trigger/enrich-helpers";

async function main() {
  const db = getDb();
  const force = process.argv.includes("--all");
  const onlyCluster = process.argv.slice(2).find((a) => !a.startsWith("--"));

  let rows: Awaited<ReturnType<typeof db.execute>>;
  if (onlyCluster) {
    rows = await db.execute(sql`
      select id, postcode from property_clusters
      where id = ${onlyCluster} and postcode is not null
    `);
  } else if (force) {
    rows = await db.execute(sql`
      select id, postcode from property_clusters
      where postcode is not null
      order by id
    `);
  } else {
    // Clusters with a postcode that have no broadband on any listing yet.
    rows = await db.execute(sql`
      select pc.id, pc.postcode
      from property_clusters pc
      where pc.postcode is not null
        and not exists (
          select 1 from listings l
          join enrichments e on e.listing_id = l.id
          where l.cluster_id = pc.id and e.broadband is not null
        )
      order by pc.id
    `);
  }

  const clusters = (rows.rows ?? rows) as Array<{
    id: string;
    postcode: string;
  }>;
  console.log(`[backfill-broadband] ${clusters.length} cluster(s) to process`);

  let written = 0;
  let empty = 0;
  let skipped = 0;
  let done = 0;
  for (const c of clusters) {
    try {
      const broadband = await getBroadbandForPostcode(db, c.postcode);
      const touched = await upsertEnrichmentForCluster(db, c.id, { broadband });
      if (touched === 0) {
        skipped += 1;
      } else if (broadband.technology === null) {
        empty += 1;
      } else {
        written += 1;
      }
      done += 1;
      console.log(
        `[backfill-broadband] ${done}/${clusters.length} ${c.id} ${c.postcode} → ${
          broadband.technology ?? "—"
        } ${broadband.downloadMbps ?? ""}${broadband.downloadMbps ? "Mbps" : ""} (${touched} listings)`
      );
    } catch (err) {
      skipped += 1;
      console.warn(
        `[backfill-broadband] ${c.id} failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  console.log(
    `[backfill-broadband] done — ${written} populated, ${empty} no-coverage, ${skipped} skipped, ${clusters.length} total`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-broadband] fatal", err);
  process.exit(1);
});
