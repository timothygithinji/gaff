#!/usr/bin/env bun
/**
 * Zoopla v2 — parse RSC flight chunks instead of __NEXT_DATA__.
 */
import { zyteFetch } from "./lib/zyte";
import { findByKey, parseFlight } from "./lib/rsc-flight";
import { pluck, summarise } from "./lib/extract";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const SEARCH_URL =
  "https://www.zoopla.co.uk/to-rent/property/london/nw3/" +
  "?price_frequency=per_month&price_min=2000&price_max=3000" +
  "&beds_min=2&beds_max=2&property_sub_type=flat" +
  "&results_sort=newest_listings&search_source=to-rent&pn=1";

console.log("=== Zoopla search · HTTP + RSC parse ===");
const res = await zyteFetch(apiKey, {
  url: SEARCH_URL,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});
console.log(`HTML length: ${res.html.length}`);

const flight = parseFlight(res.html);
console.log(`✓ Parsed ${flight.size} flight rows`);

const listings = findByKey(flight, "regularListingsFormatted") as
  | { regularListingsFormatted?: unknown[] }
  | null;

if (!listings?.regularListingsFormatted || !Array.isArray(listings.regularListingsFormatted)) {
  console.error("✗ regularListingsFormatted not found in flight payload");
  process.exit(1);
}

const arr = listings.regularListingsFormatted;
console.log(`✓ Listings extracted: ${arr.length}`);

if (arr.length === 0) {
  console.warn("⚠ Zero listings — widen search to verify");
  process.exit(0);
}

const first = arr[0] as Record<string, unknown>;
console.log("\nFirst listing keys:");
console.log(`  ${Object.keys(first).sort().join(", ")}`);

console.log("\nFields we expect to use:");
const fields = [
  ["listingId"],
  ["address"],
  ["title"],
  ["priceTitle"],
  ["price"],
  ["priceActual"],
  ["pricePerMonth"],
  ["pricePerWeek"],
  ["pricingMessage"],
  ["alternativeRentFrequencyLabel"],
  ["numBedrooms"],
  ["numBathrooms"],
  ["numLivingRooms"],
  ["propertyType"],
  ["listingType"],
  ["outcode"],
  ["latitude"],
  ["longitude"],
  ["branch", "name"],
  ["branch", "branchId"],
  ["branch", "phone"],
  ["image", "src"],
  ["image", "responsiveImgList"],
  ["images"],
  ["features"],
  ["publishedOn"],
  ["publishedOnLabel"],
  ["listingUris", "detail"],
  ["lozengeContent"],
];
for (const path of fields) {
  try {
    const v = pluck(first, path);
    console.log(`  ✓ .${path.join(".")} → ${summarise(v)}`);
  } catch {
    // skip
  }
}

console.log(`\nSample detail URL: ${(pluckSafe(first, ["listingUris", "detail"]) ?? "(not found)") as string}`);
console.log(`Listing ID: ${(first.listingId as string | number) ?? "(not found)"}`);

function pluckSafe(o: unknown, p: (string | number)[]): unknown {
  try {
    return pluck(o, p);
  } catch {
    return null;
  }
}
