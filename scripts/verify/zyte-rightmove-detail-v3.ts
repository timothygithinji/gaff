#!/usr/bin/env bun
import { parse as flattedParse } from "flatted";
import { zyteFetch } from "./lib/zyte";
import { pluck, summarise } from "./lib/extract";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

function extractWindowPageModelString(html: string): string {
  const start = html.indexOf("window.__PAGE_MODEL");
  const eq = html.indexOf("=", start);
  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== "{") throw new Error("no opening {");
  let depth = 0;
  const startObj = i;
  while (i < html.length) {
    const c = html[i];
    if (c === '"') {
      i++;
      while (i < html.length) {
        if (html[i] === "\\") {
          i += 2;
          continue;
        }
        if (html[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(startObj, i + 1);
    }
    i++;
  }
  throw new Error("unbalanced");
}

const url = "https://www.rightmove.co.uk/properties/88608822";
const res = await zyteFetch(apiKey, { url, httpResponseBody: true, httpResponseHeaders: true, geolocation: "GB" });
console.log(`HTML length: ${res.html.length}`);

const wrapperJson = extractWindowPageModelString(res.html);
const wrapper = JSON.parse(wrapperJson) as { data: string; encoding?: string };
console.log(`Wrapper has data (${wrapper.data.length} chars), encoding=${wrapper.encoding}`);

// `data` is a flatted-encoded JSON string
const root = flattedParse(wrapper.data) as Record<string, unknown>;
console.log(`✓ flatted parsed. Root keys: ${Object.keys(root).join(", ")}`);

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
];
console.log("\nDetail fields:");
for (const path of fields) {
  try {
    const v = pluck(pd, path);
    console.log(`  ✓ .${path.join(".")} → ${summarise(v, 60)}`);
  } catch {
    console.log(`  · .${path.join(".")} → (absent)`);
  }
}

const floorplans = pd.floorplans as Array<{ url?: string; caption?: string }> | undefined;
console.log(`\nFloorplans: ${Array.isArray(floorplans) ? floorplans.length : "(none)"}`);
if (Array.isArray(floorplans) && floorplans.length > 0) {
  console.log(`  First: ${JSON.stringify(floorplans[0])}`);
}

const images = pd.images as Array<{ url?: string; caption?: string }> | undefined;
console.log(`Images: ${Array.isArray(images) ? images.length : "(none)"}`);
if (Array.isArray(images) && images.length > 0) {
  console.log(`  First: ${JSON.stringify(images[0]).slice(0, 200)}`);
}

const stations = pd.nearestStations as Array<{ name?: string; distance?: number; types?: string[] }> | undefined;
if (Array.isArray(stations) && stations.length > 0) {
  console.log(`\nNearest stations:`);
  for (const s of stations.slice(0, 5)) console.log(`  ${s.name} · ${s.distance}mi · ${(s.types ?? []).join("/")}`);
}

const epc = pd.epcGraphs as Array<{ url?: string }> | undefined;
if (Array.isArray(epc) && epc.length > 0) {
  console.log(`\nEPC graph: ${JSON.stringify(epc[0])}`);
}
