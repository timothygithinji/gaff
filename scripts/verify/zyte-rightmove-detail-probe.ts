#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";
import { parseFlight, findByKey, findInFlight } from "./lib/rsc-flight";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const url = "https://www.rightmove.co.uk/properties/88608822";
const res = await zyteFetch(apiKey, {
  url,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});
const html = res.html;
console.log(`HTML length: ${html.length}`);

// Marker probe
const markers = [
  "__NEXT_DATA__",
  "__next_f",
  "self.__next_f.push",
  "PRELOADED_STATE",
  "INITIAL_PROPS",
  '"floorplans"',
  '"propertyData"',
  '"bedrooms"',
  '"prices"',
  '"primaryPrice"',
];
console.log("\n--- Marker probe ---");
for (const m of markers) {
  const count = (html.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log(`  ${count > 0 ? "✓" : "·"} ${m} → ${count}`);
}

// Try RSC flight parse
const flight = parseFlight(html);
console.log(`\n✓ Parsed ${flight.size} flight rows`);

// Look for the property data via deep key search
const pd = findByKey(flight, "propertyData") as { propertyData?: Record<string, unknown> } | null;
if (pd?.propertyData) {
  console.log("✓ propertyData found");
  const d = pd.propertyData;
  console.log(`  Keys (${Object.keys(d).length}): ${Object.keys(d).slice(0, 25).join(", ")}`);
} else {
  console.log("· propertyData not at top level — searching deeply");
  // Try looking for any object with .bedrooms + .prices
  const candidate = findInFlight(
    flight,
    (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "bedrooms" in (v as object) && "prices" in (v as object),
  );
  if (candidate) {
    const c = candidate as Record<string, unknown>;
    console.log(`✓ Found via bedrooms+prices probe. Keys: ${Object.keys(c).slice(0, 25).join(", ")}`);
  } else {
    // Try a broader probe — bedrooms + propertySubType
    const c2 = findInFlight(
      flight,
      (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "bedrooms" in (v as object) && "id" in (v as object),
    );
    if (c2) {
      const c = c2 as Record<string, unknown>;
      console.log(`✓ Found via bedrooms+id probe. Keys: ${Object.keys(c).slice(0, 30).join(", ")}`);
    } else {
      console.log("✗ No matching object found in flight chunks");
    }
  }
}

// Also look for floorplans + images arrays specifically
const floorplansContainer = findInFlight(
  flight,
  (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "floorplans" in (v as object),
);
if (floorplansContainer) {
  const f = (floorplansContainer as { floorplans: unknown }).floorplans;
  if (Array.isArray(f)) {
    console.log(`\n✓ floorplans array: ${f.length} entries`);
    console.log(`  First: ${JSON.stringify(f[0]).slice(0, 220)}`);
  }
}

const imagesContainer = findInFlight(
  flight,
  (v) =>
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "images" in (v as object) &&
    Array.isArray((v as { images: unknown }).images) &&
    (v as { images: unknown[] }).images.length > 3,
);
if (imagesContainer) {
  const i = (imagesContainer as { images: unknown[] }).images;
  console.log(`\n✓ images array: ${i.length} entries`);
  console.log(`  First: ${JSON.stringify(i[0]).slice(0, 220)}`);
}
