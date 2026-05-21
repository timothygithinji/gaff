#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";
import { extractScriptJson, pluck, probe, summarise } from "./lib/extract";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set. Run with: doppler run -- bun scripts/verify/zyte-rightmove.ts");
  process.exit(1);
}

const SEARCH_URL =
  "https://www.rightmove.co.uk/property-to-rent/find.html" +
  "?locationIdentifier=OUTCODE%5E1859" + // NW3
  "&searchType=RENT" +
  "&radius=0.0" +
  "&minPrice=2000" +
  "&maxPrice=3000" +
  "&minBedrooms=2" +
  "&maxBedrooms=2" +
  "&propertyTypes=flat" +
  "&maxDaysSinceAdded=7" +
  "&sortType=6" +
  "&index=0";

console.log("=== Rightmove search ===");
console.log(`URL: ${SEARCH_URL}\n`);

const search = await zyteFetch(apiKey, {
  url: SEARCH_URL,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});

console.log(`HTML length: ${search.html.length}`);
console.log(`Content-Type: ${search.headers["content-type"]}`);

let nextData: unknown;
try {
  nextData = extractScriptJson(search.html, "__NEXT_DATA__");
  console.log("✓ __NEXT_DATA__ extracted");
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  console.error(`First 1KB of HTML:\n${search.html.slice(0, 1024)}`);
  process.exit(1);
}

// Probe for the listings array — Rightmove has changed this before
const candidatePaths: (string | number)[][] = [
  ["props", "pageProps", "searchResults", "properties"],
  ["props", "pageProps", "searchResults", "results"],
  ["props", "pageProps", "searchResults", "data", "properties"],
  ["props", "pageProps", "searchResult", "properties"],
  ["props", "pageProps", "properties"],
  ["query", "results", "properties"],
];

// Inspect searchResults shape if probe still fails
const sr = (nextData as { props?: { pageProps?: { searchResults?: object } } })?.props?.pageProps?.searchResults;
if (sr) {
  console.log(`\nsearchResults keys: ${Object.keys(sr).join(", ")}`);
}

const found = probe(nextData, candidatePaths);
if (!found) {
  console.error("✗ Could not find listings array at any expected path");
  console.error(`Top-level keys: ${Object.keys(nextData as object).join(", ")}`);
  const props = (nextData as { props?: { pageProps?: object } })?.props?.pageProps;
  if (props) console.error(`props.pageProps keys: ${Object.keys(props).join(", ")}`);
  process.exit(1);
}

console.log(`✓ Listings at .${found.path.join(".")}`);
const listings = found.value as unknown[];
console.log(`  count: ${listings.length}`);

if (listings.length === 0) {
  console.warn("⚠ Empty listings array — wider search may be needed");
  process.exit(0);
}

const first = listings[0] as Record<string, unknown>;
console.log("\nFirst listing keys:");
console.log(`  ${Object.keys(first).slice(0, 30).join(", ")}`);

console.log("\nFields we expect to use:");
const fields = [
  ["id"],
  ["bedrooms"],
  ["bathrooms"],
  ["propertySubType"],
  ["propertyTypeFullDescription"],
  ["displayAddress"],
  ["price", "amount"],
  ["price", "displayPrices", 0, "displayPrice"],
  ["location", "latitude"],
  ["location", "longitude"],
  ["propertyImages", "images"],
  ["floorplans"],
  ["propertyUrl"],
  ["listingUpdate"],
  ["customer", "branchName"],
];
for (const path of fields) {
  try {
    const v = pluck(first, path);
    console.log(`  ✓ .${path.join(".")} → ${summarise(v)}`);
  } catch (err) {
    console.log(`  ✗ .${path.join(".")} → ${(err as Error).message}`);
  }
}

// Pick a listing URL we can use for the detail test
const propertyUrl = (first.propertyUrl as string | undefined) ?? "";
if (propertyUrl) {
  console.log(`\nSample detail URL: https://www.rightmove.co.uk${propertyUrl}`);
}

console.log(`\nTotal cost: $${search.costEstimateUsd.toFixed(5)}`);
