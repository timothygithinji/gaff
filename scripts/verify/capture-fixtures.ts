#!/usr/bin/env bun
/**
 * One-off fixture-capture script.
 *
 * Hits 6 portal URLs via Zyte and writes the response HTML to
 * `tests/fixtures/`. Used to seed Vitest snapshots for the parsers in
 * `src/lib/parsers/`. Re-run only when the parsers stop matching real
 * pages — each invocation costs ~6 Zyte requests.
 *
 * Usage:
 *   doppler run --project gaff --config dev \
 *     --scope ~/.t-stack/orgs/timothygithinji -- \
 *     bun run scripts/verify/capture-fixtures.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error(
    "ZYTE_API_KEY not set — run via `doppler run … -- bun …` per script header.",
  );
  process.exit(1);
}

type Capture = { name: string; url: string; path: string };

const FIXTURE_DIR = resolve(import.meta.dir, "../../tests/fixtures");

const CAPTURES: Capture[] = [
  {
    name: "rightmove-search",
    url:
      "https://www.rightmove.co.uk/property-to-rent/find.html?searchType=RENT" +
      "&locationIdentifier=OUTCODE%5E2225&channel=RENT&radius=0.0" +
      "&maxPrice=4000&minBedrooms=2&propertyTypes=" +
      "&dontShow=newHome%2Cretirement%2CsharedOwnership&furnishTypes=&keywords=",
    path: `${FIXTURE_DIR}/rightmove-search-2026-05.html`,
  },
  {
    name: "rightmove-detail",
    url: "https://www.rightmove.co.uk/properties/88608822",
    path: `${FIXTURE_DIR}/rightmove-detail-2026-05.html`,
  },
  {
    name: "zoopla-search",
    url:
      "https://www.zoopla.co.uk/to-rent/property/london/nw3/" +
      "?beds_min=2&price_max=4000&price_frequency=per_month",
    path: `${FIXTURE_DIR}/zoopla-search-2026-05.html`,
  },
  {
    name: "openrent-search",
    url:
      "https://www.openrent.co.uk/properties-to-rent/london?term=London&within=0" +
      "&prices_max=4000&bedrooms_min=2&bedrooms_max=&filter=true&isLive=true",
    path: `${FIXTURE_DIR}/openrent-search-2026-05.html`,
  },
  {
    name: "openrent-detail",
    url:
      "https://www.openrent.co.uk/property-to-rent/london/" +
      "3-bed-flat-rosslyn-hill-nw3/2829191",
    path: `${FIXTURE_DIR}/openrent-detail-2026-05.html`,
  },
];

// Zoopla detail URL is selected dynamically from the search fixture so
// the fixture pair stays mutually consistent.

async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function capture(c: Capture): Promise<{ bytes: number; cost: number }> {
  const res = await zyteFetch(apiKey as string, {
    url: c.url,
    httpResponseBody: true,
    httpResponseHeaders: true,
    geolocation: "GB",
  });
  await ensureDir(c.path);
  await writeFile(c.path, res.html, "utf8");
  console.log(
    `  ✓ ${c.name}: ${res.html.length.toLocaleString()} bytes → ${c.path}`,
  );
  return { bytes: res.html.length, cost: res.costEstimateUsd };
}

function pickZooplaDetailUrl(searchHtml: string): string | null {
  // Cheap regex against the rendered HTML — we don't need to parse the
  // full RSC tree here, just find the first /to-rent/details/<id>/ link.
  const m = searchHtml.match(/\/to-rent\/details\/(\d+)\/?/);
  return m ? `https://www.zoopla.co.uk/to-rent/details/${m[1]}/` : null;
}

let totalCost = 0;

for (const c of CAPTURES) {
  try {
    const { cost } = await capture(c);
    totalCost += cost;
  } catch (err) {
    console.error(`  ✗ ${c.name}: ${(err as Error).message}`);
    process.exit(1);
  }
}

// After capturing the Zoopla search fixture, derive a detail URL from
// it so the two fixtures are consistent.
const zooplaSearchHtml = await Bun.file(
  `${FIXTURE_DIR}/zoopla-search-2026-05.html`,
).text();
const zooplaDetailUrl = pickZooplaDetailUrl(zooplaSearchHtml);
if (!zooplaDetailUrl) {
  console.error("  ✗ Could not derive a Zoopla detail URL from the search fixture");
  process.exit(1);
}
const zooplaDetail: Capture = {
  name: "zoopla-detail",
  url: zooplaDetailUrl,
  path: `${FIXTURE_DIR}/zoopla-detail-2026-05.html`,
};
const { cost } = await capture(zooplaDetail);
totalCost += cost;

console.log(`\nTotal Zyte cost: $${totalCost.toFixed(5)}`);
