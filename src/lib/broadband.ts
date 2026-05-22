/**
 * BT Wholesale broadband-availability client (via Zyte).
 *
 * BT Wholesale's public checker at
 *   https://www.broadbandchecker.btwholesale.com
 * is a SPA whose only useful surface is a JSON-RPC-style POST that the
 * page fires once a postcode/address is selected. The shape is undocumented
 * — we model only the fields we need (best fibre tier + speed estimates)
 * and fall through to `null` on any field that's missing.
 *
 * The actual call is routed through Zyte HTTP tier because the BT
 * endpoint blocks raw fetches from cloud IP ranges; Zyte adds a UK
 * residential exit which the API accepts.
 *
 * **Status**: best-effort. BT changes the upstream payload format from
 * time to time; if the parser stops finding fields, every cluster gets
 * a `null`-filled result and the AI's verbatim broadband string is the
 * fallback. The Trigger task surfaces that as a warning, not a hard
 * failure, so the scrape pipeline isn't blocked when BT moves the
 * goalposts.
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
 * Hit BT Wholesale's availability API via Zyte's HTTP tier. Returns a
 * partially-populated result on parsing failure rather than throwing —
 * the caller logs the warning and persists what we did get.
 */
export async function getBroadband(
  input: GetBroadbandInput
): Promise<BroadbandResult> {
  // BT's endpoint accepts a JSON POST body. We can't fetch directly
  // from workerd because BT 403s cloud IPs; Zyte's HTTP tier proxies
  // it for us. `httpResponseBody: true` returns the raw bytes so we
  // can parse the JSON ourselves.
  const res = await zyteFetch({
    apiKey: input.zyteApiKey,
    url: `${BT_AVAILABILITY_URL}?postcode=${encodeURIComponent(input.postcode)}`,
    geolocation: "GB",
    httpResponseBody: true,
  });

  // The Zyte body comes back as raw HTML/JSON text in `html` regardless
  // of upstream content-type. Try to parse; if BT returned HTML (their
  // session-expired bounce page) the parse fails and we surface a
  // null-filled result.
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
