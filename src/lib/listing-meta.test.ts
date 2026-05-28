import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  daysSince,
  deriveListingMetaBadges,
  formatDaysListed,
} from "./listing-meta";

const NOW = new Date("2026-05-28T12:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("daysSince", () => {
  it("returns null for null/undefined/invalid", () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince(undefined)).toBeNull();
    expect(daysSince("not a date")).toBeNull();
  });

  it("computes whole-day diffs", () => {
    expect(daysSince(new Date("2026-05-28T11:00:00.000Z"))).toBe(0);
    expect(daysSince(new Date("2026-05-27T12:00:00.000Z"))).toBe(1);
    expect(daysSince("2026-04-28T12:00:00.000Z")).toBe(30);
  });

  it("clamps future dates to 0", () => {
    expect(daysSince(new Date("2026-06-01T00:00:00.000Z"))).toBe(0);
  });
});

describe("formatDaysListed", () => {
  it("returns null when no date", () => {
    expect(formatDaysListed(null)).toBeNull();
  });

  it("uses today/day/week/month phrasing", () => {
    expect(formatDaysListed(0)).toBe("Listed today");
    expect(formatDaysListed(1)).toBe("Listed 1 day ago");
    expect(formatDaysListed(5)).toBe("Listed 5 days ago");
    expect(formatDaysListed(7)).toBe("Listed 1 week ago");
    expect(formatDaysListed(21)).toBe("Listed 3 weeks ago");
    expect(formatDaysListed(45)).toBe("Listed 1 month ago");
    expect(formatDaysListed(120)).toBe("Listed 4 months ago");
    expect(formatDaysListed(400)).toBe("Listed 1+ year ago");
  });
});

describe("deriveListingMetaBadges", () => {
  it("returns nothing without inputs", () => {
    expect(
      deriveListingMetaBadges({ tags: null, daysListed: null })
    ).toStrictEqual([]);
  });

  it("emits fresh for ≤3 day listings", () => {
    const bs = deriveListingMetaBadges({ tags: [], daysListed: 1 });
    expect(bs.map((b) => b.key)).toContain("fresh");
  });

  it("emits stale for ≥60 day listings", () => {
    const bs = deriveListingMetaBadges({ tags: null, daysListed: 75 });
    expect(bs.find((b) => b.key === "stale")?.label).toBe("75 days on market");
  });

  it("maps Reduced tag", () => {
    const bs = deriveListingMetaBadges({
      tags: ["Reduced today"],
      daysListed: null,
    });
    expect(bs.find((b) => b.key === "reduced")?.label).toBe("Reduced");
  });

  it("maps house share / student / available-from", () => {
    const bs = deriveListingMetaBadges({
      tags: ["House share", "Student friendly", "Available from 1 June 2026"],
      daysListed: null,
    });
    const keys = bs.map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(["share", "student", "avail"]));
    expect(bs.find((b) => b.key === "avail")?.label).toBe("Avail 1 Jun");
  });

  it("dedupes (Just added + fresh-by-date only emit one)", () => {
    const bs = deriveListingMetaBadges({
      tags: ["Just added"],
      daysListed: 2,
    });
    expect(bs.filter((b) => b.key === "fresh")).toHaveLength(1);
  });

  it("ignores noise tags (Brand Plus, Featured, Freehold)", () => {
    const bs = deriveListingMetaBadges({
      tags: ["Brand Plus", "Featured", "Freehold", "Furnished"],
      daysListed: null,
    });
    expect(bs).toStrictEqual([]);
  });

  it("emits listed-building badge when Rightmove flagged it", () => {
    const bs = deriveListingMetaBadges({
      tags: null,
      daysListed: null,
      listedBuilding: true,
    });
    expect(bs.find((b) => b.key === "listed")?.label).toBe("Listed building");
  });

  it("does not emit listed-building badge when null or false", () => {
    expect(
      deriveListingMetaBadges({
        tags: null,
        daysListed: null,
        listedBuilding: false,
      }).find((b) => b.key === "listed")
    ).toBeUndefined();
    expect(
      deriveListingMetaBadges({
        tags: null,
        daysListed: null,
        listedBuilding: null,
      }).find((b) => b.key === "listed")
    ).toBeUndefined();
  });

  it("emits flood-disclosure badge only when landlord said yes", () => {
    expect(
      deriveListingMetaBadges({
        tags: null,
        daysListed: null,
        floodDisclosure: { floodedInLastFiveYears: true },
      }).find((b) => b.key === "flooded")?.variant
    ).toBe("problem");
    expect(
      deriveListingMetaBadges({
        tags: null,
        daysListed: null,
        floodDisclosure: { floodedInLastFiveYears: false },
      }).find((b) => b.key === "flooded")
    ).toBeUndefined();
  });
});
