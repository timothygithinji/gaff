#!/usr/bin/env bun
/**
 * Live gap analyzer.
 *
 * Hits Zyte for one detail page per portal, then runs the parser-aware
 * gap diff to surface fields our parser ignores. Same shape as
 * parser-gaps.ts but the HTML source is live rather than fixture-backed.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/verify/parser-gaps-live.ts
 *
 * Cost: ~3 Zyte requests (~$0.0024).
 */

import { parse as parseHtml } from "node-html-parser";
import {
  parseOpenrentDetail,
  parseRightmoveDetail,
  parseZooplaDetail,
} from "../../src/lib/parsers";
import { extractRightmoveModel } from "../../src/lib/parsers/page-model";
import {
  findByKey,
  findInFlight,
  parseFlight,
} from "../../src/lib/parsers/rsc-flight";
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error(
    "ZYTE_API_KEY not set — run via `doppler run … -- bun scripts/verify/parser-gaps-live.ts`"
  );
  process.exit(1);
}

// What our production parsers emit. Keep aligned with src/lib/parsers/types.ts.
const SURFACED_DETAIL_KEYS = new Set<string>([
  "portal",
  "portalListingId",
  "url",
  "title",
  "addressRaw",
  "postcode",
  "bedrooms",
  "bathrooms",
  "priceMonthly",
  "propertyType",
  "lat",
  "lng",
  "description",
  "availableFrom",
  "furnished",
  "deposit",
  "photos",
  "floorplanUrl",
  "agentName",
  "agentPhone",
  "keyFeatures",
  "epcRating",
  "nearestStations",
]);

type Leaf = { path: string; sample: string };

function summarise(v: unknown, max = 80): string {
  if (v === null) {
    return "null";
  }
  if (v === undefined) {
    return "undefined";
  }
  if (typeof v === "string") {
    const t = v.replace(/\s+/g, " ").trim();
    return t.length > max ? `"${t.slice(0, max)}…"` : `"${t}"`;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (Array.isArray(v)) {
    return `array(${v.length})${v.length > 0 ? ` first=${summarise(v[0], 40)}` : ""}`;
  }
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    return `object{${keys.slice(0, 6).join(",")}${keys.length > 6 ? ",…" : ""}} (${keys.length} keys)`;
  }
  return String(v);
}

function* walkLeaves(node: unknown, prefix = "", depth = 0): Generator<Leaf> {
  if (
    depth > 3 ||
    node === null ||
    node === undefined ||
    typeof node !== "object" ||
    Array.isArray(node)
  ) {
    yield { path: prefix, sample: summarise(node) };
    return;
  }
  for (const [k, v] of Object.entries(node as object)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      yield* walkLeaves(v, next, depth + 1);
    } else {
      yield { path: next, sample: summarise(v) };
    }
  }
}

const tail = (p: string) => p.split(".").at(-1) ?? p;

function reportGap(
  portal: string,
  surfaced: Set<string>,
  leaves: Leaf[]
): void {
  console.log(`\n========== ${portal.toUpperCase()} ==========`);
  console.log(`Total raw leaf paths: ${leaves.length}`);
  const unsurfaced = leaves.filter(
    (l) =>
      !SURFACED_DETAIL_KEYS.has(tail(l.path)) && !surfaced.has(tail(l.path))
  );
  const byRoot = new Map<string, Leaf[]>();
  for (const leaf of unsurfaced) {
    const root = leaf.path.split(".")[0] ?? leaf.path;
    if (!byRoot.has(root)) {
      byRoot.set(root, []);
    }
    byRoot.get(root)?.push(leaf);
  }
  const sorted = [...byRoot.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );
  console.log(`Unsurfaced leaves: ${unsurfaced.length}\n`);
  for (const [root, items] of sorted) {
    console.log(`  [${root}] (${items.length})`);
    for (const leaf of items.slice(0, 12)) {
      console.log(`    ${leaf.path}: ${leaf.sample}`);
    }
    if (items.length > 12) {
      console.log(`    …${items.length - 12} more`);
    }
  }
}

async function fetchPage(url: string, browser: boolean): Promise<string> {
  console.log(`fetch: ${url}`);
  const res = await zyteFetch(apiKey as string, {
    url,
    browserHtml: browser ? true : undefined,
    httpResponseBody: browser ? undefined : true,
    httpResponseHeaders: true,
    geolocation: "GB",
  });
  return res.html;
}

