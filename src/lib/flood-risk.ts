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

export type FloodRiskLevel = "very-low" | "low" | "medium" | "high" | "unknown";

export type FloodRisk = {
  riskLevel: FloodRiskLevel;
};

/**
 * Look up the flood-risk band at (lat, lng).
 *
 * Currently always returns `{ riskLevel: "unknown" }` — see the file
 * header for why.
 */
// biome-ignore lint/suspicious/useAwait: signature must stay async so callers don't have to change when the real implementation is re-enabled.
export async function getFloodRisk(_input: {
  lat: number;
  lng: number;
}): Promise<FloodRisk> {
  return { riskLevel: "unknown" };
}
