/**
 * Unit tests for council-tax band-rate derivation.
 *
 * The band ratios are fixed in statute, so these are golden-value
 * checks: Band D is the reference, A is two-thirds of it, H is double.
 * `currentCouncilTaxYear` must roll over on 1 April, not 1 January.
 */

import { describe, expect, it } from "vitest";
import {
  bandAmountPence,
  currentCouncilTaxYear,
  normaliseBand,
  resolveBillingAuthority,
} from "./council-tax";

describe("bandAmountPence", () => {
  // £1,800 Band D in pence.
  const bandD = 180_000;

  it("returns Band D unchanged", () => {
    expect(bandAmountPence(bandD, "D")).toBe(180_000);
  });

  it("applies the statutory ratios for every band", () => {
    expect(bandAmountPence(bandD, "A")).toBe(120_000); // 6/9
    expect(bandAmountPence(bandD, "B")).toBe(140_000); // 7/9
    expect(bandAmountPence(bandD, "C")).toBe(160_000); // 8/9
    expect(bandAmountPence(bandD, "E")).toBe(220_000); // 11/9
    expect(bandAmountPence(bandD, "F")).toBe(260_000); // 13/9
    expect(bandAmountPence(bandD, "G")).toBe(300_000); // 15/9
    expect(bandAmountPence(bandD, "H")).toBe(360_000); // 18/9
  });

  it("normalises lower-case and trailing text", () => {
    expect(bandAmountPence(bandD, "c")).toBe(160_000);
    expect(bandAmountPence(bandD, "Band G")).toBe(300_000);
  });

  it("rounds to whole pence", () => {
    // 8/9 of an odd figure isn't an integer; result must be rounded.
    expect(bandAmountPence(100_001, "C")).toBe(Math.round((100_001 * 8) / 9));
  });

  it("returns null for an unknown band", () => {
    expect(bandAmountPence(bandD, "I")).toBeNull();
    expect(bandAmountPence(bandD, "")).toBeNull();
    expect(bandAmountPence(bandD, null)).toBeNull();
  });
});

describe("normaliseBand", () => {
  it("extracts the leading band letter", () => {
    expect(normaliseBand("A")).toBe("A");
    expect(normaliseBand(" band h ")).toBe("H");
  });

  it("rejects out-of-range and empty input", () => {
    expect(normaliseBand("I")).toBeNull();
    expect(normaliseBand("Z")).toBeNull();
    expect(normaliseBand(null)).toBeNull();
  });
});

describe("resolveBillingAuthority", () => {
  const urlOf = (input: string | URL | Request): string => {
    if (typeof input === "string") {
      return input;
    }
    return input instanceof Request ? input.url : input.toString();
  };

  // A fetch stub that answers postcodes.io routes from a fixture map.
  function stubFetch(routes: Record<string, unknown>): typeof fetch {
    return ((input: string | URL | Request) => {
      const url = urlOf(input);
      const key = Object.keys(routes).find((k) => url.includes(k));
      const headers = { "Content-Type": "application/json" };
      if (!key) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: 404 }), { status: 404, headers })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(routes[key]), { status: 200, headers })
      );
    }) as typeof fetch;
  }

  it("resolves a full postcode to its billing authority", async () => {
    const fetchImpl = stubFetch({
      "/postcodes/GU11AA": {
        status: 200,
        result: {
          country: "England",
          admin_district: "Guildford",
          codes: { admin_district: "E07000209" },
        },
      },
    });
    const authority = await resolveBillingAuthority(
      { postcode: "GU1 1AA" },
      { fetch: fetchImpl }
    );
    expect(authority).toEqual({
      code: "E07000209",
      name: "Guildford",
      country: "England",
    });
  });

  it("reverse-geocodes from lat/lng when there's no full postcode", async () => {
    const fetchImpl = stubFetch({
      "/postcodes?lon=": {
        status: 200,
        result: [
          {
            country: "England",
            admin_district: "Barnet",
            codes: { admin_district: "E09000003" },
          },
        ],
      },
    });
    const authority = await resolveBillingAuthority(
      { postcode: "N11", lat: 51.61195, lng: -0.122162 },
      { fetch: fetchImpl }
    );
    expect(authority?.code).toBe("E09000003");
    expect(authority?.name).toBe("Barnet");
  });

  it("returns null for an outcode with no coordinates (can't pin an authority)", async () => {
    // Even if the network were hit, an outcode isn't a full postcode and
    // there are no coords, so nothing should resolve.
    const fetchImpl = stubFetch({});
    const authority = await resolveBillingAuthority(
      { postcode: "N11" },
      { fetch: fetchImpl }
    );
    expect(authority).toBeNull();
  });
});

describe("currentCouncilTaxYear", () => {
  it("rolls over on 1 April, not 1 January", () => {
    expect(currentCouncilTaxYear(new Date("2026-03-31T12:00:00Z"))).toBe(
      "2025-26"
    );
    expect(currentCouncilTaxYear(new Date("2026-04-01T00:00:00Z"))).toBe(
      "2026-27"
    );
  });

  it("zero-pads the end year across a decade boundary", () => {
    expect(currentCouncilTaxYear(new Date("2009-06-01T00:00:00Z"))).toBe(
      "2009-10"
    );
    expect(currentCouncilTaxYear(new Date("2100-06-01T00:00:00Z"))).toBe(
      "2100-01"
    );
  });
});