// ---- Rightmove ----------------------------------------------------------

async function rightmove(): Promise<void> {
  const html = await fetchPage(
    "https://www.rightmove.co.uk/properties/88608822",
    true
  );
  const parsed = parseRightmoveDetail(html);
  const surfaced = new Set(
    Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k)
  );
  const root = extractRightmoveModel(html) as Record<string, unknown>;
  const pd = root.propertyData as Record<string, unknown> | undefined;
  if (!pd) {
    throw new Error("propertyData missing");
  }
  reportGap("rightmove (propertyData)", surfaced, [...walkLeaves(pd)]);
}

// ---- Zoopla ------------------------------------------------------------

async function zoopla(): Promise<void> {
  const searchHtml = await fetchPage(
    "https://www.zoopla.co.uk/to-rent/property/london/nw3/?beds_min=2&price_max=4000&price_frequency=per_month",
    true
  );
  const m = searchHtml.match(/\/to-rent\/details\/(\d+)\/?/);
  if (!m) {
    throw new Error("no zoopla detail link found in search");
  }
  const detailUrl = `https://www.zoopla.co.uk/to-rent/details/${m[1]}/`;
  const html = await fetchPage(detailUrl, true);
  const parsed = parseZooplaDetail(html);
  const surfaced = new Set(
    Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k)
  );
  const flight = parseFlight(html);
  const listing =
    findInFlight(flight, (v) => {
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        return false;
      }
      const o = v as Record<string, unknown>;
      const hasAddress = "displayAddress" in o || "address" in o;
      const hasCounts =
        ("counts" in o && o.counts !== null && typeof o.counts === "object") ||
        "numBedrooms" in o;
      return hasAddress && hasCounts;
    }) ??
    (
      findByKey(flight, "listingDetails") as
        | { listingDetails?: unknown }
        | null
        | undefined
    )?.listingDetails;
  if (!listing || typeof listing !== "object") {
    console.log("zoopla: no listing-shaped object");
    return;
  }
  reportGap("zoopla (listing object)", surfaced, [
    ...walkLeaves(listing as Record<string, unknown>),
  ]);
}

// ---- OpenRent ----------------------------------------------------------

const META_NAMES = [
  "description",
  "twitter:title",
  "twitter:description",
  "twitter:image",
  "og:title",
  "og:description",
  "og:image",
  "og:url",
];

async function openrent(): Promise<void> {
  const html = await fetchPage(
    "https://www.openrent.co.uk/property-to-rent/london/3-bed-flat-rosslyn-hill-nw3/2829191",
    false
  );
  const parsed = parseOpenrentDetail(html);
  const surfaced = new Set(
    Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k)
  );
  const root = parseHtml(html);
  const facts: Record<string, unknown> = {};
  for (const name of META_NAMES) {
    const el =
      root.querySelector(`meta[name="${name}"]`) ??
      root.querySelector(`meta[property="${name}"]`);
    const content = el?.getAttribute("content");
    if (content) {
      facts[`meta.${name}`] = content;
    }
  }
  facts["title.text"] = root.querySelector("title")?.text?.trim();
  facts.canonical = root
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  const text = (root.text ?? "").replace(/\s+/g, " ").trim();
  const labelPatterns: [string, RegExp][] = [
    ["minimumTenancy", /Minimum Tenancy[^:]*:?\s*([^.\n]{1,60})/i],
    ["studentsAccepted", /Students[^?]*\?\s*([^.\n]{1,40})/i],
    ["familiesAccepted", /Families[^?]*\?\s*([^.\n]{1,40})/i],
    ["petsAccepted", /Pets[^?]*\?\s*([^.\n]{1,40})/i],
    ["smokersAccepted", /Smokers[^?]*\?\s*([^.\n]{1,40})/i],
    ["dssAccepted", /DSS[^?]*\?\s*([^.\n]{1,40})/i],
    ["billsIncluded", /Bills Included[^?]*\?\s*([^.\n]{1,40})/i],
    ["councilTaxBand", /Council Tax Band[^.\n]{0,40}/i],
    ["dateAdded", /Listed (?:on|since)[^.\n]{0,40}/i],
  ];
  for (const [k, re] of labelPatterns) {
    const m = text.match(re);
    if (m) {
      facts[`label.${k}`] = m[0].slice(0, 120);
    }
  }
  reportGap("openrent (page facts)", surfaced, [...walkLeaves(facts)]);
}

await rightmove();
await zoopla();
await openrent();
