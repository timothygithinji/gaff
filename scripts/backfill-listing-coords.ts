#!/usr/bin/env bun
/**
 * Listing coordinate backfill.
 *
 * Zoopla/OpenRent listings carry true per-property lat/lng — but only on
 * the detail page, which `scrape-detail` parses into the rich `rawJson`
 * blob (top-level `rawJson.lat`/`rawJson.lng`). Column promotion of those
 * coords into `listings.lat`/`lng` only shipped in 5c7fd543 ("write
 * detail columns"); listings first clustered under an earlier Worker kept
 * their rawJson coords but landed a NULL column, and `scrape-detail`
 * never re-runs for an already-clustered listing, so they can't
 * self-heal. The NULL columns starve every per-cluster geo enrichment
 * (`enrich-flood`/`enrich-amenities` no-op without lat/lng,
 * and `enrich-council-tax` loses its precise arm). See [[enrichment-coords-bug]].
 *
 * This promotes the stranded coords — `rawJson` → `listings.lat/lng` →
 * `property_clusters.lat/lng` (a cluster is one building, so any located
 * listing in it locates the cluster) — then re-fires the four
 * lat/lng-gated enrichments for the newly-located clusters. Pure SQL +
 * Trigger fan-out; no external geocoding (the coords are already ours,
 * and the scraped postcode is only an outcode anyway).
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/backfill-listing-coords.ts [--limit N] [--dry-run]
 *
 * Flags:
 *   --dry-run   Report how many listings/clusters would be touched; write
 *               nothing, trigger nothing.
 *   --limit N   Cap the enrichment re-fan-out (the SQL promotion always
 *               runs in full — it's a single statement).
 */

import { tasks } from "@trigger.dev/sdk";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";

// The lat/lng-gated enrichments to re-fire once a cluster is located.
// EPC + broadband key off the postcode directly and aren't gated on
// coordinates, so they're left alone here.
const GEO_TASK_IDS = [
  "enrich-flood",
  "enrich-amenities",
  "enrich-council-tax",
] as const;

const TRIGGER_BATCH_SIZE = 50;

// A lenient numeric guard for the rawJson text value — enough to keep the
// `::numeric` cast from throwing on a stray non-number. `.` is literal
// inside the character class, so no backslash escaping to get wrong.
const latText = sql`(${schema.listings.rawJson} ->> 'lat')`;
const lngText = sql`(${schema.listings.rawJson} ->> 'lng')`;
const hasNumericCoords = and(
  sql`${latText} ~ '^-?[0-9.]+$'`,
  sql`${lngText} ~ '^-?[0-9.]+$'`
);

type Args = { dryRun: boolean; limit: number | undefined };

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, limit: undefined };
  // biome-ignore lint/style/useForOf: index-based parser consuming `--flag value` pairs via lookahead (argv[++i]).
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
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!(args.dryRun || process.env.TRIGGER_SECRET_KEY)) {
    throw new Error(
      "TRIGGER_SECRET_KEY not set — run via `doppler run ... -- bun scripts/backfill-listing-coords.ts` (or pass --dry-run)"
    );
  }

  const db = getDb();

  // How many coordinate-less listings can we recover from rawJson?
  const [listingScan] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.listings)
    .where(and(isNull(schema.listings.lat), hasNumericCoords));
  const recoverableListings = listingScan?.n ?? 0;

  // Which coordinate-less clusters have at least one such listing? These
  // are the ones we'll locate and re-enrich.
  const targetClusters = await db
    .selectDistinct({ id: schema.propertyClusters.id })
    .from(schema.propertyClusters)
    .innerJoin(
      schema.listings,
      eq(schema.listings.clusterId, schema.propertyClusters.id)
    )
    .where(and(isNull(schema.propertyClusters.lat), hasNumericCoords));
  const targetClusterIds = targetClusters.map((c) => c.id);

  console.log(
    `Recoverable: ${recoverableListings} listing(s) with stranded rawJson coords; ${targetClusterIds.length} coordinate-less cluster(s) can be located.`
  );

  if (args.dryRun) {
    console.log("\n--dry-run: writing nothing, triggering nothing.");
    return;
  }
  if (recoverableListings === 0) {
    console.log("Nothing to promote.");
    return;
  }

  // 1. Promote rawJson coords → listings columns (single statement).
  await db.execute(sql`
    UPDATE ${schema.listings}
    SET lat = (${schema.listings.rawJson} ->> 'lat')::numeric,
        lng = (${schema.listings.rawJson} ->> 'lng')::numeric
    WHERE ${schema.listings.lat} IS NULL
      AND (${schema.listings.rawJson} ->> 'lat') ~ '^-?[0-9.]+$'
      AND (${schema.listings.rawJson} ->> 'lng') ~ '^-?[0-9.]+$'
  `);
  console.log(`Promoted coords onto ${recoverableListings} listing(s).`);

  // 2. Propagate to coordinate-less clusters — a cluster is one building,
  //    so any located listing in it locates the cluster. Cheapest listing
  //    wins the tiebreak, deterministically.
  await db.execute(sql`
    UPDATE ${schema.propertyClusters} AS c
    SET lat = src.lat, lng = src.lng
    FROM (
      SELECT DISTINCT ON (cluster_id) cluster_id, lat, lng
      FROM ${schema.listings}
      WHERE cluster_id IS NOT NULL AND lat IS NOT NULL
      ORDER BY cluster_id, price_monthly ASC NULLS LAST
    ) AS src
    WHERE c.id = src.cluster_id AND c.lat IS NULL
  `);
  console.log(`Located ${targetClusterIds.length} cluster(s).`);

  // 3. Re-fire the geo enrichments for the now-located clusters.
  const ids = args.limit
    ? targetClusterIds.slice(0, args.limit)
    : targetClusterIds;
  if (ids.length === 0) {
    console.log("No clusters to re-enrich.");
    return;
  }
  for (const taskId of GEO_TASK_IDS) {
    let triggered = 0;
    for (let i = 0; i < ids.length; i += TRIGGER_BATCH_SIZE) {
      const slice = ids.slice(i, i + TRIGGER_BATCH_SIZE);
      await tasks.batchTrigger(
        taskId,
        slice.map((id) => ({ payload: { clusterId: id } }))
      );
      triggered += slice.length;
    }
    console.log(`  re-triggered ${taskId}: ${triggered} runs`);
  }

  console.log(
    "\nDone. Watch the Trigger.dev dashboard; each run stamps its cluster's flood/amenities/council-tax."
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
