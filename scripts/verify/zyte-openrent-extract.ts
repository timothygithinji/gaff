#!/usr/bin/env bun
/**
 * Confirm OpenRent extraction strategy: title + h1 + structural DOM walk.
 */
import { parse } from "node-html-parser";
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£");
}

const detailUrl =
  "https://www.openrent.co.uk/property-to-rent/london/3-bed-flat-rosslyn-hill-nw3/2829191";
console.log(`Detail: ${detailUrl}\n`);

const res = await zyteFetch(apiKey, {
  url: detailUrl,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});
const html = res.html;
const root = parse(html);

// 1. <title> headline parse
const titleText = decodeEntities(root.querySelector("title")?.text ?? "");
console.log(`Title: ${titleText}`);

const titleRe =
  /^(?:.+?)\s*-\s*(\d+)\s*Bed\s*([A-Za-z]+),\s*(.+?),\s*([A-Z]{1,2}\d{1,2}[A-Z]?)\s*-\s*To Rent[^£]*?£([\d,]+(?:\.\d+)?)\s*(?:p\/m|pm|pcm)/i;
const m = titleText.match(titleRe);
if (m) {
  console.log(`  ✓ beds: ${m[1]}`);
  console.log(`  ✓ type: ${m[2]}`);
  console.log(`  ✓ street: ${m[3]}`);
  console.log(`  ✓ postcode: ${m[4]}`);
  console.log(`  ✓ rent: £${m[5]}/mo`);
} else {
  console.log("  ✗ title regex did not match");
}

// 2. Meta tag pulls
console.log("\n--- Meta tags ---");
const metas = ["og:title", "og:description", "og:image", "twitter:description"];
for (const name of metas) {
  const el = root.querySelector(
    `meta[property="${name}"], meta[name="${name}"]`
  );
  const v = el?.getAttribute("content") ?? "";
  console.log(`  ${name}: ${decodeEntities(v).slice(0, 120)}`);
}

// 3. Latitude/longitude — usually in JSON-ish JS or attributes
console.log("\n--- Lat/Lng probe ---");
const latLngVariants = [
  /var\s+(lat|latitude)\s*=\s*(-?\d+\.\d+)/i,
  /var\s+(lng|longitude|lon)\s*=\s*(-?\d+\.\d+)/i,
  /"lat"\s*:\s*(-?\d+\.\d+)/,
  /"lng"\s*:\s*(-?\d+\.\d+)/,
  /data-lat=["'](-?\d+\.\d+)["']/,
  /data-lng=["'](-?\d+\.\d+)["']/,
  /center=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /maps[^"]*?(-?\d+\.\d{4,}),(-?\d+\.\d{4,})/,
];
for (const re of latLngVariants) {
  const matchVal = html.match(re);
  console.log(
    `  ${matchVal ? "✓" : "·"} ${re.source} → ${matchVal ? matchVal.slice(1).join(",") : "(none)"}`
  );
}

// 4. Photo URLs
console.log("\n--- Photo probe ---");
const allImgs = root
  .querySelectorAll("img")
  .map((img) => img.getAttribute("src") || img.getAttribute("data-src") || "")
  .filter(Boolean);
const photoLike = allImgs.filter(
  (u) => /openrent|photos|cdn/i.test(u) && !/icon|logo|sprite/i.test(u)
);
console.log(`  Total <img> elements: ${allImgs.length}`);
console.log(`  Likely photo URLs: ${photoLike.length}`);
for (const u of photoLike.slice(0, 4)) {
  console.log(`    ${u}`);
}

// 5. EPC + Bills + Furnished + Deposit — text-block walk
console.log("\n--- Text feature probe ---");
const bodyText = decodeEntities(root.text.replace(/\s+/g, " "));
const features = [
  { name: "EPC", re: /EPC[\s:]+([A-G])\b/i },
  { name: "Furnished", re: /\b(Furnished|Unfurnished|Part[- ]?Furnished)\b/i },
  { name: "Bills incl.", re: /Bills\s+Included[^a-z]*?\b(Yes|No)\b/i },
  { name: "Deposit", re: /Deposit[^£]*?£([\d,]+)/i },
  {
    name: "Available from",
    re: /Available\s+from[^A-Z0-9]*?([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|today|now|immediately)/i,
  },
];
for (const f of features) {
  const fm = bodyText.match(f.re);
  console.log(
    `  ${fm ? "✓" : "·"} ${f.name}: ${fm ? fm[0].slice(0, 60) : "(not found)"}`
  );
}

// 6. Floor plan — OpenRent usually has a floorplan image in the same gallery, or none at all
console.log("\n--- Floor plan probe ---");
const fpHints = photoLike.filter((u) => /floor.?plan/i.test(u));
console.log(`  Filename-based floorplan: ${fpHints.length}`);
const fpTextHit = /floor\s*plan/i.test(bodyText);
console.log(`  Body mentions "floor plan": ${fpTextHit}`);

// 7. Description
console.log("\n--- Description probe ---");
const descBlocks = root.querySelectorAll(
  'div[class*="description"], section[class*="description"], div[id*="description"]'
);
console.log(`  Candidate description blocks: ${descBlocks.length}`);
if (descBlocks[0]) {
  const txt = descBlocks[0].text.replace(/\s+/g, " ").slice(0, 200);
  console.log(`  First block sample: ${txt}…`);
}
const ogDesc =
  root
    .querySelector('meta[name="twitter:description"]')
    ?.getAttribute("content") ?? "";
console.log(`  twitter:description length: ${decodeEntities(ogDesc).length}`);
