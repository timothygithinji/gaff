#!/usr/bin/env bun
/**
 * Probe Zoopla HTML to figure out where the listings data actually lives now.
 */
import { zyteFetch } from "./lib/zyte";

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

console.log("Fetching Zoopla via HTTP...");
const res = await zyteFetch(apiKey, {
  url: SEARCH_URL,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});

const html = res.html;
console.log(`HTML length: ${html.length}`);

// Look for known marker patterns
const markers = [
  "__NEXT_DATA__",
  "__next_f",
  "__NEXT_LOADED",
  "__INITIAL_STATE__",
  "__APOLLO_STATE__",
  "self.__next_f.push",
  '"listingId"',
  '"listing_id"',
  'data-testid="listing"',
  'data-testid="search-result-list"',
  "regularListingsFormatted",
  'props\\\\\\\\":',
];
console.log("\n--- Marker probe ---");
for (const m of markers) {
  const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const count = (html.match(re) || []).length;
  console.log(`  ${count > 0 ? "✓" : "·"} ${m} → ${count}`);
}

// Pull all <script> ids / sources to see what's there
console.log("\n--- Script tag landscape ---");
const scriptRe = /<script\b([^>]*)>/gi;
const ids = new Map<string, number>();
const srcs: string[] = [];
for (const match of html.matchAll(scriptRe)) {
  const attrs = match[1];
  const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
  const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (idMatch) {
    ids.set(idMatch[1], (ids.get(idMatch[1]) ?? 0) + 1);
  }
  if (srcMatch) {
    srcs.push(srcMatch[1]);
  }
}
console.log(`Inline script ids (${ids.size} unique):`);
for (const [id, n] of [...ids].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${id}: ${n}`);
}
console.log(`Total external scripts: ${srcs.length}`);
const flightChunks = srcs.filter((s) => s.includes("/_next/")).slice(0, 5);
if (flightChunks.length > 0) {
  console.log("Sample /_next/ chunks:");
  for (const s of flightChunks) {
    console.log(`  ${s}`);
  }
}

// Try to extract one RSC flight chunk and see if listings JSON is in there
console.log("\n--- RSC flight chunk inspection ---");
const flightRe = /self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/g;
const chunks: string[] = [];
for (const m of html.matchAll(flightRe)) {
  // Unescape JSON-style escapes inside the string literal
  const raw = m[1]
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
  chunks.push(raw);
}
console.log(`Found ${chunks.length} RSC flight chunks`);
const haystack = chunks.join("\n---\n");
console.log(`Combined length: ${haystack.length}`);

const interestingKeys = [
  "listingId",
  "listing_id",
  "price_actual",
  "pricing",
  "numBedrooms",
  "num_bedrooms",
  "propertyType",
  "property_type",
  "displayAddress",
  "branch_details",
  "agent_name",
  "outcode",
  "postcode",
  "latitude",
];
console.log("Interesting keys present in flight chunks:");
for (const k of interestingKeys) {
  const n = (haystack.match(new RegExp(`"${k}"`, "g")) || []).length;
  console.log(`  ${n > 0 ? "✓" : "·"} ${k}: ${n}`);
}

// Show a sample of the largest chunk
const sorted = chunks.slice().sort((a, b) => b.length - a.length);
if (sorted[0]) {
  console.log(`\nLargest chunk (${sorted[0].length} chars), first 600:`);
  console.log(sorted[0].slice(0, 600));
}

// Also probe for direct HTML elements (the simplest fallback)
console.log("\n--- DOM hint probe ---");
const domHints = [
  /data-testid=["']listing-/g,
  /data-testid=["']search-result/g,
  /<article[^>]+data-/g,
  /data-listing-id=["']/g,
];
for (const re of domHints) {
  const count = (html.match(re) || []).length;
  console.log(`  ${count > 0 ? "✓" : "·"} ${re.source} → ${count}`);
}
