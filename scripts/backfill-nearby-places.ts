#!/usr/bin/env bun
/**
 * One-off backfill for `enrichments.nearby_transit` (the detail page's
 * "what's nearby" POIs). Runs the same Google Places + TfL sweep as
 * `src/trigger/enrich-nearby-transit.ts`, but as a script so we can
 * populate existing clusters without waiting for the trigger.dev worker.
 *
 * Uses the server Maps key (`mapsServerKey()` → GOOGLE_MAPS_SERVER_KEY,
 * falling back to the browser key) so the Google calls work off-browser.
 *
 * Usage (resolves the per-branch Neon DB via neon-env):
 *   doppler run --project gaff --config dev --scope <scope> -- \
 *     bun scripts/neon-env.ts bun scripts/backfill-nearby-places.ts [clusterId] [--all] [--tfl-only]
 *
 * Pass a single clusterId to backfill just that cluster; omit to do every
 * geocoded cluster that doesn't already have nearby_transit. `--all`
 * re-sweeps every geocoded cluster; `--tfl-only` keeps the stored Google
 * POIs and only (re)attaches TfL station modes (no paid Google calls).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { env, mapsServerKey } from "../src/lib/env";
import type { NearbyPlace } from "../src/lib/google-places";
import {
  fetchTflBusStops,
  fetchTflStations,
  gatherNearbyPlaces,
  mergeTflBusStops,
  mergeTflStations,
} from "../src/lib/nearby-places";
import { upsertEnrichmentForListings } from "../src/trigger/enrich-helpers";

/** Stay under TfL's ~50 req/min anonymous cap between clusters. */
const THROTTLE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Load the cluster's already-stored nearby_transit (any one listing's). */
async function loadExistingNearby(
  db: ReturnType<typeof getDb>,
  clusterId: string
): Promise<NearbyPlace[] | null> {
  const r = await db.execute(sql`
    select e.nearby_transit as nearby
    from enrichments e
    join listings l on l.id = e.listing_id
    where l.cluster_id = ${clusterId} and e.nearby_transit is not null
    limit 1
  `);
  const row = (r.rows ?? r)[0] as { nearby?: unknown } | undefined;
  const arr = row?.nearby;
  return Array.isArray(arr) ? (arr as NearbyPlace[]) : null;
}

async function main() {
  const db = getDb();
  const googleKey = mapsServerKey();
  const { TFL_APP_KEY } = env();
  // --tfl-only: keep the stored Google POIs, just splice in TfL stations
  // (no paid Google calls). --all: full re-sweep of every geocoded cluster.
  const tflOnly = process.argv.includes("--tfl-only");
  const force = process.argv.includes("--all") || tflOnly;
  const onlyCluster = process.argv.slice(2).find((a) => !a.startsWith("--"));

  let rows: Awaited<ReturnType<typeof db.execute>>;
  if (onlyCluster) {
    rows = await db.execute(sql`
      select id, lat, lng from property_clusters
      where id = ${onlyCluster} and lat is not null and lng is not null
    `);
  } else if (force) {
    // Re-sweep every geocoded cluster (e.g. to pick up newly-added TfL modes).
    rows = await db.execute(sql`
      select id, lat, lng from property_clusters
      where lat is not null and lng is not null
      order by id
    `);
  } else {
    rows = await db.execute(sql`
      select pc.id, pc.lat, pc.lng
      from property_clusters pc
      where pc.lat is not null and pc.lng is not null
        and not exists (
          select 1 from listings l
          join enrichments e on e.listing_id = l.id
          where l.cluster_id = pc.id and e.nearby_transit is not null
        )
      order by pc.id
    `);
  }

  const clusters = (rows.rows ?? rows) as Array<{
    id: string;
    lat: string;
    lng: string;
  }>;
  console.log(`[backfill] ${clusters.length} cluster(s) to process`);

  let done = 0;
  let written = 0;
  let skipped = 0;
  for (const c of clusters) {
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
      skipped += 1;
      continue;
    }
    const listings = await db
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(eq(schema.listings.clusterId, c.id));
    if (listings.length === 0) {
      skipped += 1;
      continue;
    }
    try {
      let places: NearbyPlace[];
      if (tflOnly) {
        // Reuse the stored Google POIs; only fetch + splice in TfL stations.
        const existing = await loadExistingNearby(db, c.id);
        if (!existing) {
          skipped += 1;
          done += 1;
          continue;
        }
        const [tfl, buses] = await Promise.all([
          fetchTflStations({ lat, lng }, TFL_APP_KEY),
          fetchTflBusStops({ lat, lng }, TFL_APP_KEY),
        ]);
        places = mergeTflBusStops(mergeTflStations(existing, tfl), buses);
      } else {
        places = await gatherNearbyPlaces(
          { lat, lng },
          { googleKey, tflAppKey: TFL_APP_KEY }
        );
      }
      if (places.length === 0) {
        skipped += 1;
      } else {
        await upsertEnrichmentForListings(
          db,
          listings.map((l) => l.id),
          { nearbyTransit: places }
        );
        written += 1;
      }
      done += 1;
      const stations = places.filter((p) => p.modes && p.modes.length > 0);
      console.log(
        `[backfill] ${done}/${clusters.length} ${c.id} → ${places.length} places, ${stations.length} TfL stations`
      );
      await sleep(THROTTLE_MS);
    } catch (err) {
      skipped += 1;
      console.warn(
        `[backfill] ${c.id} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(
    `[backfill] done — ${written} written, ${skipped} skipped, ${clusters.length} total`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] fatal", err);
  process.exit(1);
});
