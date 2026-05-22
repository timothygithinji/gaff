#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const detailUrl =
  "https://www.openrent.co.uk/property-to-rent/london/3-bed-flat-rosslyn-hill-nw3/2829191";
console.log(`Probing: ${detailUrl}\n`);

const res = await zyteFetch(apiKey, {
  url: detailUrl,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});
console.log(`HTML length: ${res.html.length}`);

const html = res.html;

// First — does it look like a real listing page or a soft block / redirect?
console.log("\n--- Title + heading inspection ---");
const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
console.log(`<title>: ${titleMatch?.[1]?.trim().slice(0, 100) ?? "(none)"}`);
const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
console.log(
  `First <h1>: ${
    h1Match?.[1]
      ?.replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 100) ?? "(none)"
  }`
);

// Look for price in any form
console.log("\n--- Price probe ---");
const priceVariants = [
  /£\s*\d{1,4},?\d{0,3}/g,
  /\$\s*\d+/g,
  /(\d{1,2}[,\d]{0,4})\s*per\s*month/gi,
  /(\d{1,2}[,\d]{0,4})\s*pcm/gi,
  /(\d{1,2}[,\d]{0,4})\s*pw/gi,
  /id=["']pricelisting/gi,
  /class=["'][^"']*pricetext/gi,
  /class=["'][^"']*price[^"']*/gi,
];
for (const re of priceVariants) {
  const m = [...html.matchAll(re)].slice(0, 3).map((x) => x[0].slice(0, 60));
  console.log(
    `  ${m.length > 0 ? "✓" : "·"} ${re.source} → ${m.length}${m[0] ? `  eg: ${JSON.stringify(m)}` : ""}`
  );
}

// Look for property feature markers
console.log("\n--- Feature/keyword probe ---");
const features = [
  "bedrooms",
  "bathrooms",
  "Bedrooms",
  "Bathrooms",
  "Furnished",
  "Unfurnished",
  "Available from",
  "Deposit",
  "Bills Included",
  "EPC",
];
for (const f of features) {
  const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const count = (html.match(re) || []).length;
  console.log(`  ${count > 0 ? "✓" : "·"} ${f}: ${count}`);
}

// Top class names
console.log("\n--- Top class names ---");
const classCounts = new Map<string, number>();
for (const m of html.matchAll(/\bclass=["']([^"']+)["']/g)) {
  for (const cls of m[1].split(/\s+/)) {
    if (cls) {
      classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
    }
  }
}
for (const [cls, n] of [...classCounts]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)) {
  console.log(`  ${cls}: ${n}`);
}

// Inline script content — is there a __INITIAL_DATA__ or similar JS payload?
console.log("\n--- Inline JS data probe ---");
const inlineScripts = [
  ...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
]
  .map((m) => m[1])
  .filter((s) => s.length > 200);
console.log(`Total inline <script>s > 200 chars: ${inlineScripts.length}`);

const interestingTokens = [
  "pricePerMonth",
  "PROPERTY",
  "Listing",
  "bedrooms:",
  "bathrooms:",
  "rentPcm",
  "let pm =",
  "ldata",
  "ListingData",
  "var description",
];
for (const tok of interestingTokens) {
  let hits = 0;
  for (const s of inlineScripts) {
    if (s.includes(tok)) {
      hits++;
    }
  }
  console.log(`  ${hits > 0 ? "✓" : "·"} ${tok}: ${hits}`);
}

// Find first script containing 'PROPERTY' or similar — sample it
const candidate = inlineScripts.find((s) =>
  /PROPERTY|listing|pricePerMonth|rentPcm/i.test(s)
);
if (candidate) {
  console.log("\nFirst interesting inline script (700 chars):");
  console.log(candidate.slice(0, 700));
}

// Dump a 2KB sample around the first £ sign or 'bedroom' word
const anchors = [/£/, /[Bb]edroom/, /[Pp]er month/];
for (const a of anchors) {
  const idx = html.search(a);
  if (idx !== -1) {
    const slice = html.slice(Math.max(0, idx - 200), idx + 400);
    console.log(`\nContext around first match of /${a.source}/ (idx ${idx}):`);
    console.log(slice.replace(/\s+/g, " ").slice(0, 600));
    break;
  }
}
