#!/usr/bin/env bun
/**
 * Throwaway read-only audit: replicate the review-queue candidate set the
 * way loadRankedQueueClusterIds does, then sweep surfaced rows for wording
 * that suggests they shouldn't be in the queue.
 */
import { neon } from "@neondatabase/serverless";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const url = process.env.DATABASE_URL;
if (!url) { throw new Error("DATABASE_URL not set"); }
const db = drizzle(neon(url), { schema });
const { listings, searches } = schema;

const EXCLUSION_PATTERNS: Record<string, string> = {
  house_share:
    "house\\s*share|flat\\s*share|room\\s+in\\s+a?\\s*shared|shared\\s+(?:accommodation|flat|house|room|living|apartment)",
  student: "student",
  retirement: "retirement|over\\s*55|over\\s*60|mccarthy|churchill",
};

const activeSearches = await db
  .select()
  .from(searches)
  .where(eq(searches.active, true));
console.log(`Active searches: ${activeSearches.length}`);
for (const s of activeSearches) {
  console.log(
    `  • "${s.name ?? s.id}" beds ${s.minBedrooms ?? "-"}..${s.maxBedrooms ?? "-"} ` +
      `£${s.minPrice ?? "-"}..${s.maxPrice ?? "-"} exclusions=[${(s.exclusions ?? []).join(",")}]`
  );
}
const activeSearchIds = activeSearches.map((s) => s.id);

const bandSql = sql`(
  ${listings.priceMonthly} IS NULL OR (
    (${searches.minPrice} IS NULL OR ${listings.priceMonthly} >= ${searches.minPrice})
    AND (${searches.maxPrice} IS NULL OR ${listings.priceMonthly} <= ${searches.maxPrice})
  ))`;
const bedSql = sql`(
  ${listings.bedrooms} IS NULL OR (
    (${searches.minBedrooms} IS NULL OR ${listings.bedrooms} >= ${searches.minBedrooms})
    AND (${searches.maxBedrooms} IS NULL OR ${listings.bedrooms} <= ${searches.maxBedrooms})
  ))`;
const haystack = sql`(coalesce(${listings.propertyType}, '') || ' ' || ${listings.title})`;
const notExcluded = (v: string, p: string) =>
  sql`NOT (${v}::text = ANY(${searches.exclusions}) AND ${haystack} ~* ${p})`;
const exclSql = sql`(
  ${notExcluded("house_share", EXCLUSION_PATTERNS.house_share)}
  AND ${notExcluded("student", EXCLUSION_PATTERNS.student)}
  AND ${notExcluded("retirement", EXCLUSION_PATTERNS.retirement)}
)`;

const rows = await db
  .select({
    clusterId: listings.clusterId,
    portal: listings.portal,
    status: listings.status,
    title: listings.title,
    propertyType: listings.propertyType,
    bedrooms: listings.bedrooms,
    price: listings.priceMonthly,
    url: listings.url,
    exclusions: searches.exclusions,
  })
  .from(listings)
  .innerJoin(searches, eq(listings.searchId, searches.id))
  .where(
    and(
      isNotNull(listings.clusterId),
      inArray(listings.searchId, activeSearchIds),
      bandSql,
      bedSql,
      exclSql
    )
  );

console.log(`\nQueue-candidate rows: ${rows.length}, clusters: ${new Set(rows.map((r) => r.clusterId)).size}`);

const SUSPECT: [string, RegExp][] = [
  ["shared/share", /\bshare(d)?\b|flatshare|house\s*share|room\s+in/i],
  ["accommodation", /accommodation/i],
  ["student", /student/i],
  ["retirement/over-55", /retirement|over\s*5\d|over\s*60|mccarthy|churchill|assisted living/i],
  ["room only", /^\s*room\b|\broom to rent\b|\bdouble room\b|\bsingle room\b/i],
  ["studio", /studio/i],
  ["commercial/office", /commercial|office\s+space|retail unit|\bA1\b|\bB1\b/i],
  ["parking/garage", /\bparking\b|\bgarage\b|lock[\s-]?up/i],
  ["sublet/short let", /sub\s*let|short\s*let|holiday let|serviced/i],
];

console.log('\nSuspect-wording sweep among surfaced rows:');
const seen = new Set<string>();
for (const [label, re] of SUSPECT) {
  const hits = rows.filter((r) => re.test(`${r.propertyType ?? ""} ${r.title}`));
  if (hits.length === 0) { continue; }
  console.log(`\n[${label}] ${hits.length} row(s):`);
  for (const r of hits.slice(0, 15)) {
    const key = `${r.portal}|${r.title}`;
    const dupe = seen.has(key) ? " (dup)" : "";
    seen.add(key);
    console.log(
      `  ${r.portal} £${r.price ?? "?"} ${r.bedrooms ?? "?"}bed [${r.status}]${dupe} — ${r.title.slice(0, 80)}`
    );
  }
  if (hits.length > 15) { console.log(`  …and ${hits.length - 15} more`); }
}
