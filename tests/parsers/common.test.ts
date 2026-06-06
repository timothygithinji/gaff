/**
 * Tests for the shared parser primitives that gained behaviour during the
 * data-correctness sweep: `bathroomCount` (the 0-sentinel normaliser) and
 * `extractDepositFromText` (the conservative deposit fallback).
 */
import { describe, expect, it } from "vitest";
import { bathroomCount, extractDepositFromText } from "../../src/lib/parsers/common";

describe("bathroomCount", () => {
  it("treats 0 as unknown (portals' missing-value sentinel)", () => {
    expect(bathroomCount(0)).toBeUndefined();
    expect(bathroomCount("0")).toBeUndefined();
  });

  it("passes through a genuine positive count", () => {
    expect(bathroomCount(1)).toBe(1);
    expect(bathroomCount(2)).toBe(2);
    expect(bathroomCount("3")).toBe(3);
  });

  it("returns undefined for missing / non-numeric input", () => {
    expect(bathroomCount(null)).toBeUndefined();
    expect(bathroomCount(undefined)).toBeUndefined();
    expect(bathroomCount("")).toBeUndefined();
    expect(bathroomCount("n/a")).toBeUndefined();
  });

  it("treats negatives as unknown", () => {
    expect(bathroomCount(-1)).toBeUndefined();
  });
});

describe("extractDepositFromText", () => {
  it("reads a clean 'Deposit £X' figure", () => {
    expect(extractDepositFromText("Security Deposit £2,800 payable on signing")).toBe(2800);
    expect(extractDepositFromText("Deposit: £1,950")).toBe(1950);
  });

  it("reads a deposit even when the next table field is rent", () => {
    // The OpenRent fact table renders "Deposit £X Rent PCM £Y" — the
    // trailing "Rent" is the NEXT field's label, not a qualifier.
    expect(
      extractDepositFromText("Bills Deposit £6,784.61 Rent PCM £5,880.00 Bills")
    ).toBe(6784.61);
  });

  it("skips holding deposits (a different, smaller figure)", () => {
    expect(extractDepositFromText("Holding deposit £450 to reserve")).toBeUndefined();
  });

  it("skips combined deposit+rent figures", () => {
    // The £5,150 prod hallucination: deposit + first month's rent.
    expect(
      extractDepositFromText("Move-in deposit £5,150 (5 weeks + 1st month)")
    ).toBeUndefined();
    expect(
      extractDepositFromText("Deposit £5,150 including first month's rent")
    ).toBeUndefined();
  });

  it("prefers the real deposit over a preceding holding deposit", () => {
    expect(
      extractDepositFromText("Holding deposit £450. Security deposit £2,400.")
    ).toBe(2400);
  });

  it("returns undefined when no deposit is mentioned", () => {
    expect(extractDepositFromText("A lovely two-bed flat near the park.")).toBeUndefined();
    expect(extractDepositFromText(undefined)).toBeUndefined();
  });
});
