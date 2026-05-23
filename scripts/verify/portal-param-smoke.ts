#!/usr/bin/env bun
/**
 * Smoke-test candidate URL params on each portal.
 *
 * For every param we'd like to add to `portal-urls.ts`, we send a
 * baseline URL (current builder shape) and a variant URL (baseline +
 * the new param) and count the listings on each page. If the count
 * drops with the variant, the portal honoured the filter. If the count
 * is identical, the param was silently ignored — don't ship it.
 *
 * Counting is "matches in HTML" (regex on detail-page links / next-data
 * fields). It's a rough proxy but good enough for "did this filter
 * cut the result set" — we just need a directional signal, not a
 * precise count.
 */
import {
  parseOpenrentSearch,
  parseRightmoveSearch,
  parseZooplaSearch,
} from "../../src/lib/parsers";
import { zyteFetch } from "./lib/zyte";

const apiKey = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error("ZYTE_API_KEY not set");
  process.exit(1);
}

type Portal = "rm" | "zp" | "or";

type TestCase = {
  portal: Portal;
  label: string;
  url: string;
  /** When true, suspect the param is restrictive (expect count to drop or equal). */
  restrictive: boolean;
};

// NW3, 2-bed, £2–3k — known active outcode.
const RM_BASE =
  "https://www.rightmove.co.uk/property-to-rent/find.html" +
  "?locationIdentifier=OUTCODE%5E1859" +
  "&searchType=RENT&radius=0.0&sortType=6&index=0" +
  "&minPrice=2000&maxPrice=3000&minBedrooms=2&maxBedrooms=2";

const ZP_BASE =
  "https://www.zoopla.co.uk/to-rent/property/london/nw3/" +
  "?price_frequency=per_month&results_sort=newest_listings&search_source=to-rent&pn=1" +
  "&price_min=2000&price_max=3000&beds_min=2&beds_max=2";

const OR_BASE =
  "https://www.openrent.co.uk/properties-to-rent/" +
  "?term=NW3&within=1&isLive=true" +
  "&prices_min=2000&prices_max=3000&bedrooms_min=2&bedrooms_max=2";

const CASES: TestCase[] = [
  // ---- Rightmove ----
  { portal: "rm", label: "baseline", url: RM_BASE, restrictive: false },
  {
    portal: "rm",
    label: "+ furnishTypes=furnished",
    url: `${RM_BASE}&furnishTypes=furnished`,
    restrictive: true,
  },
  {
    portal: "rm",
    label: "+ letType=longTerm",
    url: `${RM_BASE}&letType=longTerm`,
    restrictive: true,
  },
  {
    portal: "rm",
    label: "+ includeLetAgreed=false",
    url: `${RM_BASE}&includeLetAgreed=false`,
    restrictive: true,
  },
  {
    portal: "rm",
    label: "+ mustHave=garden",
    url: `${RM_BASE}&mustHave=garden`,
    restrictive: true,
  },
  {
    portal: "rm",
    label: "+ maxDaysSinceAdded=7",
    url: `${RM_BASE}&maxDaysSinceAdded=7`,
    restrictive: true,
  },
  {
    portal: "rm",
    label: "+ dontShow=student",
    url: `${RM_BASE}&dontShow=student`,
    restrictive: true,
  },
  {
    portal: "rm",
    label: "+ dontShow=student,retirement,houseShare (combined)",
    url: `${RM_BASE}&dontShow=student%2Cretirement%2ChouseShare`,
    restrictive: true,
  },

  // ---- Zoopla ----
  { portal: "zp", label: "baseline", url: ZP_BASE, restrictive: false },
  {
    portal: "zp",
    label: "+ baths_min=2",
    url: `${ZP_BASE}&baths_min=2`,
    restrictive: true,
  },
  {
    portal: "zp",
    label: "+ furnished_state=furnished",
    url: `${ZP_BASE}&furnished_state=furnished`,
    restrictive: true,
  },
  {
    portal: "zp",
    label: "+ include_let_agreed=false",
    url: `${ZP_BASE}&include_let_agreed=false`,
    restrictive: true,
  },
  {
    portal: "zp",
    label: "+ available_from=2026-06-01",
    url: `${ZP_BASE}&available_from=2026-06-01`,
    restrictive: true,
  },
  {
    portal: "zp",
    label: "+ feature=has_garden",
    url: `${ZP_BASE}&feature=has_garden`,
    restrictive: true,
  },
  {
    portal: "zp",
    label: "+ feature=has_parking_garage",
    url: `${ZP_BASE}&feature=has_parking_garage`,
    restrictive: true,
  },
  {
    portal: "zp",
    label: "+ pets_allowed=true",
    url: `${ZP_BASE}&pets_allowed=true`,
    restrictive: true,
  },
  {
    portal: "zp",
    label: "+ is_shared_accommodation=false",
    url: `${ZP_BASE}&is_shared_accommodation=false`,
    restrictive: true,
  },

  // ---- OpenRent ----
  { portal: "or", label: "baseline", url: OR_BASE, restrictive: false },
  {
    portal: "or",
    label: "+ bathrooms_min=2",
    url: `${OR_BASE}&bathrooms_min=2`,
    restrictive: true,
  },
  {
    portal: "or",
    label: "+ furnishedType=1 (Furnished)",
    url: `${OR_BASE}&furnishedType=1`,
    restrictive: true,
  },
  {
    portal: "or",
    label: "+ hasGarden=true",
    url: `${OR_BASE}&hasGarden=true`,
    restrictive: true,
  },
  {
    portal: "or",
    label: "+ hasParking=true",
    url: `${OR_BASE}&hasParking=true`,
    restrictive: true,
  },
  {
    portal: "or",
    label: "+ acceptPets=true",
    url: `${OR_BASE}&acceptPets=true`,
    restrictive: true,
  },
  {
    portal: "or",
    label: "+ acceptStudents=false",
    url: `${OR_BASE}&acceptStudents=false`,
    restrictive: true,
  },
];

