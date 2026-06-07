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

describe("zooplaSearchUrl property type + route", () => {
  it("uses the path route for London outcodes and honours property_sub_type", () => {
    const url = zooplaSearchUrl({
      q: "NW3",
      radiusMiles: 0,
      propertyTypes: ["house"],
    });
    expect(url.startsWith("https://www.zoopla.co.uk/to-rent/property/london/nw3/?")).toBe(
      true
    );
    const subs = params(url).getAll("property_sub_type");
    // "house" expands to its built-forms, repeated — no flats.
    expect(subs).toContain("detached");
    expect(subs).toContain("semi_detached");
    expect(subs).toContain("terraced");
    expect(subs).not.toContain("flats");
  });

  it("extracts the outcode from a postal_code formattedAddress", () => {
    const url = zooplaSearchUrl({ q: "NW3, London, UK", radiusMiles: 0 });
    expect(
      url.startsWith("https://www.zoopla.co.uk/to-rent/property/london/nw3/?")
    ).toBe(true);
  });

  it("falls back to the free-text route for non-London places", () => {
    const url = zooplaSearchUrl({
      q: "Camden Town, London, UK",
      radiusMiles: 0,
      propertyTypes: ["house"],
    });
    expect(url.startsWith("https://www.zoopla.co.uk/search/?")).toBe(true);
    expect(params(url).get("q")).toBe("Camden Town, London, UK");
    // Type tokens are still appended (harmless; backstop enforces type).
    expect(params(url).getAll("property_sub_type")).toContain("detached");
  });

  it("does not constrain sub-type when 'other' is selected", () => {
    const url = zooplaSearchUrl({
      q: "NW3",
      radiusMiles: 0,
      propertyTypes: ["house", "other"],
    });
    expect(params(url).getAll("property_sub_type")).toEqual([]);
  });

  it("maps flat and bungalow tokens", () => {
    expect(
      params(zooplaSearchUrl({ q: "N1", radiusMiles: 0, propertyTypes: ["flat"] })).getAll(
        "property_sub_type"
      )
    ).toEqual(["flats"]);
    expect(
      params(
        zooplaSearchUrl({ q: "N1", radiusMiles: 0, propertyTypes: ["bungalow"] })
      ).getAll("property_sub_type")
    ).toEqual(["bungalow"]);
  });

  it("sets explicit exclusion params per enabled category", () => {
    const p = params(
      zooplaSearchUrl({
        q: "NW3",
        radiusMiles: 0,
        exclusions: ["house_share", "student", "retirement"],
      })
    );
    expect(p.get("is_shared_accommodation")).toBe("false");
    expect(p.get("is_student_accommodation")).toBe("false");
    expect(p.get("is_retirement_home")).toBe("false");
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
