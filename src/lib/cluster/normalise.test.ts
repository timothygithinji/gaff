/**
 * Unit tests for `normaliseAddress`.
 *
 * The function is the load-bearing piece of cross-portal cluster
 * matching: same physical home → same key, different physical home →
 * different key. The cases below cover the shapes we've actually seen
 * come out of Rightmove / Zoopla / OpenRent search results.
 */

import { describe, expect, it } from "vitest";
import { normaliseAddress } from "./normalise";

describe("normaliseAddress", () => {
  it("normalises a bare street + postcode address", () => {
    expect(normaliseAddress("22 Elm Street, NW3 1AA")).toBe(
      "22 elm street nw3 1aa"
    );
  });

  it("preserves flat numbers as distinct tokens", () => {
    expect(normaliseAddress("Flat 4, 12 Elm Street, NW3 1AA")).toBe(
      "flat 4 12 elm street nw3 1aa"
    );
  });

  it("normalises the 'Apartment N' prefix the same way as 'Flat N'", () => {
    expect(normaliseAddress("Apartment 5, The Old Mill, NW3 1AB")).toBe(
      "apartment 5 the old mill nw3 1ab"
    );
  });

  it("keeps house-number letter suffixes (22A stays distinct from 22)", () => {
    const withSuffix = normaliseAddress("22A Elm Street, NW3 1AA");
    const without = normaliseAddress("22 Elm Street, NW3 1AA");
    expect(withSuffix).toBe("22a elm street nw3 1aa");
    expect(without).toBe("22 elm street nw3 1aa");
    expect(withSuffix).not.toBe(without);
  });

  it("preserves the postcode (including the internal space)", () => {
    expect(normaliseAddress("12 Elm Street, NW3 1AA")).toContain("nw3 1aa");
  });

  it("lowercases all letters", () => {
    expect(normaliseAddress("12 ELM STREET, NW3 1AA")).toBe(
      "12 elm street nw3 1aa"
    );
  });

  it("collapses leading, trailing, and inner whitespace", () => {
    expect(
      normaliseAddress("   Flat   4  ,  12   ELM   Street  ,  NW3 1AA   ")
    ).toBe("flat 4 12 elm street nw3 1aa");
  });

  it("strips punctuation other than spaces (commas, periods, apostrophes)", () => {
    expect(normaliseAddress("St. John's Court, Apt. 3, NW3 1AA")).toBe(
      "st john s court apt 3 nw3 1aa"
    );
  });

  // The critical handoff quirk #8 case: two flats in the SAME building
  // must produce DIFFERENT normalised strings, or they will incorrectly
  // collapse into one cluster and inherit each other's swipes.
  it("produces DIFFERENT keys for different flats in the same building", () => {
    const flat1 = normaliseAddress("Flat 1, 22 Elm Street, NW3 1AA");
    const flat2 = normaliseAddress("Flat 2, 22 Elm Street, NW3 1AA");
    const flat3 = normaliseAddress("Flat 3, 22 Elm Street, NW3 1AA");
    const bare = normaliseAddress("22 Elm Street, NW3 1AA");

    expect(flat1).toBe("flat 1 22 elm street nw3 1aa");
    expect(flat2).toBe("flat 2 22 elm street nw3 1aa");
    expect(flat3).toBe("flat 3 22 elm street nw3 1aa");
    expect(bare).toBe("22 elm street nw3 1aa");

    const all = new Set([flat1, flat2, flat3, bare]);
    expect(all.size).toBe(4);
  });
});
