import { describe, expect, it } from "vitest";
import {
  RIGHTMOVE_RESULTS_PER_PAGE,
  rightmoveSearchUrl,
  zooplaAddedFromDays,
  zooplaSearchUrl,
} from "../../src/lib/portal-urls";

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("rightmoveSearchUrl pagination", () => {
  const base = { locationIdentifier: "OUTCODE^123", radiusMiles: 0 };

  it("defaults index to 0 and sorts newest-first", () => {
    const p = params(rightmoveSearchUrl(base));
    expect(p.get("index")).toBe("0");
    expect(p.get("sortType")).toBe("6");
  });

  it("emits index as a 24-step offset", () => {
    const p2 = params(
      rightmoveSearchUrl({ ...base, index: 2 * RIGHTMOVE_RESULTS_PER_PAGE })
    );
    expect(p2.get("index")).toBe("48");
  });

  it("passes maxDaysSinceAdded through and omits when undefined", () => {
    expect(
      params(rightmoveSearchUrl({ ...base, maxDaysSinceAdded: 7 })).get(
        "maxDaysSinceAdded"
      )
    ).toBe("7");
    expect(
      params(rightmoveSearchUrl(base)).has("maxDaysSinceAdded")
    ).toBe(false);
  });
});

describe("zooplaSearchUrl pagination + recency", () => {
  const base = { q: "Camden Town, London, UK", radiusMiles: 0 };

  it("defaults pn to 1 and sorts newest-first", () => {
    const p = params(zooplaSearchUrl(base));
    expect(p.get("pn")).toBe("1");
    expect(p.get("results_sort")).toBe("newest_listings");
  });

  it("emits pn as a 1-based page number", () => {
    expect(params(zooplaSearchUrl({ ...base, pn: 3 })).get("pn")).toBe("3");
  });

  it("sets the `added` recency enum, omitting it when undefined", () => {
    expect(
      params(zooplaSearchUrl({ ...base, added: "7_days" })).get("added")
    ).toBe("7_days");
    expect(params(zooplaSearchUrl(base)).has("added")).toBe(false);
  });
});

describe("zooplaAddedFromDays", () => {
  it("maps cadence days to the nearest covering enum", () => {
    expect(zooplaAddedFromDays(1)).toBe("24_hours");
    expect(zooplaAddedFromDays(3)).toBe("3_days");
    expect(zooplaAddedFromDays(7)).toBe("7_days");
    expect(zooplaAddedFromDays(14)).toBe("14_days");
  });

  it("rounds up to the next covering bucket", () => {
    expect(zooplaAddedFromDays(2)).toBe("3_days");
    expect(zooplaAddedFromDays(5)).toBe("7_days");
  });

  it("returns undefined for no window / out-of-range (backfill)", () => {
    expect(zooplaAddedFromDays(undefined)).toBeUndefined();
    expect(zooplaAddedFromDays(30)).toBeUndefined();
  });
});