/**
 * Parser-aware listing count. We run the HTML through the same parsers
 * the scrape pipeline uses, so the count is exactly what would have
 * been INSERTed — no false positives from pagination links, related
 * searches, or page-size caps clobbering the regex.
 *
 * Parsers throw when the page shape is unrecognised (e.g. a 405 / 5xx
 * served as HTML instead of JSON, a captcha intercept page). We swallow
 * that and return 0 — the SUMMARY's [EMPTY] verdict surfaces the
 * malformed-URL case.
 */
function countListings(html: string, portal: Portal): number {
  try {
    if (portal === "rm") {
      return parseRightmoveSearch(html).length;
    }
    if (portal === "zp") {
      return parseZooplaSearch(html).length;
    }
    return parseOpenrentSearch(html).length;
  } catch {
    return 0;
  }
}

async function runCase(c: TestCase) {
  const browser = c.portal !== "or";
  console.log(`\n[${c.portal}] ${c.label}`);
  try {
    const res = await zyteFetch(apiKey as string, {
      url: c.url,
      browserHtml: browser || undefined,
      httpResponseBody: browser ? undefined : true,
      httpResponseHeaders: !browser,
      geolocation: "GB",
    });
    const n = countListings(res.html, c.portal);
    console.log(`  status=${res.status}  listings=${n}`);
    return { ...c, status: res.status, count: n, ok: res.status === 200 };
  } catch (err) {
    console.log(`  ERROR: ${(err as Error).message}`);
    return { ...c, status: 0, count: 0, ok: false };
  }
}

const results: Awaited<ReturnType<typeof runCase>>[] = [];
for (const c of CASES) {
  results.push(await runCase(c));
}

function verdictFor(
  baseCount: number,
  r: { ok: boolean; count: number }
): string {
  if (!r.ok) {
    return "FAIL";
  }
  if (r.count === 0 && baseCount > 0) {
    return "EMPTY (param may be malformed)";
  }
  const delta = r.count - baseCount;
  if (delta < 0) {
    return `RESTRICTIVE (-${-delta})`;
  }
  if (delta > 0) {
    return `LOOSER (+${delta})`;
  }
  return "NO EFFECT (silently ignored OR same set)";
}

// Summary table per portal
console.log("\n\n=== SUMMARY ===");
for (const portal of ["rm", "zp", "or"] as const) {
  const portalResults = results.filter((r) => r.portal === portal);
  const baseline = portalResults.find((r) => r.label === "baseline");
  const baseCount = baseline?.count ?? 0;
  const portalName = { rm: "Rightmove", zp: "Zoopla", or: "OpenRent" }[portal];
  console.log(`\n--- ${portalName} (baseline = ${baseCount} listings) ---`);
  for (const r of portalResults) {
    if (r.label === "baseline") {
      continue;
    }
    const verdict = verdictFor(baseCount, r);
    console.log(
      `  ${r.label.padEnd(35)} → ${String(r.count).padStart(3)} listings   [${verdict}]`
    );
  }
}
