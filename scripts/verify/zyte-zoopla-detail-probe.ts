#!/usr/bin/env bun
import { parseFlight } from "./lib/rsc-flight";
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const url = "https://www.zoopla.co.uk/to-rent/details/73260251/";
const res = await zyteFetch(apiKey, {
  url,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});
const flight = parseFlight(res.html);
console.log(`Parsed ${flight.size} flight rows`);

// Sample objects from the flight chunks
const sampled: { id: string; keys: string[]; sample: string }[] = [];
for (const [id, value] of flight) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value as object);
    if (keys.length >= 5 && keys.length < 80) {
      const interesting = [
        "listingId",
        "numBedrooms",
        "bedrooms",
        "price",
        "address",
        "description",
        "branch",
        "floorPlan",
        "images",
      ];
      const hits = keys.filter((k) => interesting.includes(k));
      if (hits.length >= 1) {
        sampled.push({
          id,
          keys: keys.slice(0, 20),
          sample: JSON.stringify(value).slice(0, 220),
        });
      }
    }
  }
}

console.log(`\nFound ${sampled.length} candidate objects:`);
for (const s of sampled.slice(0, 12)) {
  console.log(`\n[${s.id}] keys: ${s.keys.join(", ")}`);
  console.log(`  sample: ${s.sample}`);
}

// Search across all flight rows for specific keys
function walkAll(): void {
  let hits = 0;
  const interestingKeys = new Set([
    "listingId",
    "numBedrooms",
    "numBathrooms",
    "price_actual",
    "floor_plan",
    "floorPlan",
    "floorplans",
    "displayAddress",
    "addressLine",
    "rentPerMonth",
    "primaryImage",
  ]);
  const found = new Map<string, number>();
  function visit(v: unknown): void {
    if (v === null || v === undefined) {
      return;
    }
    if (Array.isArray(v)) {
      for (const child of v) {
        visit(child);
      }
      return;
    }
    if (typeof v === "object") {
      for (const k of Object.keys(v as object)) {
        if (interestingKeys.has(k)) {
          found.set(k, (found.get(k) ?? 0) + 1);
          hits++;
        }
        visit((v as Record<string, unknown>)[k]);
      }
    }
  }
  for (const val of flight.values()) {
    visit(val);
  }
  console.log(`\nDeep key hits across all chunks (${hits} total):`);
  for (const [k, n] of [...found].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n}`);
  }
}
walkAll();
