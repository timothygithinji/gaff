#!/usr/bin/env bun
import { extractScriptJson, pluck, probe, summarise } from "./lib/extract";
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const detailUrl = "https://www.rightmove.co.uk/properties/88608822";
console.log(`Detail: ${detailUrl}\n`);

const res = await zyteFetch(apiKey, {
  url: detailUrl,
  httpResponseBody: true,
  httpResponseHeaders: true,
  geolocation: "GB",
});
console.log(`HTML length: ${res.html.length}`);

const next = extractScriptJson(res.html, "__NEXT_DATA__");
console.log("✓ __NEXT_DATA__ extracted");

const props = (next as { props?: { pageProps?: object } })?.props?.pageProps;
if (props) {
  console.log(
    `props.pageProps keys: ${Object.keys(props).slice(0, 25).join(", ")}`
  );
}

const candidates: (string | number)[][] = [
  ["props", "pageProps", "propertyData"],
  ["props", "pageProps", "property"],
  ["props", "pageProps", "data"],
];
const found = probe(next, candidates);
if (!found) {
  console.error("✗ No propertyData found");
  process.exit(1);
}
console.log(`✓ propertyData at .${found.path.join(".")}`);

const pd = found.value as Record<string, unknown>;
console.log(
  `Property keys (${Object.keys(pd).length}): ${Object.keys(pd).slice(0, 30).join(", ")}`
);

console.log("\nDetail fields we need:");
const fields = [
  ["id"],
  ["address", "displayAddress"],
  ["address", "outcode"],
  ["address", "incode"],
  ["address", "ukCountry"],
  ["bedrooms"],
  ["bathrooms"],
  ["sizings"],
  ["livingRooms"],
  ["propertySubType"],
  ["propertyType"],
  ["prices", "primaryPrice"],
  ["prices", "secondaryPrice"],
  ["prices", "displayPriceQualifier"],
  ["location", "latitude"],
  ["location", "longitude"],
  ["text", "description"],
  ["text", "shareText"],
  ["text", "propertyPhrase"],
  ["images"],
  ["floorplans"],
  ["epcGraphs"],
  ["lettings", "letAvailableDate"],
  ["lettings", "letType"],
  ["lettings", "furnishType"],
  ["lettings", "deposit"],
  ["customer", "branchName"],
  ["customer", "contactTelephone"],
  ["transactionType"],
  ["status", "published"],
  ["listingHistory", "listingUpdateReason"],
  ["nearestStations"],
  ["nearestSchools"],
];
for (const path of fields) {
  try {
    const v = pluck(pd, path);
    console.log(`  ✓ .${path.join(".")} → ${summarise(v, 60)}`);
  } catch {
    console.log(`  · .${path.join(".")} → (absent)`);
  }
}

// Sample first floorplan + first image
const floorplans = pd.floorplans as
  | Array<{ url?: string; caption?: string }>
  | undefined;
if (floorplans && floorplans.length > 0) {
  console.log(`\n✓ ${floorplans.length} floorplan(s)`);
  console.log(`  First: ${JSON.stringify(floorplans[0]).slice(0, 200)}`);
}

const images = pd.images as
  | Array<{ url?: string; caption?: string }>
  | undefined;
if (images && images.length > 0) {
  console.log(`\n✓ ${images.length} image(s)`);
  console.log(`  First: ${JSON.stringify(images[0]).slice(0, 200)}`);
}

const stations = pd.nearestStations as
  | Array<{ name?: string; distance?: number; types?: string[] }>
  | undefined;
if (stations && stations.length > 0) {
  console.log(`\n✓ ${stations.length} nearest stations:`);
  for (const s of stations.slice(0, 4)) {
    console.log(`    ${s.name} (${s.distance}mi)`);
  }
}
