#!/usr/bin/env bun
/**
 * Parser-gap analyzer.
 *
 * For each portal's detail page:
 *   1. Load the captured Zyte HTML (`tests/fixtures/<portal>-detail-*.html`).
 *      These were captured via Zyte and are structurally identical to what
 *      production receives every scrape.
 *   2. Reach into the source data the same way the real parser does
 *      (Rightmove → __PAGE_MODEL.propertyData, Zoopla → flight listing,
 *      OpenRent → DOM/text).
 *   3. Enumerate every leaf path in the source.
 *   4. Subtract the fields the production parser surfaces into ListingDetail.
 *   5. Print the gap — fields present in the raw source we currently throw away.
 *
 * Run with: `bun scripts/verify/parser-gaps.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const FIXTURES = join(import.meta.dir, "..", "..", "tests", "fixtures");

type Leaf = { path: string; sample: string };

// What our production parsers actually write back into ListingDetail.
// Keep in sync with src/lib/parsers/types.ts > ListingDetail.
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

function summarise(v: unknown, max = 80): string {
  if (v === null) {
    return "null";
  }
  if (v === undefined) {
    return "undefined";
  }
  if (typeof v === "string") {
    const trimmed = v.replace(/\s+/g, " ").trim();
    return trimmed.length > max
      ? `"${trimmed.slice(0, max)}…"`
      : `"${trimmed}"`;
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

/**
 * Walk an object and yield `{path, sample}` for every leaf — including
 * nodes that summarise to an array/object so we see "this exists" even
 * when we don't recurse. We cap depth at 3 so the output is readable.
 */
function* walkLeaves(node: unknown, prefix = "", depth = 0): Generator<Leaf> {
  if (depth > 3) {
    yield { path: prefix, sample: summarise(node) };
    return;
  }
  if (node === null || node === undefined) {
    yield { path: prefix, sample: summarise(node) };
    return;
  }
  if (Array.isArray(node)) {
    yield { path: prefix, sample: summarise(node) };
    return;
  }
  if (typeof node !== "object") {
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

function tail(path: string): string {
  const parts = path.split(".");
  return parts.at(-1) ?? path;
}

function reportGap(
  portal: string,
  surfaced: Set<string>,
  rawLeaves: Leaf[]
): void {
  console.log(`\n========== ${portal.toUpperCase()} ==========`);
  console.log(`Total raw leaf paths: ${rawLeaves.length}`);

  // Heuristic: an unsurfaced leaf is interesting if its TAIL key isn't
  // already covered by SURFACED_DETAIL_KEYS and the parsed detail object
  // doesn't have a non-null value for an equivalent field.
  const unsurfaced = rawLeaves.filter((l) => {
    const t = tail(l.path);
    return !SURFACED_DETAIL_KEYS.has(t) && !surfaced.has(t);
  });

  // Cluster paths by their first segment so the output is scannable.
  const byRoot = new Map<string, Leaf[]>();
  for (const leaf of unsurfaced) {
    const root = leaf.path.split(".")[0] ?? leaf.path;
    if (!byRoot.has(root)) {
      byRoot.set(root, []);
    }
    byRoot.get(root)?.push(leaf);
  }
  const sortedRoots = [...byRoot.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );

  console.log(`Unsurfaced leaves: ${unsurfaced.length}\n`);
  for (const [root, leaves] of sortedRoots) {
    console.log(`  [${root}] (${leaves.length})`);
    for (const leaf of leaves.slice(0, 12)) {
      console.log(`    ${leaf.path}: ${leaf.sample}`);
    }
    if (leaves.length > 12) {
      console.log(`    …${leaves.length - 12} more`);
    }
  }
}

// ---- Rightmove ------------------------------------------------------------

function analyseRightmove(): void {
  const html = readFileSync(
    join(FIXTURES, "rightmove-detail-2026-05.html"),
    "utf8"
  );
  const parsed = parseRightmoveDetail(html);
  const surfaced = new Set<string>(
    Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k)
  );

  // Root the analysis at the same place rightmove.ts reads from.
  const root = extractRightmoveModel(html) as Record<string, unknown>;
  const pd = root.propertyData as Record<string, unknown> | undefined;
  if (!pd) {
    throw new Error("propertyData missing");
  }

  const leaves = [...walkLeaves(pd)];
  reportGap("rightmove (propertyData)", surfaced, leaves);
}

// ---- Zoopla --------------------------------------------------------------

function analyseZoopla(): void {
  const html = readFileSync(
    join(FIXTURES, "zoopla-detail-2026-05.html"),
    "utf8"
  );
  const parsed = parseZooplaDetail(html);
  const surfaced = new Set<string>(
    Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k)
  );

  const flight = parseFlight(html);
  // Locate the same listing object zoopla.ts pulls (counts + address).
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
    console.log("zoopla: no listing-shaped object found");
    return;
  }

  const leaves = [...walkLeaves(listing as Record<string, unknown>)];
  reportGap("zoopla (listing object)", surfaced, leaves);
}

