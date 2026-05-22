/**
 * BT Wholesale broadband-availability client (via Zyte).
 *
 * **Status: stubbed.** The `broadbandchecker.btwholesale.com` SPA
 * doesn't expose a stable JSON endpoint we can hit directly — every
 * documented path 404s and the real frontend orchestrates a multi-
 * step session against an internal RPC. Proper coverage will require
 * a real headless-browser scrape (`zyteFetch({ browserHtml: true })`)
 * plus address-step automation, which is its own piece of work.
 *
 * For now `getBroadband` always returns a null-filled result so the
 * `enrichments.broadband` slot exists and downstream callers don't
 * have to special-case "no broadband data yet". The AI's verbatim
 * extraction from the listing description (`features.broadband`)
 * remains the only real broadband signal in the system.
 */

import { zyteFetch } from "./zyte";

const BT_AVAILABILITY_URL =
  "https://www.broadbandchecker.btwholesale.com/api/v1/searchaddress";

export type BroadbandResult = {
  technology: "FTTP" | "FTTC" | "ADSL" | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  fttpAvailable: boolean;
};

export type GetBroadbandInput = {
  zyteApiKey: string;
  postcode: string;
};

type BtResponse = {
  products?: Array<{
    name?: string;
    downstreamMin?: number;
    downstreamMax?: number;
    upstreamMin?: number;
    upstreamMax?: number;
  }>;
};

const FTTP_NAME_RE = /fttp|fibre to the premises/i;
const FTTC_NAME_RE = /fttc|fibre to the cabinet|sogea/i;
const ADSL_NAME_RE = /adsl|wbc/i;

const TECH_TIERS: ReadonlyArray<{
  label: NonNullable<BroadbandResult["technology"]>;
  match: RegExp;
}> = [
  { label: "FTTP", match: FTTP_NAME_RE },
  { label: "FTTC", match: FTTC_NAME_RE },
  { label: "ADSL", match: ADSL_NAME_RE },
];

function bestTechnology(products: BtResponse["products"]): {
  technology: BroadbandResult["technology"];
  downloadMbps: number | null;
  uploadMbps: number | null;
} {
  if (!products || products.length === 0) {
    return { technology: null, downloadMbps: null, uploadMbps: null };
  }
  // Priority: FTTP > FTTC > ADSL. Pick the highest-tier product that
  // actually has a downstreamMax, then read its speeds.
  for (const tier of TECH_TIERS) {
    const hit = products.find(
      (p) => typeof p.name === "string" && tier.match.test(p.name)
    );
    if (hit) {
      return {
        technology: tier.label,
        downloadMbps: hit.downstreamMax ?? hit.downstreamMin ?? null,
        uploadMbps: hit.upstreamMax ?? hit.upstreamMin ?? null,
      };
    }
  }
  return { technology: null, downloadMbps: null, uploadMbps: null };
}

/**
 * Stub. Always resolves to a null-filled `BroadbandResult` until the
 * real BT Wholesale (or alternative) scrape is implemented. See the
 * file header for why.
 *
 * Keep the signature stable so the Trigger task and any UI consumers
 * don't churn when we wire a real source back in.
 */
// biome-ignore lint/suspicious/useAwait: signature must stay async to match the eventual real implementation.
export async function getBroadband(
  _input: GetBroadbandInput
): Promise<BroadbandResult> {
  return {
    technology: null,
    downloadMbps: null,
    uploadMbps: null,
    fttpAvailable: false,
  };
}

/**
 * Legacy attempt at hitting BT Wholesale via Zyte. The URL turned out
 * to be invalid (the real frontend goes through a session-orchestrated
 * SPA flow), so this function is unused at runtime. Retained as a
 * starting point for the real implementation.
 */
export async function _legacyBtBroadband(
  input: GetBroadbandInput
): Promise<BroadbandResult> {
  const res = await zyteFetch({
    apiKey: input.zyteApiKey,
    url: `${BT_AVAILABILITY_URL}?postcode=${encodeURIComponent(input.postcode)}`,
    geolocation: "GB",
    httpResponseBody: true,
  });

  let parsed: BtResponse;
  try {
    parsed = JSON.parse(res.html) as BtResponse;
  } catch {
    return {
      technology: null,
      downloadMbps: null,
      uploadMbps: null,
      fttpAvailable: false,
    };
  }

  const { technology, downloadMbps, uploadMbps } = bestTechnology(
    parsed.products
  );
  return {
    technology,
    downloadMbps,
    uploadMbps,
    fttpAvailable: technology === "FTTP",
  };
}
