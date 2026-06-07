#!/usr/bin/env bun
/**
 * Throwaway: given a search ID, print the exact per-portal search URL the
 * scraper would build (page 0), so we can eyeball whether each portal's
 * URL actually carries the search's filters (esp. propertyTypes).
 */
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";
import {
  openrentSearchUrl,
  rightmoveSearchUrl,
  zooplaSearchUrl,
} from "../../src/lib/portal-urls";
import { asPortalRefArray } from "../../src/lib/search-location";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const db = drizzle(neon(url), { schema });

const searchId = process.argv[2];
if (!searchId) throw new Error("usage: dump-search-urls.ts <searchId>");

const s = await db.query.searches.findFirst({
  where: (row, { eq: eqOp }) => eqOp(row.id, searchId),
});
if (!s) throw new Error(`search ${searchId} not found`);

const loc = s.location;
const filters = {
  minBedrooms: s.minBedrooms,
  maxBedrooms: s.maxBedrooms,
  minPrice: s.minPrice,
  maxPrice: s.maxPrice,
  propertyTypes: s.propertyTypes,
  furnished: s.furnished as "furnished" | "unfurnished" | null,
  mustHaves: s.mustHaves as ("garden" | "parking" | "pets")[],
  exclusions: s.exclusions as ("student" | "retirement" | "house_share")[],
  radiusMiles: Number(s.radiusMiles),
};

console.log("=== SEARCH", searchId, "===");
console.log("name:        ", s.name);
console.log("active:      ", s.active);
console.log("location:    ", loc.name, `(${loc.type})`);
console.log("propertyTypes:", JSON.stringify(s.propertyTypes));
console.log("bedrooms:    ", s.minBedrooms, "-", s.maxBedrooms);
console.log("price:       ", s.minPrice, "-", s.maxPrice);
console.log("radiusMiles: ", filters.radiusMiles);
console.log("exclusions:  ", JSON.stringify(s.exclusions));
console.log("furnished:   ", s.furnished);
console.log("mustHaves:   ", JSON.stringify(s.mustHaves));

console.log("\n=== RIGHTMOVE ===");
for (const ref of asPortalRefArray(loc.portalRefs.rightmove)) {
  console.log(
    rightmoveSearchUrl({ locationIdentifier: ref.locationIdentifier, ...filters, index: 0 })
  );
}

console.log("\n=== ZOOPLA ===");
for (const ref of asPortalRefArray(loc.portalRefs.zoopla)) {
  console.log(zooplaSearchUrl({ q: ref.q, ...filters, pn: 1 }));
}

console.log("\n=== OPENRENT ===");
for (const ref of asPortalRefArray(loc.portalRefs.openrent)) {
  console.log(openrentSearchUrl({ term: ref.term, ...filters }));
}
