/**
 * Tests for the crime-baseline helpers — the "Boring numbers" stat
 * that turns a raw 1-mile-radius crime count into "X% above/below
 * {London,England} average".
 */

import { describe, expect, it } from "vitest";
import {
  ENGLAND_AVG_CRIMES_PER_1MI_RADIUS,
  LONDON_AVG_CRIMES_PER_1MI_RADIUS,
  compareCrimeToBaseline,
  pickCrimeBaseline,
} from "../../src/lib/crime-baseline";

describe("pickCrimeBaseline", () => {
  it.each([
    "N1",
    "N11",
    "NW3",
    "E1",
    "E14",
    "EC1A",
    "SE15",
    "SW9",
    "W1",
    "WC1",
    // Outer London boroughs that bleed into BR/CR/DA/EN/HA/IG/KT/RM/SM/TW/UB.
    "BR1",
    "CR0",
    "EN5",
    "HA1",
    "IG6",
    "KT1",
    "RM2",
    "SM4",
    "TW10",
    "UB7",
  ])("picks london for %s", (postcode) => {
    expect(pickCrimeBaseline(postcode)).toBe("london");
  });

  it.each([
    "M1",
    "B1",
    "LS6",
    "BS1",
    "G1",
    "CF10",
    "EH1",
    "OX1",
    "CB2",
    "BN1",
  ])("picks england for %s", (postcode) => {
    expect(pickCrimeBaseline(postcode)).toBe("england");
  });

  it("falls back to england when postcode is null or empty", () => {
    expect(pickCrimeBaseline(null)).toBe("england");
    expect(pickCrimeBaseline(undefined)).toBe("england");
    expect(pickCrimeBaseline("")).toBe("england");
    expect(pickCrimeBaseline("   ")).toBe("england");
  });

  it("is case-insensitive and tolerates whitespace", () => {
    expect(pickCrimeBaseline("nw3")).toBe("london");
    expect(pickCrimeBaseline("  N11  ")).toBe("london");
  });

  it("does not confuse a non-London postcode that happens to start with a London letter", () => {
    // 'EX' is Exeter, not 'E' Inner London. The regex requires the
    // first non-letter to be a digit.
    expect(pickCrimeBaseline("EX1")).toBe("england");
    // 'EH' is Edinburgh.
    expect(pickCrimeBaseline("EH1")).toBe("england");
    // 'NR' is Norwich.
    expect(pickCrimeBaseline("NR1")).toBe("england");
  });
});

describe("compareCrimeToBaseline", () => {
  it("returns the correct baseline value for london postcodes", () => {
    const result = compareCrimeToBaseline(455, "N11");
    expect(result?.baseline).toBe("london");
    expect(result?.baselineValue).toBe(LONDON_AVG_CRIMES_PER_1MI_RADIUS);
  });

  it("returns the correct baseline value for non-london postcodes", () => {
    const result = compareCrimeToBaseline(27, "M1");
    expect(result?.baseline).toBe("england");
    expect(result?.baselineValue).toBe(ENGLAND_AVG_CRIMES_PER_1MI_RADIUS);
  });

  it("formats 'around average' within ±5% to avoid false precision", () => {
    // Median observed in prod (398) sits ~12% below London avg, so
    // try a value right at the baseline.
    const result = compareCrimeToBaseline(LONDON_AVG_CRIMES_PER_1MI_RADIUS, "N1");
    expect(result?.label).toBe("Around London average");
  });

  it("rounds to a whole percent and uses 'below' when total is under baseline", () => {
    // London baseline ≈ 455. 380 ≈ 16% below.
    const result = compareCrimeToBaseline(380, "N11");
    expect(result?.label).toMatch(/^\d+% below London average$/);
    expect(result?.pctDiff ?? 0).toBeLessThan(0);
  });

  it("rounds to a whole percent and uses 'above' when total is over baseline", () => {
    // London baseline ≈ 455. 600 ≈ 32% above.
    const result = compareCrimeToBaseline(600, "N11");
    expect(result?.label).toMatch(/^\d+% above London average$/);
    expect(result?.pctDiff ?? 0).toBeGreaterThan(0);
  });

  it("compares against the England baseline for non-London postcodes", () => {
    // England baseline ≈ 27 in a 1-mile-radius circle. 50 is well above.
    const result = compareCrimeToBaseline(50, "M1");
    expect(result?.label).toMatch(/^\d+% above England average$/);
  });

  it("rounds the magnitude (never shows a signed minus in the label)", () => {
    const result = compareCrimeToBaseline(200, "N11"); // ~56% below London
    expect(result?.label).not.toMatch(/-/);
  });
});
