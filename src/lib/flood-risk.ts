/**
 * UK flood-risk client.
 *
 * **Status: stubbed.** The Environment Agency's old ArcGIS REST layer
 * (`/EA/RiskOfFloodingFromRiversAndSea/MapServer/0`) now returns 500
 * Internal Server Error for every request — the service has moved.
 * The gov.uk "Check long-term flood risk" tool at
 *   https://check-long-term-flood-risk.service.gov.uk/postcode
 * is the supported successor but exposes no public JSON API. Until we
 * pick a replacement (HM Land Registry flood layer? thinkbroadband-
 * style scrape? Defra mapping?) every call returns `unknown` so the
 * enrichments column slot is populated but uninformative.
 *
 * Keep the function signature stable so the rest of the pipeline
 * doesn't churn when we wire a real source back in.
 */

const ROFRS_ENDPOINT =
  "https://environment.data.gov.uk/arcgis/rest/services/EA/RiskOfFloodingFromRiversAndSea/MapServer/0/query";

export type FloodRiskLevel = "very-low" | "low" | "medium" | "high" | "unknown";

export type FloodRisk = {
  riskLevel: FloodRiskLevel;
};

type EsriQueryResponse = {
  features?: Array<{ attributes?: Record<string, unknown> }>;
  error?: { code?: number; message?: string };
};

const RISK_BAND_BY_VALUE: Record<number, FloodRiskLevel> = {
  1: "high",
  2: "medium",
  3: "low",
  4: "very-low",
};

const RISK_BAND_BY_LABEL: Record<string, FloodRiskLevel> = {
  high: "high",
  medium: "medium",
  low: "low",
  "very low": "very-low",
};

function readRiskBand(attrs: Record<string, unknown>): FloodRiskLevel {
  // The layer uses different field names depending on the version; try
  // the documented ones in order of preference. Numeric `riskband` is
  // canonical; `prob_4band` is the text alias on some mirrors.
  const numeric = attrs.riskband ?? attrs.RISKBAND;
  if (typeof numeric === "number" && RISK_BAND_BY_VALUE[numeric]) {
    return RISK_BAND_BY_VALUE[numeric] as FloodRiskLevel;
  }
  const text = attrs.prob_4band ?? attrs.PROB_4BAND;
  if (typeof text === "string") {
    return RISK_BAND_BY_LABEL[text.toLowerCase()] ?? "unknown";
  }
  return "unknown";
}

/**
 * Look up the flood-risk band at (lat, lng).
 *
 * Currently always returns `{ riskLevel: "unknown" }` — see the file
 * header for why. The original ArcGIS-driven implementation is preserved
 * below the early return so it can be re-enabled when a working data
 * source is wired in.
 */
// biome-ignore lint/suspicious/useAwait: signature must stay async so callers don't have to change when the real implementation is re-enabled.
export async function getFloodRisk(_input: {
  lat: number;
  lng: number;
}): Promise<FloodRisk> {
  return { riskLevel: "unknown" };
}

/**
 * Legacy ArcGIS-driven lookup; retained for when the EA brings the
 * service back or we wire an equivalent endpoint. Unused at runtime.
 */
export async function _legacyArcGisFloodRisk(input: {
  lat: number;
  lng: number;
}): Promise<FloodRisk> {
  const geometry = JSON.stringify({ x: input.lng, y: input.lat });
  const params = new URLSearchParams({
    geometry,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${ROFRS_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `EA flood-risk ${res.status} ${res.statusText}: ${text.slice(0, 400)}`
    );
  }
  const data = (await res.json()) as EsriQueryResponse;
  if (data.error) {
    throw new Error(`EA flood-risk error: ${data.error.message ?? "unknown"}`);
  }
  const feature = data.features?.[0];
  if (!feature?.attributes) {
    return { riskLevel: "unknown" };
  }
  return { riskLevel: readRiskBand(feature.attributes) };
}
