/**
 * Unit tests for the server-side price re-filter.
 *
 * Portals encode the search's price band into their search URL but don't
 * reliably honour it (OpenRent returns its full result set regardless), so
 * `filterByPriceRange` is the backstop that keeps out-of-band listings out
 * of the DB and the review queue. These checks pin the inclusive bounds and
 * the "keep unknown prices" rule.
 */

import { describe, expect, it } from "vitest";
import type { ListingSummary } from "../lib/parsers/types";
import { filterByPriceRange } from "./scrape-portal";

function listing(
  portalListingId: string,
  priceMonthly: number | undefined
): ListingSummary {
  return { portalListingId, priceMonthly } as ListingSummary;
}

const summaries: ListingSummary[] = [
  listing("a", 600),
  listing("b", 1000),
  listing("c", 2800),
  listing("d", 9000),
  listing("e", undefined),
];

const ids = (rows: ListingSummary[]) => rows.map((r) => r.portalListingId);

describe("filterByPriceRange", () => {
  it("drops listings below min and above max (bounds inclusive)", () => {
    expect(ids(filterByPriceRange(summaries, 1000, 2800))).toEqual([
      "b",
      "c",
      "e", // unknown price kept
    ]);
  });

  it("honours a min-only band", () => {
    expect(ids(filterByPriceRange(summaries, 1000, null))).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("honours a max-only band", () => {
    expect(ids(filterByPriceRange(summaries, null, 2800))).toEqual([
      "a",
      "b",
      "c",
      "e",
    ]);
  });

  it("is a no-op when no band is set", () => {
    const out = filterByPriceRange(summaries, null, null);
    expect(out).toBe(summaries);
  });

  it("keeps listings whose price didn't parse", () => {
    expect(ids(filterByPriceRange([listing("x", undefined)], 1000, 2000))).toEqual(
      ["x"]
    );
  });
});
