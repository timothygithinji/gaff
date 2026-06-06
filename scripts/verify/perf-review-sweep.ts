#!/usr/bin/env bun
/**
 * Deep read-only prod sweep for the "is what we're getting correct?" review.
 *
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/verify/perf-review-sweep.ts
 *
 * Sections:
 *   1. Active searches + full filter config.
 *   2. The exact per-portal search URLs each search currently builds
 *      (faithful replica of scrape-portal.ts `buildSearchTargets`).
 *   3. Conformance audit: price / bedrooms / bathrooms vs the search
 *      filters, with the zero-bathrooms population broken out.
 *   4. Transport-target adherence: do clustered+queued listings actually
 *      have a requested stop within maxMinutes (real routed data)?
 *   5. AI-features audit: deposit-cap false positives, ungrounded
 *      station/commute claims, and other hallucination smells.
 */
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";
import { computeFiveWeeksRent } from "../../src/lib/ai/feature-filter";
import {
  openrentSearchUrl,
  rightmoveSearchUrl,
  zooplaSearchUrl,
} from "../../src/lib/portal-urls";
import { asPortalRefArray } from "../../src/lib/search-location";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set");
}
const db = drizzle(neon(url), { schema });
const { listings, searches, enrichments } = schema;

const hr = (t: string) => console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);
const sub = (t: string) => console.log(`\n— ${t} —`);

// ---------------------------------------------------------------------------
// 1. Active searches + config
// ---------------------------------------------------------------------------
const active = await db.select().from(searches).where(eq(searches.active, true));
hr(`1. ACTIVE SEARCHES (${active.length})`);
for (const s of active) {
  const loc = s.location;
  console.log(`
• "${s.name}"  id=${s.id}
    location:    ${loc.name} (${loc.type})  placeId=${loc.placeId}
    radiusMiles: ${s.radiusMiles}
    price:       £${s.minPrice ?? "-"} … £${s.maxPrice ?? "-"}
    bedrooms:    ${s.minBedrooms ?? "-"} … ${s.maxBedrooms ?? "-"}
    bathrooms:   ${s.minBathrooms ?? "-"} … ${s.maxBathrooms ?? "-"}
    propertyTypes: [${(s.propertyTypes ?? []).join(", ")}]
    furnished:   ${s.furnished ?? "-"}
    mustHaves:   [${(s.mustHaves ?? []).join(", ")}]
    exclusions:  [${(s.exclusions ?? []).join(", ")}]
    portals:     [${(s.portals ?? []).join(", ")}]
    coveringOutcodes (${loc.coveringOutcodes?.length ?? 0}): ${(loc.coveringOutcodes ?? []).join(", ") || "-"}
    allOutcodes (${loc.allOutcodes?.length ?? 0}): ${(loc.allOutcodes ?? []).join(", ") || "-"}
    commuteTargets: ${JSON.stringify(s.commuteTargets ?? [])}
    transportTargets: ${JSON.stringify(s.transportTargets ?? [])}`);
}

// ---------------------------------------------------------------------------
// 2. Reconstruct the per-portal URLs (faithful to buildSearchTargets)
// ---------------------------------------------------------------------------
// NOTE: scrape-portal.ts only spreads THESE filters into the URL builders.
// bathrooms / furnished / mustHaves / exclusions are intentionally omitted
// in production — reproduced here exactly so the URLs match what runs.
hr("2. PER-PORTAL SEARCH URLs (page 1, recency window omitted = full set)");
console.log(
  "Reconstructed exactly as scrape-portal.ts buildSearchTargets does.\n" +
    "Incremental runs additionally append a recency cap (RM maxDaysSinceAdded,\n" +
    "ZP added) derived from the schedule cadence; backfill omits it (shown here)."
);

