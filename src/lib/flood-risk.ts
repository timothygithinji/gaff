/**
 * UK flood-risk client.
 *
 * Hits the Environment Agency's "Risk of Flooding from Rivers and
 * Sea" (RoFRS) layer via its public ArcGIS REST endpoint. The layer
 * tiles England in 50 m cells, each tagged with a risk band
 * (1=High, 2=Medium, 3=Low, 4=Very Low). Free, no auth required.
 *
 * Outside England (Scotland / Wales / Northern Ireland) the layer
 * has no coverage — we return `unknown` rather than throwing.
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
 * Look up the flood-risk band at (lat, lng). Returns "unknown" if the
 * EA layer has no data for the point — typically because the point is
 * outside England or because the API returned an unexpected shape.
 *
 * Throws on a hard HTTP failure so the Trigger task can retry.
 */
export async function getFloodRisk(input: {
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
