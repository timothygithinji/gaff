/**
 * Unit tests for the EPC enrichment mapping.
 *
 * Two real bugs lived here: the EPC search endpoint returns
 * `{ "column-names": [...], "rows": [...] }` rather than the bare array the
 * generated spec claims, and the rows use kebab-case keys
 * (`current-energy-rating`) while the app reads camelCase (`currentRating`).
 * These golden-value checks pin both the row extraction and the
 * normalisation so EPC can't silently stop populating again.
 */

import { describe, expect, it } from "vitest";
import { extractCertRows, normaliseEpcCert } from "./enrich-epc";

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

describe("normaliseEpcCert", () => {
  it("maps kebab-case fields and derives a 10-year expiry", () => {
    expect(
      normaliseEpcCert({
        "current-energy-rating": "D",
        "potential-energy-rating": "C",
        "lodgement-date": "2019-04-24",
      })
    ).toEqual({
      currentRating: "D",
      potentialRating: "C",
      expiresOn: "2029-04-24",
    });
  });

  it("omits optional fields when absent", () => {
    expect(normaliseEpcCert({ "current-energy-rating": "E" })).toEqual({
      currentRating: "E",
    });
  });

  it("trims whitespace and treats blank ratings as no certificate", () => {
    expect(normaliseEpcCert({ "current-energy-rating": "  B " })).toEqual({
      currentRating: "B",
    });
    expect(normaliseEpcCert({ "current-energy-rating": "   " })).toBeNull();
    expect(normaliseEpcCert({})).toBeNull();
  });

  it("ignores an unparseable lodgement date", () => {
    expect(
      normaliseEpcCert({
        "current-energy-rating": "C",
        "lodgement-date": "not-a-date",
      })
    ).toEqual({ currentRating: "C" });
  });
});
