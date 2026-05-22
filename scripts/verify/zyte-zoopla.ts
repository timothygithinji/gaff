#!/usr/bin/env bun
import { extractScriptJson, pluck, probe, summarise } from "./lib/extract";
import { zyteFetch } from "./lib/zyte";

const apiKey: string | undefined = process.env.ZYTE_API_KEY;
if (!apiKey) {
  console.error(
    "ZYTE_API_KEY not set. Run with: doppler run -- bun scripts/verify/zyte-zoopla.ts"
  );
  process.exit(1);
}
const ZYTE_KEY: string = apiKey;

const SEARCH_URL =
  "https://www.zoopla.co.uk/to-rent/property/london/nw3/" +
  "?price_frequency=per_month" +
  "&price_min=2000" +
  "&price_max=3000" +
  "&beds_min=2" +
  "&beds_max=2" +
  "&property_sub_type=flat" +
  "&results_sort=newest_listings" +
  "&search_source=to-rent" +
  "&pn=1";

async function tryFetch(mode: "http" | "browser") {
  console.log(`\n=== Zoopla search · ${mode.toUpperCase()} ===`);
  console.log(`URL: ${SEARCH_URL}`);

  const req =
    mode === "http"
      ? {
          url: SEARCH_URL,
          httpResponseBody: true,
          httpResponseHeaders: true,
          geolocation: "GB",
        }
      : { url: SEARCH_URL, browserHtml: true, geolocation: "GB" };

  try {
    const res = await zyteFetch(ZYTE_KEY, req);
    console.log(`HTML length: ${res.html.length}`);
    console.log(
      `Content-Type: ${res.headers["content-type"] ?? "(none in browser mode)"}`
    );

    // Quick CF challenge detection
    const lower = res.html.slice(0, 4000).toLowerCase();
    const cfChallenge =
      lower.includes("checking your browser") ||
      lower.includes("just a moment") ||
      lower.includes("cf-mitigated") ||
      lower.includes("__cf_chl_") ||
      (res.status === 200 && res.html.length < 30000);
    if (cfChallenge) {
      console.warn("⚠ Looks like a Cloudflare challenge / blocked response");
      return { ok: false, res };
    }

    let nextData: unknown;
    try {
      nextData = extractScriptJson(res.html, "__NEXT_DATA__");
      console.log("✓ __NEXT_DATA__ extracted");
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
      console.error(`First 800 chars of HTML:\n${res.html.slice(0, 800)}`);
      return { ok: false, res };
    }

    const props = (nextData as { props?: { pageProps?: object } })?.props
      ?.pageProps;
    if (props) {
      console.log(
        `props.pageProps keys: ${Object.keys(props).slice(0, 25).join(", ")}`
      );
    }

    const candidatePaths: (string | number)[][] = [
      ["props", "pageProps", "regularListingsFormatted"],
      ["props", "pageProps", "listings", "regular"],
      ["props", "pageProps", "listings"],
      ["props", "pageProps", "results", "listings"],
      ["props", "pageProps", "searchResults", "listings"],
      ["props", "pageProps", "data", "listings"],
    ];

    const found = probe(nextData, candidatePaths);
    if (!found) {
      console.error(
        "✗ Could not find listings at expected paths — inspect manually"
      );
      return { ok: false, res };
    }

    console.log(`✓ Listings at .${found.path.join(".")}`);
    const listings = found.value as unknown[];
    console.log(`  count: ${listings.length}`);
    if (listings.length === 0) {
      console.warn("⚠ Empty listings");
      return { ok: true, res };
    }

    const first = listings[0] as Record<string, unknown>;
    console.log("\nFirst listing keys:");
    console.log(`  ${Object.keys(first).slice(0, 30).join(", ")}`);

    const fields = [
      ["listingId"],
      ["id"],
      ["title"],
      ["address"],
      ["counts", "numBedrooms"],
      ["counts", "numBathrooms"],
      ["propertyType"],
      ["pricing", "label"],
      ["pricing", "rentalPrice", "perMonth"],
      ["price", "label"],
      ["priceTitle"],
      ["location", "coordinates", "latitude"],
      ["location", "coordinates", "longitude"],
      ["image"],
      ["images"],
      ["features"],
      ["branch", "name"],
      ["agent", "name"],
      ["publishedOn"],
      ["listingUris", "detail"],
    ];
    console.log("\nFields we expect to use:");
    for (const path of fields) {
      try {
        const v = pluck(first, path);
        console.log(`  ✓ .${path.join(".")} → ${summarise(v)}`);
      } catch {
        // Silent — these are speculative
      }
    }

    console.log(`\nCost: $${res.costEstimateUsd.toFixed(5)}`);
    return { ok: true, res };
  } catch (err) {
    console.error(`✗ Error: ${(err as Error).message}`);
    return { ok: false };
  }
}

const httpResult = await tryFetch("http");
if (!httpResult.ok) {
  console.log("\n— HTTP failed or blocked, trying Browser tier —");
  await tryFetch("browser");
}
