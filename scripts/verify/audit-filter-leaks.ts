#!/usr/bin/env bun
/**
 * Throwaway audit: for every ACTIVE search, count listings whose stored
 * data violates a search filter that the portal URL was supposed to apply
 * but didn't (OpenRent ignores them). Quantifies the bedroom + category
 * exclusion leak.
 */
import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const db = drizzle(neon(url), { schema });

const SHARE_RE = /house\s*share|room\s+in\s+a?\s*shared/i;
const STUDENT_RE = /student/i;
const RETIRE_RE = /retirement|over\s*55|over\s*60|mccarthy|churchill/i;

const searches = await db
  .select()
  .from(schema.searches)
  .where(eq(schema.searches.active, true));

let grandTotal = 0;
const byPortal: Record<string, number> = {};
const byReason: Record<string, number> = {};

for (const s of searches) {
  const ls = await db
    .select()
    .from(schema.listings)
    .where(
      and(
        eq(schema.listings.searchId, s.id),
        eq(schema.listings.status, "active")
      )
    );

  const leaks: Array<{ reason: string; l: (typeof ls)[number] }> = [];
  for (const l of ls) {
    const hay = `${l.title} ${l.addressRaw} ${l.propertyType ?? ""}`;
    if (s.minBedrooms != null && l.bedrooms != null && l.bedrooms < s.minBedrooms)
      leaks.push({ reason: `bedrooms<${s.minBedrooms}`, l });
    else if (
      s.maxBedrooms != null &&
      l.bedrooms != null &&
      l.bedrooms > s.maxBedrooms
    )
      leaks.push({ reason: `bedrooms>${s.maxBedrooms}`, l });
    else if (s.exclusions.includes("house_share") && SHARE_RE.test(hay))
      leaks.push({ reason: "house_share", l });
    else if (s.exclusions.includes("student") && STUDENT_RE.test(hay))
      leaks.push({ reason: "student", l });
    else if (s.exclusions.includes("retirement") && RETIRE_RE.test(hay))
      leaks.push({ reason: "retirement", l });
  }

  if (leaks.length === 0) continue;
  grandTotal += leaks.length;
  console.log(
    `\n### search "${s.name}" (${s.id})  beds≥${s.minBedrooms ?? "-"}≤${s.maxBedrooms ?? "-"}  excl=[${s.exclusions.join(",")}]  — ${leaks.length}/${ls.length} leak`
  );
  for (const { reason, l } of leaks) {
    byPortal[l.portal] = (byPortal[l.portal] ?? 0) + 1;
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    console.log(
      `   [${reason}] ${l.portal} beds=${l.bedrooms} £${l.priceMonthly ?? "?"} clusterId=${l.clusterId} "${l.title}"`
    );
  }
}

console.log("\n========== SUMMARY ==========");
console.log("total leaking active listings:", grandTotal);
console.log("by portal:", byPortal);
console.log("by reason:", byReason);

process.exit(0);
