#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";
import { findInFlight, findByKey, parseFlight } from "./lib/rsc-flight";
import { pluck, summarise } from "./lib/extract";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const url = "https://www.zoopla.co.uk/to-rent/details/73260251/";
console.log(`Detail: ${url}\n`);
const res = await zyteFetch(apiKey, { url, httpResponseBody: true, httpResponseHeaders: true, geolocation: "GB" });
console.log(`HTML length: ${res.html.length}`);

const flight = parseFlight(res.html);
console.log(`Parsed ${flight.size} flight rows`);

// Find the property detail object — look for `listing` with bedrooms/bathrooms
let candidate = findInFlight(
  flight,
  (v) =>
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "numBedrooms" in (v as object) &&
    "address" in (v as object) &&
    "branch" in (v as object),
);

if (!candidate) {
  candidate = findInFlight(
    flight,
    (v) =>
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      ("counts" in (v as object) || "numBedrooms" in (v as object)) &&
      "address" in (v as object),
  );
}

if (!candidate) {
  candidate = findByKey(flight, "listingDetails");
  if (candidate) candidate = (candidate as { listingDetails: unknown }).listingDetails;
}

if (!candidate) {
  console.error("✗ No listing-like object found");
  process.exit(1);
}

const c = candidate as Record<string, unknown>;
console.log(`✓ Listing object (${Object.keys(c).length} keys)`);
console.log(`  Keys: ${Object.keys(c).sort().join(", ")}`);

const fields = [
  ["listingId"],
  ["id"],
  ["title"],
  ["displayAddress"],
  ["address"],
  ["outcode"],
  ["incode"],
  ["price"],
  ["pricing", "label"],
  ["priceTitle"],
  ["pricePerMonth"],
  ["numBedrooms"],
  ["numBathrooms"],
  ["numLivingRooms"],
  ["propertyType"],
  ["listingType"],
  ["location", "coordinates", "latitude"],
  ["location", "coordinates", "longitude"],
  ["coordinates", "latitude"],
  ["coordinates", "longitude"],
  ["latitude"],
  ["longitude"],
  ["counts", "numBedrooms"],
  ["counts", "numBathrooms"],
  ["counts", "numLivingRooms"],
  ["images"],
  ["gallery"],
  ["floorPlan"],
  ["floorplans"],
  ["numberOfFloorPlans"],
  ["features"],
  ["description"],
  ["branch", "name"],
  ["branch", "phone"],
  ["availableFrom"],
  ["publishedOn"],
  ["sizeSqft"],
];
console.log("\nDetail fields:");
for (const path of fields) {
  try {
    const v = pluck(c, path);
    console.log(`  ✓ .${path.join(".")} → ${summarise(v, 80)}`);
  } catch {
    // skip absent
  }
}

// Look for floorplans separately if not nested
const fp = findInFlight(flight, (v) => v !== null && typeof v === "object" && !Array.isArray(v) && ("floorPlan" in (v as object) || "floorplans" in (v as object)));
if (fp) {
  const o = fp as Record<string, unknown>;
  console.log("\nFloorplan-bearing object found:");
  if (o.floorPlan) console.log(`  floorPlan: ${JSON.stringify(o.floorPlan).slice(0, 250)}`);
  if (o.floorplans) console.log(`  floorplans: ${JSON.stringify(o.floorplans).slice(0, 250)}`);
}

// Description
const desc = findInFlight(flight, (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "description" in (v as object) && typeof (v as { description: unknown }).description === "string" && ((v as { description: string }).description.length > 50));
if (desc) {
  const d = (desc as { description: string }).description;
  console.log(`\nDescription (first 200 chars):\n  ${d.slice(0, 200)}…`);
}
