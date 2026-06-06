#!/usr/bin/env bun
/**
 * Read-only: replicate clusterPassesSearch's transport logic over the live
 * candidate set and report clusters that PASS the queue filter despite
 * having no requested stop kind within maxMinutes — i.e. listings leaking
 * past the "time to nearest transport" criterion.
 */
import { neon } from "@neondatabase/serverless";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set");
}
const db = drizzle(neon(url), { schema });
const { listings, searches, enrichments } = schema;

const MIN_PER_MILE: Record<string, number> = {
  walk: 20,
  cycle: 5,
  transit: 6,
  drive: 4,
};
const AMENITY_KIND: Record<string, string> = {
  tube_station: "tube",
  train_station: "rail",
  bus_stop: "bus",
  tram_stop: "tram",
};

type Stop = {
  kind: string | null;
  distanceMiles: number;
  walkMinutes?: number | null;
};

function bestStopMinutes(stops: Stop[], kind: string, mode: string): number {
  let best = Number.POSITIVE_INFINITY;
  for (const s of stops) {
    if (s.kind !== kind) {
      continue;
    }
    const minutes =
      typeof s.walkMinutes === "number"
        ? s.walkMinutes
        : s.distanceMiles * (MIN_PER_MILE[mode] ?? 20);
    if (minutes < best) {
      best = minutes;
    }
  }
  return best;
}

const [search] = await db
  .select()
  .from(searches)
  .where(eq(searches.active, true));
const targets = (search.transportTargets ?? []).filter(
  (t: { amenity: string; maxMinutes?: number }) =>
    Boolean(AMENITY_KIND[t.amenity]) && typeof t.maxMinutes === "number"
);
console.log(
  `Search "${search.name}" transport targets:`,
  targets.map((t) => `${t.amenity}<=${t.maxMinutes}m ${t.mode}`).join(", ")
);

// One enrichment (highest promptVersion) per candidate cluster.
const rows = await db
  .select({
    clusterId: listings.clusterId,
    promptVersion: enrichments.promptVersion,
    nearbyTransit: enrichments.nearbyTransit,
  })
  .from(enrichments)
  .innerJoin(listings, eq(enrichments.listingId, listings.id))
  .innerJoin(searches, eq(listings.searchId, searches.id))
  .where(sql`${listings.clusterId} IS NOT NULL AND ${searches.active} = true`)
  .orderBy(desc(enrichments.promptVersion));

const byCluster = new Map<string, Stop[] | null>();
for (const r of rows) {
  if (!r.clusterId || byCluster.has(r.clusterId)) {
    continue;
  }
  byCluster.set(r.clusterId, (r.nearbyTransit as Stop[] | null) ?? null);
}

let pass = 0;
let fail = 0;
let pendingNoStops = 0;
const leaks: string[] = [];
for (const [cid, stops] of byCluster) {
  if (!stops) {
    pendingNoStops++;
    pass++; // pending convention: passes
    continue;
  }
  const reaches = targets.map((t) => ({
    amenity: t.amenity,
    minutes: bestStopMinutes(stops, AMENITY_KIND[t.amenity], t.mode),
    max: t.maxMinutes as number,
  }));
  const anyWithin = reaches.some((r) => r.minutes <= r.max);
  if (anyWithin) {
    pass++;
  } else {
    fail++;
    const detail = reaches
      .map((r) => `${r.amenity}=${Math.round(r.minutes)}m(<=${r.max})`)
      .join(", ");
    leaks.push(`${cid}  ${detail}`);
  }
}

console.log(`\nCandidate clusters with enrichment: ${byCluster.size}`);
console.log(`  PASS transport filter: ${pass}`);
console.log(`  FAIL (correctly dropped): ${fail}`);
console.log(`  pending (no stops → passes): ${pendingNoStops}`);
console.log(
  '\nFAIL clusters (these are removed from the queue — nearest stop over limit):'
);
for (const l of leaks.slice(0, 30)) {
  console.log(`  ${l}`);
}
if (leaks.length > 30) {
  console.log(`  …and ${leaks.length - 30} more`);
}