// ---- OpenRent ------------------------------------------------------------

const META_NAMES = [
  "description",
  "twitter:title",
  "twitter:description",
  "twitter:card",
  "twitter:image",
  "og:title",
  "og:description",
  "og:type",
  "og:url",
  "og:image",
  "og:locale",
  "og:site_name",
  "robots",
  "viewport",
  "theme-color",
];

function analyseOpenrent(): void {
  const html = readFileSync(
    join(FIXTURES, "openrent-detail-2026-05.html"),
    "utf8"
  );
  const parsed = parseOpenrentDetail(html);
  const surfaced = new Set<string>(
    Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k)
  );

  const root = parseHtml(html);

  // Build a synthetic "facts available on the page" object for diffing.
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
  facts["jsonld.count"] = root.querySelectorAll(
    'script[type="application/ld+json"]'
  ).length;

  // Scan key plain-text labels that the current parser only partially uses.
  const text = (root.text ?? "").replace(/\s+/g, " ").trim();
  const labelPatterns: [string, RegExp][] = [
    ["minimumTenancy", /Minimum Tenancy[^:]*:?\s*([^.\n]{1,60})/i],
    [
      "maximumTenants",
      /Maximum (?:Number of )?Tenants[^:]*:?\s*([^.\n]{1,40})/i,
    ],
    ["studentsAccepted", /Students[^?]*\?\s*([^.\n]{1,40})/i],
    ["familiesAccepted", /Families[^?]*\?\s*([^.\n]{1,40})/i],
    ["petsAccepted", /Pets[^?]*\?\s*([^.\n]{1,40})/i],
    ["smokersAccepted", /Smokers[^?]*\?\s*([^.\n]{1,40})/i],
    ["dssAccepted", /DSS[^?]*\?\s*([^.\n]{1,40})/i],
    ["billsIncluded", /Bills Included[^?]*\?\s*([^.\n]{1,40})/i],
    ["broadband", /Broadband[^.\n]{0,80}/i],
    ["councilTaxBand", /Council Tax Band[^.\n]{0,40}/i],
    ["parking", /Parking[^.\n]{0,80}/i],
    ["garden", /Garden[^.\n]{0,80}/i],
    ["fireplace", /Fireplace[^.\n]{0,40}/i],
    ["wheelchairAccess", /Wheelchair Access[^.\n]{0,40}/i],
    ["dateAdded", /Listed (?:on|since)[^.\n]{0,40}/i],
    ["viewings", /Viewings?[^.\n]{0,60}/i],
  ];
  for (const [k, re] of labelPatterns) {
    const m = text.match(re);
    if (m) {
      facts[`label.${k}`] = m[0].slice(0, 120);
    }
  }

  const leaves = [...walkLeaves(facts)];
  reportGap("openrent (page facts)", surfaced, leaves);
}

// ---- main ----------------------------------------------------------------

analyseRightmove();
analyseZoopla();
analyseOpenrent();
