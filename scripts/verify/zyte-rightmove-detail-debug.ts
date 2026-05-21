#!/usr/bin/env bun
import { parse as flattedParse } from "flatted";
import { zyteFetch } from "./lib/zyte";

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

const wrapper = JSON.parse(extractWindowPageModelString(res.html)) as { data: string };
console.log(`Wrapper.data type: ${typeof wrapper.data}`);
console.log(`Wrapper.data first 250 chars: ${wrapper.data.slice(0, 250)}`);
console.log(`Wrapper.data ends: …${wrapper.data.slice(-200)}`);

// First — confirm the inner is actually an array as flatted expects
const innerStart = wrapper.data.trim()[0];
console.log(`Inner first char: '${innerStart}'`);

// Try directly JSON.parsing first since maybe it's NOT flatted
try {
  const direct = JSON.parse(wrapper.data);
  console.log(`✓ Direct JSON.parse works. Type: ${Array.isArray(direct) ? "array" : typeof direct}`);
  if (Array.isArray(direct)) {
    console.log(`  Length: ${direct.length}`);
    const root = direct[0];
    console.log(`  Root keys: ${Object.keys(root).join(", ")}`);
    const pdRef = root.propertyData;
    console.log(`  root.propertyData = ${pdRef} (type ${typeof pdRef})`);

    // If it's a number, dereference manually
    if (typeof pdRef === "number") {
      console.log(`  Manually resolving array[${pdRef}]`);
      const pd = direct[pdRef] as Record<string, unknown>;
      console.log(`  Resolved propertyData keys (${Object.keys(pd).length}): ${Object.keys(pd).slice(0, 30).join(", ")}`);
      // Sample some integer values to see if they're also refs
      const sampleKey = "bedrooms";
      if (sampleKey in pd) console.log(`  pd.${sampleKey} = ${pd[sampleKey]} (type ${typeof pd[sampleKey]})`);
      const fields = ["id", "bedrooms", "bathrooms", "displayAddress", "address", "prices", "floorplans", "images", "location", "text", "lettings", "customer", "nearestStations"];
      for (const f of fields) {
        const v = (pd as Record<string, unknown>)[f];
        if (typeof v === "number") {
          const resolved = direct[v];
          console.log(`  ${f}: ref ${v} → ${resolved === null ? "null" : Array.isArray(resolved) ? `array(${resolved.length})` : typeof resolved === "object" ? `obj{${Object.keys(resolved as object).slice(0, 5).join(",")}}` : JSON.stringify(resolved).slice(0, 50)}`);
        } else {
          console.log(`  ${f}: ${typeof v === "object" ? "(inline obj)" : JSON.stringify(v)}`);
        }
      }
    }
  }
} catch (err) {
  console.error(`Direct JSON.parse failed: ${(err as Error).message}`);
}

console.log("\n--- Now trying flatted ---");
const fp = flattedParse(wrapper.data) as unknown;
console.log(`Type: ${Array.isArray(fp) ? "array" : typeof fp}`);
console.log(`Constructor: ${fp?.constructor?.name}`);
const k = Object.keys(fp as object);
const own = Reflect.ownKeys(fp as object);
console.log(`Object.keys: ${k.length} → ${k.join(", ")}`);
console.log(`Reflect.ownKeys: ${own.length} → ${own.map(String).slice(0, 20).join(", ")}`);
const fpAny = fp as Record<string, unknown>;
if (fpAny.propertyData) {
  const pd = fpAny.propertyData;
  console.log(`flatted root.propertyData type: ${typeof pd}, value: ${typeof pd === "object" ? "(object)" : pd}`);
  if (pd && typeof pd === "object") {
    const pdKeys = Reflect.ownKeys(pd);
    console.log(`pd Reflect.ownKeys: ${pdKeys.length} → ${pdKeys.map(String).slice(0, 20).join(", ")}`);
  }
}
