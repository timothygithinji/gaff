import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CoveragePercents,
  coverageToBroadband,
  normalisePostcodeKey,
  outcodeOf,
} from "../../src/lib/broadband";
import { getAmenityCounts } from "../../src/lib/overpass";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAmenityCounts (stubbed)", () => {
  it("returns zero counts for every category at the requested radius", async () => {
    const result = await getAmenityCounts({
      lat: 51.6,
      lng: -0.13,
      radiusMeters: 250,
    });
    expect(result.withinMeters).toBe(250);
    expect(Object.values(result.counts).every((v) => v === 0)).toBe(true);
    expect(result.counts.supermarket).toBe(0);
    expect(result.counts.cafe).toBe(0);
  });

  it("never makes a network call while stubbed", async () => {
    await getAmenityCounts({ lat: 51.6, lng: -0.13 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("normalisePostcodeKey", () => {
  it("treats a full unit postcode as a postcode key (spaces removed)", () => {
    expect(normalisePostcodeKey("n11 1aa")).toEqual({
      key: "N111AA",
      level: "postcode",
    });
  });

  it("treats a bare outcode as an outcode key", () => {
    expect(normalisePostcodeKey("SE1")).toEqual({
      key: "SE1",
      level: "outcode",
    });
  });

  it("returns null for unparseable input", () => {
    expect(normalisePostcodeKey("not a postcode")).toBeNull();
  });

  it("derives the outcode from a unit postcode", () => {
    expect(outcodeOf("SE19HA")).toBe("SE1");
    expect(outcodeOf("N111AA")).toBe("N11");
    expect(outcodeOf("SE1")).toBeNull();
  });
});

describe("coverageToBroadband", () => {
  const base: CoveragePercents = {
    sfbbPct: null,
    ufbb100Pct: null,
    ufbb300Pct: null,
    gigabitPct: null,
    ngaPct: null,
  };

  it("maps a gigabit-capable majority to FTTP + fttpAvailable", () => {
    const result = coverageToBroadband(
      { ...base, sfbbPct: 100, ufbb300Pct: 99, gigabitPct: 98 },
      "ofcom-cn-2025-07"
    );
    expect(result).toEqual({
      technology: "FTTP",
      downloadMbps: 1000,
      uploadMbps: null,
      fttpAvailable: true,
      source: "ofcom-cn-2025-07",
      asOf: "2025-07",
    });
  });

  it("maps superfast-but-not-gigabit to FTTC without fttpAvailable", () => {
    const result = coverageToBroadband({
      ...base,
      sfbbPct: 100,
      ufbb100Pct: 20,
      gigabitPct: 10,
    });
    expect(result.technology).toBe("FTTC");
    expect(result.downloadMbps).toBe(80);
    expect(result.fttpAvailable).toBe(false);
  });

  it("maps a sub-superfast majority to ADSL", () => {
    const result = coverageToBroadband({ ...base, sfbbPct: 10 });
    expect(result.technology).toBe("ADSL");
    expect(result.downloadMbps).toBe(24);
    expect(result.fttpAvailable).toBe(false);
  });

  it("returns a null-filled result when no coverage figures exist", () => {
    expect(coverageToBroadband(base)).toEqual({
      technology: null,
      downloadMbps: null,
      uploadMbps: null,
      fttpAvailable: false,
      source: null,
      asOf: null,
    });
  });
});
