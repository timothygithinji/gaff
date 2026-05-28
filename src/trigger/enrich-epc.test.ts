/**
 * Unit tests for EPC certificate resolution.
 *
 * Real bugs pinned here: the search endpoint returns
 * `{ "column-names": [...], "rows": [...] }` (not the bare array the spec
 * claims), rows use kebab-case keys, EPC rows carry NO coordinates (so we
 * can't pick "the nearest"), and ~74% of listings are street-only (so we
 * must NOT assert an exact match without a house number). These checks lock
 * the row extraction, the conservative exact match, and the postcode-level
 * estimate fallback.
 */

import { describe, expect, it } from "vitest";
import {
  certsForBuilding,
  estimateBlob,
  exactBlob,
  extractCertRows,
  isHouseType,
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

describe("estimateBlob", () => {
  it("summarises a postcode into a modal rating + best..worst range", () => {
    const certs = [
      { "current-energy-rating": "C" },
      { "current-energy-rating": "C" },
      { "current-energy-rating": "D" },
      { "current-energy-rating": "E" },
    ];
    expect(estimateBlob(certs, "N11 3PR")).toEqual({
      currentRating: "C",
      source: "estimate",
      postcode: "N11 3PR",
      sampleSize: 4,
      range: { min: "C", max: "E" },
    });
  });

  it("breaks a modal tie toward the better band", () => {
    const certs = [
      { "current-energy-rating": "C" },
      { "current-energy-rating": "E" },
    ];
    const blob = estimateBlob(certs, "N11 3PR");
    expect(blob?.currentRating).toBe("C");
    expect(blob?.range).toEqual({ min: "C", max: "E" });
  });

  it("ignores unparseable ratings and returns null when none are usable", () => {
    expect(estimateBlob([{ "current-energy-rating": "?" }, {}], "N11 3PR")).toBeNull();
  });
});

describe("isHouseType", () => {
  it.each([
    "terraced",
    "Terraced",
    "semi_detached",
    "Semi-detached House",
    "Detached Bungalow",
    "End of Terrace House",
    "Mews",
    "Cottage",
  ])("recognises %s as a house", (type) => {
    expect(isHouseType(type)).toBe(true);
  });

  it.each([
    "flat",
    "Flat",
    "Apartment",
    "maisonette",
    "Studio Flat",
    // "Room in a Shared House" contains the token "house", but the
    // multi-unit guard knocks it out — geocoding a shared house still
    // pins the building, not the room.
    "Room in a Shared House",
    "Room in a Shared Flat",
  ])("does NOT treat %s as a house", (type) => {
    expect(isHouseType(type)).toBe(false);
  });

  it("defaults missing types to flat (returns false)", () => {
    expect(isHouseType(null)).toBe(false);
    expect(isHouseType(undefined)).toBe(false);
    expect(isHouseType("")).toBe(false);
  });
});

describe("certsForBuilding", () => {
  const certs = [
    { address: "Flat 1, 23 Bowes Road" },
    { address: "Flat 2, 23 Bowes Road" },
    { address: "Flat 1, 25 Bowes Road" },
    { address: "Flat 1, 23 Elsewhere Street" },
    { address: "10 Bowes Road" },
  ] as { address: string }[];

  it("filters to certs sharing the building's number AND street word", () => {
    const result = certsForBuilding(certs, "23 Bowes Road, London N11 1AB");
    expect(result.map((c) => c.address)).toEqual([
      "Flat 1, 23 Bowes Road",
      "Flat 2, 23 Bowes Road",
    ]);
  });

  it("passes certs through unchanged when the address has no number", () => {
    expect(certsForBuilding(certs, "Bowes Road, London N11").length).toBe(
      certs.length
    );
  });

  it("returns [] when no cert matches the building (caller falls back)", () => {
    expect(certsForBuilding(certs, "99 Bowes Road, London N11")).toEqual([]);
  });

  it("does not treat a bedroom count as a building number", () => {
    // "2 Bedroom Flat" must not collapse the building filter onto
    // every cert whose address contains a 2.
    expect(
      certsForBuilding(certs, "2 bedroom flat bowes road n11")
        .map((c) => c.address)
    ).toEqual(certs.map((c) => c.address));
  });
});
