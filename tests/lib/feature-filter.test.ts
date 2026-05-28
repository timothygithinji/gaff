/**
 * Tests for the highlight / watchout denylist.
 *
 * Labels here mirror the actual top-frequency entries from a
 * `SELECT label, count(*)` over the prod `enrichments.features`
 * blob — the test corpus is derived from real output, not invented.
 */

import { describe, expect, it } from "vitest";
import {
  filterFeatures,
  isNoiseHighlight,
  isNoiseWatchout,
} from "../../src/lib/ai/feature-filter";

describe("isNoiseHighlight", () => {
  it.each([
    // Top noise entries from the prod query.
    "Furnished",
    "Unfurnished",
    "Part furnished",
    "Available immediately",
    "Available now",
    "Gas central heating and double glazing",
    "Gas central heating",
    "Double glazing",
    "Wood flooring throughout",
    "Recently refurbished",
    "Newly refurbished throughout",
    "Modern kitchen and bathroom",
    "Modern fitted kitchen",
    "Stylish interior",
    "EPC C rated",
    "EPC rating B",
    "EPC rating C",
    "Two bathrooms",
    "Two double bedrooms",
    "No agent fees",
    "No fees",
  ])("drops %s as noise", (label) => {
    expect(isNoiseHighlight(label)).toBe(true);
  });

  it.each([
    // Real signal that MUST survive the filter.
    "Walk to Bounds Green tube",
    "FTTP 900Mbps available",
    "Below-median rent for SW9",
    "£250 below median for the outcode",
    "Deposit-free option available",
    "Pets accepted",
    "Loft storage",
    "Near M&S and Pure Gym",
  ])("keeps %s as real signal", (label) => {
    expect(isNoiseHighlight(label)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isNoiseHighlight("FURNISHED")).toBe(true);
    expect(isNoiseHighlight("available IMMEDIATELY")).toBe(true);
  });

  it("trims whitespace before matching", () => {
    expect(isNoiseHighlight("  Furnished  ")).toBe(true);
  });
});

describe("isNoiseWatchout", () => {
  it.each([
    // Top noise from prod, watchout side.
    "Bills not included",
    "Bills excluded",
    "Bills status unclear",
    "Bills not mentioned",
    "Bills status not specified",
    "Deposit equals one month's rent",
    "Deposit at legal limit",
    "Deposit at legal maximum",
    "Deposit at legal cap",
    "Deposit near legal cap",
    "No pets allowed",
    "No DSS tenants",
    "Families and pets not accepted",
    "Restrictive tenant policy",
    "No EPC rating provided",
    "No EPC rating available",
    "No EPC rating disclosed",
    "No broadband data available",
    "No broadband data",
    "No broadband speed data",
    "No broadband info",
    "6-month minimum term",
    "12-month minimum term",
    "Minimum 6-month term",
    "EPC D rating",
    "EPC rating D",
    "EPC D",
    "Deposit amount not stated",
    "Deposit not stated",
    "Deposit and fees not stated",
    "No washer mentioned",
    "No washing machine",
    "No washing machine mentioned",
    "EPC D with bills status unclear",
  ])("drops %s as noise", (label) => {
    expect(isNoiseWatchout(label)).toBe(true);
  });

  it.each([
    // Real signal that MUST survive — illegal disclosures, real cost
    // concerns, decision-changing facts.
    "Deposit above legal cap",
    "Deposit exceeds legal cap",
    "Agent fees may apply",
    "Short break clause",
    "EPC F rating",
    "EPC rating G",
    "High crime area",
    "Service charge above £2k/year",
    "Near busy main road",
    "EPC F with bills excluded",
  ])("keeps %s as real signal", (label) => {
    expect(isNoiseWatchout(label)).toBe(false);
  });

  it("only drops EPC D compound when paired with a data gap (not with a hard fact)", () => {
    // The compound where ONE side is a data gap is speculation.
    expect(isNoiseWatchout("EPC D with bills status unclear")).toBe(true);
    // EPC F + a hard fact is still a real watchout.
    expect(isNoiseWatchout("EPC F with bills excluded")).toBe(false);
  });
});

describe("filterFeatures", () => {
  it("returns null when input is null (existing code paths unchanged)", () => {
    expect(filterFeatures(null)).toBeNull();
  });

  it("preserves the summary verbatim", () => {
    const filtered = filterFeatures({
      summary: "Two-bed mews flat in NW3 with a south-facing garden.",
      highlights: [],
      watchouts: [],
    });
    expect(filtered?.summary).toBe(
      "Two-bed mews flat in NW3 with a south-facing garden."
    );
  });

  it("drops noise from both lists while keeping real signal", () => {
    const filtered = filterFeatures({
      summary: null,
      highlights: [
        { label: "Furnished", detail: null },
        { label: "Walk to Bounds Green tube", detail: "6 minutes" },
        { label: "Available immediately", detail: null },
        { label: "FTTP 900Mbps available", detail: null },
      ],
      watchouts: [
        {
          severity: "caution",
          label: "Bills not included",
          detail: "Common in this area",
        },
        {
          severity: "problem",
          label: "Deposit above legal cap",
          detail: "£3,200 = 7 weeks",
        },
        {
          severity: "caution",
          label: "6-month minimum term",
          detail: null,
        },
        {
          severity: "caution",
          label: "High crime area",
          detail: "180 incidents/month",
        },
      ],
    });

    expect(filtered?.highlights.map((h) => h.label)).toEqual([
      "Walk to Bounds Green tube",
      "FTTP 900Mbps available",
    ]);
    expect(filtered?.watchouts.map((w) => w.label)).toEqual([
      "Deposit above legal cap",
      "High crime area",
    ]);
  });

  it("drops items with empty or whitespace-only labels", () => {
    const filtered = filterFeatures({
      summary: null,
      highlights: [
        { label: "", detail: null },
        { label: "   ", detail: null },
        { label: "Below-median rent for SW9", detail: null },
      ],
      watchouts: [],
    });
    expect(filtered?.highlights).toHaveLength(1);
    expect(filtered?.highlights[0]?.label).toBe("Below-median rent for SW9");
  });

  it("preserves `severity` on retained watchouts", () => {
    const filtered = filterFeatures({
      summary: null,
      highlights: [],
      watchouts: [
        {
          severity: "problem",
          label: "Deposit above legal cap",
          detail: null,
        },
      ],
    });
    expect(filtered?.watchouts).toEqual([
      { severity: "problem", label: "Deposit above legal cap", detail: null },
    ]);
  });
});
