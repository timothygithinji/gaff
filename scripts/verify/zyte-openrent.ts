#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const SEARCH_URL =
  "https://www.openrent.co.uk/properties-to-rent/?" +
  "term=NW3" +
  "&within=1" +
  "&prices_min=2000" +
  "&prices_max=3000" +
  "&bedrooms_min=2" +
  "&bedrooms_max=2" +
  "&isLive=true";

console.log("=== OpenRent search ===");
console.log(`URL: ${SEARCH_URL}\n`);

const res = await zyteFetch(apiKey, {
  url: SEARCH_URL,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});
console.log(`HTML length: ${res.html.length}`);
console.log(`Content-Type: ${res.headers["content-type"]}`);

const html = res.html;

// First marker probe — what's actually in there?
const markers = [
  '<div class="pli">',
  'class="pli ',
  'class="pli"',
  'class="listing-result',
  'class="property-listing',
  "data-listing-id",
  "data-id",
  "data-property-id",
  "/property-to-rent/",
  "listingid=",
];
console.log("\n--- Marker probe ---");
for (const m of markers) {
  const count = (
    html.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []
  ).length;
  console.log(`  ${count > 0 ? "✓" : "·"} ${m} → ${count}`);
}

// Tag landscape: divs with data-* attributes
console.log("\n--- Listing block probe ---");
const dataAttrRe = /<div[^>]+data-[a-z-]+=["']/gi;
const dataDivCount = (html.match(dataAttrRe) || []).length;
console.log(`  <div data-*…>  → ${dataDivCount}`);

// Article/li elements
const articleCount = (html.match(/<article\b/gi) || []).length;
const liCount = (html.match(/<li\b/gi) || []).length;
console.log(`  <article>      → ${articleCount}`);
console.log(`  <li>           → ${liCount}`);

// Pull all data-* attribute names
const allDataAttrs = new Map<string, number>();
for (const m of html.matchAll(/\b(data-[a-z-]+)=/gi)) {
  const name = m[1].toLowerCase();
  allDataAttrs.set(name, (allDataAttrs.get(name) ?? 0) + 1);
}
console.log("\nTop data-* attributes:");
for (const [name, n] of [...allDataAttrs]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)) {
  console.log(`  ${name}: ${n}`);
}

// Look for listing detail URLs
console.log("\n--- Listing URL probe ---");
const urlRe = /href=["'](\/property-to-rent\/[^"']+\/(\d+))["']/g;
const urls = new Set<string>();
const ids = new Set<string>();
for (const m of html.matchAll(urlRe)) {
  urls.add(m[1]);
  ids.add(m[2]);
}
console.log(`  Unique listing URLs: ${urls.size}`);
console.log(`  Unique listing IDs: ${ids.size}`);
const sample = [...urls].slice(0, 5);
for (const u of sample) {
  console.log(`    ${u}`);
}

// Look for JSON-LD or inline JSON
console.log("\n--- Inline data probe ---");
const jsonLdMatches =
  html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>/gi) || [];
console.log(`  application/ld+json scripts: ${jsonLdMatches.length}`);
const initialState = html.match(/window\.\w+\s*=\s*\{/g) || [];
console.log(`  window.X = { ... } assignments: ${initialState.length}`);

// Try first detail URL: pick the first listing ID and fetch its detail
if (ids.size > 0) {
  const firstUrl = [...urls][0];
  const detailUrl = `https://www.openrent.co.uk${firstUrl}`;
  console.log(`\n=== Sample detail page: ${detailUrl} ===`);
  const detail = await zyteFetch(apiKey, {
    url: detailUrl,
    httpResponseBody: true,
    httpResponseHeaders: true,
    geolocation: "GB",
  });
  console.log(`Detail HTML length: ${detail.html.length}`);

  // Look for price/beds/baths markers
  const detailMarkers = [
    /£\s*\d[\d,]*\s*(pcm|per month|pm)/gi,
    /(\d+)\s*bedrooms?/gi,
    /(\d+)\s*bathrooms?/gi,
    /data-price=["'][^"']+["']/gi,
    /data-bedrooms=["'][^"']+["']/gi,
    /data-bathrooms=["'][^"']+["']/gi,
    /"@type":\s*"(?:Apartment|Residence|RentAction|Product)"/gi,
  ];
  console.log("Detail markers:");
  for (const re of detailMarkers) {
    const m = detail.html.match(re) || [];
    console.log(
      `  ${m.length > 0 ? "✓" : "·"} ${re.source} → ${m.length}${m[0] ? `   eg: ${m[0].slice(0, 60)}` : ""}`
    );
  }

  // ld+json on detail
  const detailLd =
    detail.html.match(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ) || [];
  console.log(`  application/ld+json scripts on detail: ${detailLd.length}`);
  if (detailLd[0]) {
    const inner = detailLd[0]
      .replace(/<script[^>]*>/, "")
      .replace(/<\/script>/, "");
    try {
      const parsed = JSON.parse(inner);
      console.log(
        `  ld+json[0] @type: ${(parsed as { "@type"?: string })["@type"]}`
      );
      console.log(
        `  ld+json[0] keys: ${Object.keys(parsed).slice(0, 15).join(", ")}`
      );
    } catch {
      console.log("  ld+json[0] parse failed");
    }
  }
}
