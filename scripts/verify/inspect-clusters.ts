#!/usr/bin/env bun
/**
 * Throwaway: dump clusters + their listings + owning searches for the IDs
 * passed on argv, to understand why they're surfacing in the feed.
 *   doppler run --project gaff --config prd ... -- bun scripts/verify/inspect-clusters.ts <id> [id...]
 */
import { neon } from "@neondatabase/serverless";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("usage: inspect-clusters.ts <clusterId> [clusterId...]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const db = drizzle(neon(url), { schema });

const clusters = await db
  .select()
  .from(schema.propertyClusters)
  .where(inArray(schema.propertyClusters.id, ids));

const listings = await db
  .select()
  .from(schema.listings)
  .where(inArray(schema.listings.clusterId, ids));

const searchIds = [...new Set(listings.map((l) => l.searchId))];
const searches = searchIds.length
  ? await db
      .select()
      .from(schema.searches)
      .where(inArray(schema.searches.id, searchIds))
  : [];

for (const c of clusters) {
  console.log("\n========== CLUSTER", c.id, "==========");
  console.log({
    normalisedAddress: c.normalisedAddress,
    postcode: c.postcode,
    lat: c.lat,
    lng: c.lng,
  });
  const ls = listings.filter((l) => l.clusterId === c.id);
  for (const l of ls) {
    console.log("  -- listing", l.id, l.portal, l.portalListingId);
    console.log("    ", {
      title: l.title,
      addressRaw: l.addressRaw,
      postcode: l.postcode,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      priceMonthly: l.priceMonthly,
      propertyType: l.propertyType,
      status: l.status,
      lat: l.lat,
      lng: l.lng,
      url: l.url,
      searchId: l.searchId,
    });
  }
}

console.log("\n========== OWNING SEARCHES ==========");
for (const s of searches) {
  console.log({
    id: s.id,
    name: s.name,
    portals: s.portals,
    minBedrooms: s.minBedrooms,
    maxBedrooms: s.maxBedrooms,
    minBathrooms: s.minBathrooms,
    maxBathrooms: s.maxBathrooms,
    minPrice: s.minPrice,
    maxPrice: s.maxPrice,
    radiusMiles: s.radiusMiles,
    propertyTypes: s.propertyTypes,
    furnished: s.furnished,
    mustHaves: s.mustHaves,
    exclusions: s.exclusions,
    location: s.location,
    excludeLocations: s.excludeLocations,
  });
}

process.exit(0);
