#!/usr/bin/env bun
import { zyteFetch } from "./lib/zyte";
import { parseFlight } from "./lib/rsc-flight";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

const url = "https://www.zoopla.co.uk/to-rent/details/73260251/";
const res = await zyteFetch(apiKey, { url, httpResponseBody: true, httpResponseHeaders: true, geolocation: "GB" });
const flight = parseFlight(res.html);
console.log(`Parsed ${flight.size} flight rows\n`);

const triggerKeys = new Set(["numBedrooms", "displayAddress", "floorPlan"]);

function* allObjects(node: unknown): Generator<Record<string, unknown>> {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const c of node) yield* allObjects(c);
    return;
  }
  if (typeof node === "object") {
    yield node as Record<string, unknown>;
    for (const k of Object.keys(node as object)) {
      yield* allObjects((node as Record<string, unknown>)[k]);
    }
  }
}

function run(): void {
  const printed = new Set<string>();
  let count = 0;
  for (const val of flight.values()) {
    for (const obj of allObjects(val)) {
      const keys = Object.keys(obj);
      const triggered = keys.some((k) => triggerKeys.has(k));
      if (!triggered) continue;
      const sig = keys.slice().sort().slice(0, 6).join(",");
      if (printed.has(sig)) continue;
      printed.add(sig);
      count++;
      console.log(`\n--- object #${count} ---`);
      console.log(`keys (${keys.length}): ${keys.sort().join(", ")}`);
      const sample = JSON.stringify(obj).slice(0, 350);
      console.log(`sample: ${sample}`);
      if (count >= 8) return;
    }
  }
}
run();
