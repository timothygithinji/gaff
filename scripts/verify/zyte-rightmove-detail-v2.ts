#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";
import { pluck, summarise } from "./lib/extract";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

function extractWindowPageModel(html: string): unknown {
  // Find: window.__PAGE_MODEL = {...};
  const start = html.indexOf("window.__PAGE_MODEL");
  if (start === -1) throw new Error("window.__PAGE_MODEL not found");
  const eq = html.indexOf("=", start);
  if (eq === -1) throw new Error("= not found after __PAGE_MODEL");
  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== "{") throw new Error(`Expected '{' at ${i}, got '${html[i]}'`);
  // Walk forward tracking brace + string state to find matching close
  let depth = 0;
  const startObj = i;
  while (i < html.length) {
    const c = html[i];
    if (c === '"') {
      // skip string
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
      if (depth === 0) {
        const src = html.slice(startObj, i + 1);
        return JSON.parse(src);
      }
    }
    i++;
  }
  throw new Error("Could not find end of __PAGE_MODEL object");
}

const url = "https://www.rightmove.co.uk/properties/88608822";
const res = await zyteFetch(apiKey, { url, httpResponseBody: true, httpResponseHeaders: true, geolocation: "GB" });
console.log(`HTML length: ${res.html.length}`);

let model: unknown;
try {
  model = extractWindowPageModel(res.html);
  console.log("✓ __PAGE_MODEL extracted");
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}

console.log(`Top-level keys: ${Object.keys(model as object).join(", ")}`);
console.log(`Top-level keys count: ${Object.keys(model as object).length}`);

// First inspect the shape — is it { propertyData: {...} } directly or a deduped-ref serializer?
const m = model as Record<string, unknown>;

// Most likely shape: { propertyData: {...} } as a normal object
for (const key of Object.keys(m)) {
  const v = m[key];
  console.log(`  ${key}: ${summarise(v, 80)}`);
}

// If propertyData exists at top, inspect it
const pd = (m.propertyData ?? null) as Record<string, unknown> | null;
if (pd) {
  console.log(`\n✓ propertyData direct (${Object.keys(pd).length} keys):`);
  console.log(`  ${Object.keys(pd).slice(0, 30).join(", ")}`);

  const fields = [
    ["id"],
    ["bedrooms"],
    ["bathrooms"],
    ["sizings"],
    ["propertySubType"],
    ["address", "displayAddress"],
    ["address", "outcode"],
    ["address", "incode"],
    ["prices", "primaryPrice"],
    ["prices", "secondaryPrice"],
    ["location", "latitude"],
    ["location", "longitude"],
    ["images"],
    ["floorplans"],
    ["epcGraphs"],
    ["text", "description"],
    ["text", "propertyPhrase"],
    ["lettings", "letAvailableDate"],
    ["lettings", "furnishType"],
    ["lettings", "deposit"],
    ["lettings", "letType"],
    ["customer", "branchName"],
    ["nearestStations"],
    ["status"],
  ];
  console.log("\nFields:");
  for (const path of fields) {
    try {
      const v = pluck(pd, path);
      console.log(`  ✓ .${path.join(".")} → ${summarise(v, 60)}`);
    } catch {
      console.log(`  · .${path.join(".")} → (absent)`);
    }
  }

  const floorplans = pd.floorplans as Array<{ url?: string }> | undefined;
  if (Array.isArray(floorplans) && floorplans.length > 0) {
    console.log(`\nFirst floorplan: ${JSON.stringify(floorplans[0])}`);
  }
  const images = pd.images as Array<{ url?: string }> | undefined;
  if (Array.isArray(images) && images.length > 0) {
    console.log(`First image: ${JSON.stringify(images[0])}`);
  }
  const stations = pd.nearestStations as Array<{ name?: string; distance?: number }> | undefined;
  if (Array.isArray(stations) && stations.length > 0) {
    console.log(`\nStations:`);
    for (const s of stations.slice(0, 4)) console.log(`  ${s.name} (${s.distance}mi)`);
  }
}