for (const s of active) {
  const loc = s.location;
  const filters = {
    minBedrooms: s.minBedrooms,
    maxBedrooms: s.maxBedrooms,
    minPrice: s.minPrice,
    maxPrice: s.maxPrice,
    propertyTypes: s.propertyTypes,
    radiusMiles: Number(s.radiusMiles),
  };
  hr(`   URLs for "${s.name}"`);

  if ((s.portals ?? []).includes("rightmove")) {
    const refs = asPortalRefArray(loc.portalRefs?.rightmove);
    sub(`RIGHTMOVE (${refs.length} target${refs.length === 1 ? "" : "s"})`);
    for (const ref of refs) {
      console.log(
        rightmoveSearchUrl({ locationIdentifier: ref.locationIdentifier, ...filters, index: 0 })
      );
    }
  }
  if ((s.portals ?? []).includes("zoopla")) {
    const refs = asPortalRefArray(loc.portalRefs?.zoopla);
    sub(`ZOOPLA (${refs.length} target${refs.length === 1 ? "" : "s"})`);
    for (const ref of refs) {
      console.log(zooplaSearchUrl({ q: ref.q, ...filters, pn: 1 }));
    }
  }
  if ((s.portals ?? []).includes("openrent")) {
    const refs = asPortalRefArray(loc.portalRefs?.openrent);
    sub(`OPENRENT (${refs.length} target${refs.length === 1 ? "" : "s"})`);
    for (const ref of refs) {
      console.log(openrentSearchUrl({ term: ref.term, ...filters }));
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Conformance audit: price / bedrooms / bathrooms
// ---------------------------------------------------------------------------
hr("3. CONFORMANCE AUDIT (stored listings vs search filters)");
for (const s of active) {
  const ls = await db
    .select()
    .from(listings)
    .where(and(eq(listings.searchId, s.id), eq(listings.status, "active")));

  const byPortal = (pred: (l: (typeof ls)[number]) => boolean) => {
    const out: Record<string, number> = {};
    for (const l of ls.filter(pred)) { out[l.portal] = (out[l.portal] ?? 0) + 1; }
    return out;
  };

  const priceViol = ls.filter(
    (l) =>
      l.priceMonthly != null &&
      ((s.minPrice != null && l.priceMonthly < s.minPrice) ||
        (s.maxPrice != null && l.priceMonthly > s.maxPrice))
  );
  const bedViol = ls.filter(
    (l) =>
      l.bedrooms != null &&
      ((s.minBedrooms != null && l.bedrooms < s.minBedrooms) ||
        (s.maxBedrooms != null && l.bedrooms > s.maxBedrooms))
  );
  const bathViol = ls.filter(
    (l) =>
      l.bathrooms != null &&
      ((s.minBathrooms != null && l.bathrooms < s.minBathrooms) ||
        (s.maxBathrooms != null && l.bathrooms > s.maxBathrooms))
  );
  const bathZero = ls.filter((l) => l.bathrooms === 0);
  const bathNull = ls.filter((l) => l.bathrooms == null);
  const priceNull = ls.filter((l) => l.priceMonthly == null);
  const bedNull = ls.filter((l) => l.bedrooms == null);

  hr(`   "${s.name}" — ${ls.length} active listings`);
  console.log(`price  violations: ${priceViol.length}  (null price: ${priceNull.length})  byPortal=${JSON.stringify(byPortal((l) => priceViol.includes(l)))}`);
  console.log(`bed    violations: ${bedViol.length}  (null beds: ${bedNull.length})  byPortal=${JSON.stringify(byPortal((l) => bedViol.includes(l)))}`);
  console.log(`bath   violations: ${bathViol.length}  (vs filter ${s.minBathrooms ?? "-"}..${s.maxBathrooms ?? "-"})`);
  console.log(`bath   == 0:       ${bathZero.length}   byPortal=${JSON.stringify(byPortal((l) => l.bathrooms === 0))}`);
  console.log(`bath   == null:    ${bathNull.length}   byPortal=${JSON.stringify(byPortal((l) => l.bathrooms == null))}`);

  const ex = (label: string, rows: typeof ls) => {
    if (rows.length === 0) { return; }
    sub(`${label} — examples`);
    for (const l of rows.slice(0, 8)) {
      console.log(
        `  ${l.portal} £${l.priceMonthly ?? "?"} beds=${l.bedrooms ?? "?"} baths=${l.bathrooms ?? "?"} [${l.status}] "${(l.title ?? "").slice(0, 70)}"  ${l.url}`
      );
    }
    if (rows.length > 8) { console.log(`  …and ${rows.length - 8} more`); }
  };
  ex("PRICE violations", priceViol);
  ex("BEDROOM violations", bedViol);
  ex("BATHROOM violations", bathViol);
  ex("BATHROOM == 0", bathZero);
}

// ---------------------------------------------------------------------------
// 4. Transport-target adherence (real routed data)
// ---------------------------------------------------------------------------
hr("4. TRANSPORT-TARGET ADHERENCE");
const AMENITY_KIND: Record<string, string> = {
  tube_station: "tube",
  train_station: "rail",
  bus_stop: "bus",
  tram_stop: "tram",
};
const STATION_KINDS = new Set(["tube", "rail"]);
const MIN_PER_MILE: Record<string, number> = { walk: 20, cycle: 5, transit: 6, drive: 4 };

type Stop = { kind: string | null; distanceMiles: number; walkMinutes?: number | null };
type StationRoute = { name?: string; walkMinutes?: number | null; transitMinutes?: number | null };

function bestStationWalk(routes: StationRoute[] | null | undefined): number | null {
  if (!routes?.length) { return null; }
  let best = Number.POSITIVE_INFINITY;
  for (const r of routes) { if (typeof r.walkMinutes === "number") { best = Math.min(best, r.walkMinutes); } }
  return Number.isFinite(best) ? best : null;
}
function bestRoutedStationWalk(stops: Stop[] | null | undefined, kind: string): number | null {
  if (!stops?.length) { return null; }
  let best = Number.POSITIVE_INFINITY;
  for (const s of stops) { if (s.kind === kind && typeof s.walkMinutes === "number") { best = Math.min(best, s.walkMinutes); } }
  return Number.isFinite(best) ? best : null;
}
function bestStopMinutes(stops: Stop[] | null | undefined, kind: string, mode: string): number | null {
  if (!stops?.length) { return null; }
  let best = Number.POSITIVE_INFINITY;
  for (const s of stops) {
    if (s.kind !== kind) { continue; }
    const m = typeof s.walkMinutes === "number" ? s.walkMinutes : s.distanceMiles * (MIN_PER_MILE[mode] ?? 20);
    best = Math.min(best, m);
  }
  return Number.isFinite(best) ? best : null;
}

for (const s of active) {
  const targets = (s.transportTargets ?? []).filter(
    (t) => Boolean(AMENITY_KIND[t.amenity]) && typeof t.maxMinutes === "number"
  );
  if (targets.length === 0) {
    console.log(`\n"${s.name}": no transport targets configured.`);
    continue;
  }
  hr(`   "${s.name}" targets: ${targets.map((t) => `${t.amenity}<=${t.maxMinutes}m/${t.mode}`).join(", ")}`);

  // latest enrichment per clustered candidate listing for this search
  const rows = await db
    .select({
      clusterId: listings.clusterId,
      promptVersion: enrichments.promptVersion,
      stationRoutes: enrichments.stationRoutes,
      nearbyTransit: enrichments.nearbyTransit,
    })
    .from(enrichments)
    .innerJoin(listings, eq(enrichments.listingId, listings.id))
    .where(and(eq(listings.searchId, s.id), isNotNull(listings.clusterId)))
    .orderBy(desc(enrichments.promptVersion));

  const byCluster = new Map<string, { routes: StationRoute[] | null; stops: Stop[] | null }>();
  for (const r of rows) {
    if (!r.clusterId || byCluster.has(r.clusterId)) { continue; }
    byCluster.set(r.clusterId, {
      routes: (r.stationRoutes as StationRoute[] | null) ?? null,
      stops: (r.nearbyTransit as Stop[] | null) ?? null,
    });
  }

  let pass = 0;
  let drop = 0;
  let pending = 0;
  const leaks: string[] = [];
  for (const [cid, enr] of byCluster) {
    const stationWalk = bestStationWalk(enr.routes);
    let evaluable = false;
    let satisfied = false;
    const detail: string[] = [];
    for (const t of targets) {
      const kind = AMENITY_KIND[t.amenity];
      const max = t.maxMinutes as number;
      let reach: number | null;
      if (STATION_KINDS.has(kind)) { reach = stationWalk ?? bestRoutedStationWalk(enr.stops, kind); }
      else { reach = bestStopMinutes(enr.stops, kind, t.mode); }
      if (reach === null) {
        detail.push(`${t.amenity}=∅`);
        continue;
      }
      evaluable = true;
      detail.push(`${t.amenity}=${Math.round(reach)}m(<=${max})`);
      if (reach <= max) { satisfied = true; }
    }
    if (!evaluable) {
      pending++;
      pass++; // pending convention: passes the filter
    } else if (satisfied) { pass++; }
    else {
      drop++;
      leaks.push(`${cid}  ${detail.join(", ")}`);
    }
  }
  console.log(`clusters w/ enrichment: ${byCluster.size}`);
  console.log(`  PASS filter:                 ${pass}`);
  console.log(`  DROP (over limit, removed):  ${drop}`);
  console.log(`  pending (no routed data→pass): ${pending}`);
  if (pending > 0) {
    console.log(`  ⚠ ${pending} clusters surface WITHOUT routed transport data — the criterion can't be enforced on them yet.`);
  }
  if (leaks.length) {
    sub("Correctly dropped (nearest requested stop over the limit)");
    for (const l of leaks.slice(0, 20)) { console.log(`  ${l}`); }
    if (leaks.length > 20) { console.log(`  …and ${leaks.length - 20} more`); }
  }
}

// ---------------------------------------------------------------------------
// 5. AI features audit
// ---------------------------------------------------------------------------
hr("5. AI FEATURES AUDIT (hallucination / conflict smells)");

type Feat = { label?: string; detail?: string | null; severity?: string };
type Features = { summary?: string | null; highlights?: Feat[]; watchouts?: Feat[] };

const activeIds = active.map((s) => s.id);
const enrRows = await db
  .select({
    listingId: enrichments.listingId,
    promptVersion: enrichments.promptVersion,
    features: enrichments.features,
    commuteMinutes: enrichments.commuteMinutes,
    stationRoutes: enrichments.stationRoutes,
    nearbyTransit: enrichments.nearbyTransit,
    portal: listings.portal,
    title: listings.title,
    url: listings.url,
    priceMonthly: listings.priceMonthly,
    bathrooms: listings.bathrooms,
    rawJson: listings.rawJson,
  })
  .from(enrichments)
  .innerJoin(listings, eq(enrichments.listingId, listings.id))
  .where(
    and(
      activeIds.length ? inArray(listings.searchId, activeIds) : isNotNull(listings.id),
      isNotNull(enrichments.features)
    )
  );

console.log(`enrichment rows with features (active searches): ${enrRows.length}`);

const DEPOSIT_RE = /deposit/i;
const OVER_CAP_RE = /over|above|exceed|too high|high deposit|limit|cap|maximum|max\b/i;
const STATION_TIME_RE = /(\d+)\s*-?\s*min(ute)?s?\b.*\b(walk|station|tube|rail|underground|overground)\b|\b(walk|station|tube|rail|underground|overground)\b.*?(\d+)\s*-?\s*min/i;
const COMMUTE_RE = /commute|to (work|the city|central|canary|liverpool st|king'?s cross)/i;

let depositFalsePos = 0;
let depositOverCapReal = 0;
let stationClaimNoData = 0;
let commuteClaimNoData = 0;
let summaryNull = 0;
const depositSamples: string[] = [];
const stationSamples: string[] = [];
const commuteSamples: string[] = [];

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

for (const r of enrRows) {
  const f = (r.features ?? {}) as Features;
  if (f.summary == null) { summaryNull++; }
  const items: Feat[] = [...(f.highlights ?? []), ...(f.watchouts ?? [])];

  // raw listing deposit
  const raw = (r.rawJson ?? {}) as Record<string, unknown>;
  const depositRaw =
    num(raw.deposit) ?? num((raw.detail as Record<string, unknown> | undefined)?.deposit);
  const cap = computeFiveWeeksRent(r.priceMonthly);

  const hasCommuteData = r.commuteMinutes && Object.keys(r.commuteMinutes as object).length > 0;
  const hasStationData =
    (Array.isArray(r.stationRoutes) && (r.stationRoutes as unknown[]).length > 0) ||
    (Array.isArray(r.nearbyTransit) && (r.nearbyTransit as unknown[]).length > 0);

  for (const it of items) {
    const text = `${it.label ?? ""} ${it.detail ?? ""}`.trim();
    if (!text) { continue; }

    // deposit-cap claims
    if (DEPOSIT_RE.test(text) && OVER_CAP_RE.test(text)) {
      const overReal =
        depositRaw != null && cap != null ? depositRaw > Math.ceil(cap) : null;
      if (overReal === false || (depositRaw != null && cap == null)) {
        depositFalsePos++;
        if (depositSamples.length < 12) {
          depositSamples.push(
            `[FALSE-POS] ${r.portal} v${r.promptVersion} deposit=£${depositRaw ?? "?"} cap5wk=£${cap ? Math.ceil(cap) : "?"} price=£${r.priceMonthly ?? "?"}\n      "${text}"\n      ${r.url}`
          );
        }
      } else if (overReal === true) {
        depositOverCapReal++;
      } else {
        // can't verify (no deposit parsed) — still suspect if it asserts over-cap
        if (depositSamples.length < 12) {
          depositSamples.push(
            `[UNVERIFIABLE] ${r.portal} v${r.promptVersion} deposit=${depositRaw ?? "null"} cap=${cap ? Math.ceil(cap) : "null"}\n      "${text}"\n      ${r.url}`
          );
        }
      }
    }

    // station-time claims without routed station data
    if (STATION_TIME_RE.test(text) && !hasStationData) {
      stationClaimNoData++;
      if (stationSamples.length < 12) {
        stationSamples.push(`${r.portal} v${r.promptVersion}  "${text}"\n      ${r.url}`);
      }
    }
    // commute claims without routed commute data
    if (COMMUTE_RE.test(text) && /\d+\s*-?\s*min/i.test(text) && !hasCommuteData) {
      commuteClaimNoData++;
      if (commuteSamples.length < 12) {
        commuteSamples.push(`${r.portal} v${r.promptVersion}  "${text}"\n      ${r.url}`);
      }
    }
  }
}

console.log(`
summary == null:                                  ${summaryNull}
deposit-over-cap claims that are FALSE/unverif.:  ${depositFalsePos}
deposit-over-cap claims that are REAL:            ${depositOverCapReal}
station-time claims with NO routed station data:  ${stationClaimNoData}
commute-time claims with NO routed commute data:  ${commuteClaimNoData}`);

sub("Deposit-cap suspects");
for (const x of depositSamples) { console.log(`  ${x}`); }
sub("Station-time claims lacking routed data");
for (const x of stationSamples) { console.log(`  ${x}`); }
sub("Commute-time claims lacking routed data");
for (const x of commuteSamples) { console.log(`  ${x}`); }

// prompt-version spread
sub("Enrichment prompt-version spread (active searches)");
const verCount: Record<string, number> = {};
for (const r of enrRows) { verCount[r.promptVersion] = (verCount[r.promptVersion] ?? 0) + 1; }
console.log(`  ${JSON.stringify(verCount)}`);

console.log("\nDone.");
process.exit(0);
