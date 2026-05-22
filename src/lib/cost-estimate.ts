/**
 * Per-search Zyte cost estimate.
 *
 * The Search create / edit form shows a live "$X / day" estimate so the
 * user can feel the cost dial responding to the cadence + portals +
 * outcodes choices. Numbers come from Zyte's published per-request
 * pricing for the relevant portals — these are ballparks the v1.1 admin
 * dashboard will refine against actual `scrape_runs.cost_usd` data.
 *
 * The unit cost model is intentionally additive (sum of portal costs ×
 * outcodes × scrapes-per-day). It ignores listing-detail fetches (those
 * happen lazily in PR 4) and AI calls (those have their own daily cap
 * in PR 6). Good enough for a UI hint; not authoritative.
 */
export type Portal = "rightmove" | "zoopla" | "openrent";

/**
 * USD per outcode per scrape. Picked from Zyte's API-request ballpark
 * for these portals; refresh once we have a week of real `scrape_runs`
 * data to calibrate against.
 */
export const PORTAL_COST: Record<Portal, number> = {
  rightmove: 0.0008,
  zoopla: 0.0008,
  openrent: 0.0004,
};

export type CostEstimateInput = {
  outcodeCount: number;
  portals: Portal[];
  scrapesPerDay: number;
};

export type CostEstimate = {
  perScrapeUsd: number;
  perDayUsd: number;
  perWeekUsd: number;
};

export function estimateCost({
  outcodeCount,
  portals,
  scrapesPerDay,
}: CostEstimateInput): CostEstimate {
  const perScrape = portals.reduce(
    (sum, p) => sum + (PORTAL_COST[p] ?? 0) * outcodeCount,
    0
  );
  const perDay = perScrape * scrapesPerDay;
  return {
    perScrapeUsd: perScrape,
    perDayUsd: perDay,
    perWeekUsd: perDay * 7,
  };
}

/**
 * Rough listings-per-week estimate — pretends every portal returns ~7
 * fresh listings per outcode per day on average. Used purely as a vibey
 * number under the CTA; PR 4 will replace this with a 7d windowed query
 * against `listings.first_seen_at` once real data exists.
 */
export function estimateListingsPerWeek({
  outcodeCount,
  portals,
}: Pick<CostEstimateInput, "outcodeCount" | "portals">): number {
  // Wild guess: 7 new listings per outcode per portal per week.
  return outcodeCount * portals.length * 7;
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  if (amount < 1) {
    return `$${amount.toFixed(2)}`;
  }
  return `$${amount.toFixed(2)}`;
}
