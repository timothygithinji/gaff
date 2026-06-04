/**
 * Unit tests for EPC certificate resolution.
 *
 * Real bugs pinned here: the search endpoint returns
 * `{ "column-names": [...], "rows": [...] }` (not the bare array the spec
 * claims), rows use kebab-case keys, EPC rows carry NO coordinates (so we
 * can't pick "the nearest"), and ~74% of listings are street-only (so we
 * must NOT assert an exact match without a house number). These checks lock
 * the row extraction and the conservative exact match — the only band we
 * store (postcode-level estimates were dropped as too unreliable).
 */

import { describe, expect, it } from "vitest";
import {
  exactBlob,
  extractCertRows,
  pickExactCert,
} from "./enrich-epc";

describe("extractCertRows", () => {
  it("pulls rows out of the wrapped search response", () => {
    const body = {
      "column-names": ["current-energy-rating"],
      rows: [{ "current-energy-rating": "C" }, { "current-energy-rating": "D" }],
    };
    expect(extractCertRows(body)).toHaveLength(2);
  });

  it("tolerates a bare array (the shape the spec claims)", () => {
    const rows = [{ "current-energy-rating": "C" }];
    expect(extractCertRows(rows)).toBe(rows);
  });

  it("returns [] for missing / unexpected shapes", () => {
    expect(extractCertRows(undefined)).toEqual([]);
    expect(extractCertRows(null)).toEqual([]);
    expect(extractCertRows({})).toEqual([]);
    expect(extractCertRows({ rows: "nope" })).toEqual([]);
  });
});

describe("pickExactCert", () => {
  // The actual N11 3PR certificate set shape.
  const certs = [
    { address: "21 Hampton Close", "current-energy-rating": "C" },
    { address: "13 Cannon Hill", "current-energy-rating": "D" },
    { address: "Flat 7, Bethell Lodge, 31 Springfield Road", "current-energy-rating": "D" },
  ];

  it("matches on shared house number + street word", () => {
    const hit = pickExactCert(certs, "13 Cannon Hill, N14");
    expect(hit?.address).toBe("13 Cannon Hill");
  });

  it("returns null for a street-only address (no number to anchor on)", () => {
    expect(pickExactCert(certs, "Hampton Close, New Southgate, N11")).toBeNull();
  });

  it("does not match on a shared number alone when no street word overlaps", () => {
    // "13" appears, but "elsewhere" shares no street word with any cert.
    expect(pickExactCert(certs, "13 Elsewhere Gardens")).toBeNull();
  });

  it("does not treat a bedroom count as a house number", () => {
    // "2 Bedroom Flat … Brunswick Park Road" must NOT exact-match the cert
    // for "2 Brunswick Park Road" — the 2 is a bed count, not a door number.
    const bedroomCerts = [
      { address: "2 Brunswick Park Road, New Southgate", "current-energy-rating": "D" },
    ];
    expect(
      pickExactCert(bedroomCerts, "2 bedroom flat brunswick park road n11")
    ).toBeNull();
  });

  it("returns null when there are no certs", () => {
    expect(pickExactCert([], "13 Cannon Hill")).toBeNull();
  });
});

describe("exactBlob", () => {
  it("maps kebab-case fields, derives a 10-year expiry, and tags source", () => {
    expect(
      exactBlob(
        {
          "current-energy-rating": "d",
          "potential-energy-rating": "C",
          "lodgement-date": "2019-04-24",
          address: "13 Cannon Hill",
        },
        "N14 6LP",
        "13 Cannon Hill"
      )
    ).toEqual({
      currentRating: "D",
      potentialRating: "C",
      expiresOn: "2029-04-24",
      source: "exact",
      matchedAddress: "13 Cannon Hill",
      postcode: "N14 6LP",
    });
  });

  it("returns null when the cert has no usable rating", () => {
    expect(exactBlob({ address: "x" }, "N14 6LP", "x")).toBeNull();
  });
});
