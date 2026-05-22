#!/usr/bin/env bun
import { pluck, summarise } from "./lib/extract";
import { extractRightmoveModel } from "./lib/rightmove-page-model";
import { zyteFetch } from "./lib/zyte";

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
console.log(`HTML length: ${res.html.length}`);

const root = extractRightmoveModel(res.html) as Record<string, unknown>;
console.log(
  `✓ __PAGE_MODEL resolved. Root keys: ${Object.keys(root).join(", ")}`
);

const pd = root.propertyData as Record<string, unknown>;
console.log(`\npropertyData keys (${Object.keys(pd).length}):`);
console.log(`  ${Object.keys(pd).sort().join(", ")}`);

const fields = [
  ["id"],
  ["bedrooms"],
  ["bathrooms"],
  ["sizings"],
  ["propertySubType"],
  ["address", "displayAddress"],
  ["address", "outcode"],
  ["address", "incode"],
  ["address", "ukCountry"],
  ["prices", "primaryPrice"],
  ["prices", "secondaryPrice"],
  ["prices", "displayPriceQualifier"],
  ["location", "latitude"],
  ["location", "longitude"],
  ["text", "description"],
  ["text", "propertyPhrase"],
  ["lettings", "letAvailableDate"],
  ["lettings", "letType"],
  ["lettings", "furnishType"],
  ["lettings", "deposit"],
  ["customer", "branchName"],
  ["customer", "branchDisplayName"],
  ["customer", "contactTelephone"],
  ["transactionType"],
  ["status"],
];
console.log("\nDetail fields:");
for (const path of fields) {
  try {
    const v = pluck(pd, path);
    console.log(`  ✓ .${path.join(".")} → ${summarise(v, 80)}`);
  } catch {
    console.log(`  · .${path.join(".")} → (absent)`);
  }
}

const floorplans = pd.floorplans as unknown[] | undefined;
console.log(
  `\nFloorplans: ${Array.isArray(floorplans) ? floorplans.length : 0}`
);
if (Array.isArray(floorplans) && floorplans.length > 0) {
  console.log(`  First: ${JSON.stringify(floorplans[0]).slice(0, 250)}`);
}

const images = pd.images as unknown[] | undefined;
console.log(`Images: ${Array.isArray(images) ? images.length : 0}`);
if (Array.isArray(images) && images.length > 0) {
  console.log(`  First: ${JSON.stringify(images[0]).slice(0, 250)}`);
}

const stations = pd.nearestStations as
  | Array<{ name?: string; distance?: number; types?: string[] }>
  | undefined;
if (Array.isArray(stations) && stations.length > 0) {
  console.log("\nNearest stations:");
  for (const s of stations.slice(0, 5)) {
    console.log(`  ${s.name} · ${s.distance}mi · ${(s.types ?? []).join("/")}`);
  }
}

const epc = pd.epcGraphs as Array<{ url?: string }> | undefined;
if (Array.isArray(epc) && epc.length > 0) {
  console.log(`\nEPC graph: ${JSON.stringify(epc[0])}`);
}

const keyFeatures = pd.keyFeatures as string[] | undefined;
if (Array.isArray(keyFeatures) && keyFeatures.length > 0) {
  console.log(`\nKey features: ${keyFeatures.slice(0, 6).join(" · ")}`);
}
