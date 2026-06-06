/**
 * Tests for the TfL/Google nearby-places merge.
 *
 * Covers the two splices the detail page relies on: rail-family stations
 * swapped for TfL's (carrying `modes` + line names), and Google's coarse
 * bus stops swapped for TfL's (carrying route numbers) — both degrading to
 * the Google data when TfL has no coverage.
 */

import { describe, expect, it } from "vitest";
import type { NearbyPlace } from "../../src/lib/google-places";
import { mergeTflBusStops, mergeTflStations } from "../../src/lib/nearby-places";

const googleSet: NearbyPlace[] = [
  {
    name: "Old Rail",
    category: "transport",
    kind: "rail",
    lat: 51.6,
    lng: -0.1,
    distanceMiles: 0.5,
  },
  {
    name: "Some Stop (Stop A)",
    category: "transport",
    kind: "bus",
    lat: 51.61,
    lng: -0.11,
    distanceMiles: 0.2,
  },
  {
    name: "Tesco",
    category: "shop",
    kind: null,
    lat: 51.62,
    lng: -0.12,
    distanceMiles: 0.3,
  },
];

describe("mergeTflStations", () => {
  it("replaces rail-family stations with TfL ones carrying modes + lines", () => {
    const out = mergeTflStations(googleSet, [
      {
        name: "Bounds Green",
        lat: 51.6,
        lng: -0.12,
        distanceMiles: 0.4,
        modes: ["tube"],
        lines: ["Piccadilly"],
      },
    ]);
    const station = out.find((p) => p.name === "Bounds Green");
    expect(station?.modes).toEqual(["tube"]);
    expect(station?.lines).toEqual(["Piccadilly"]);
    // Google's coarse "Old Rail" is dropped; non-rail places are kept.
    expect(out.some((p) => p.name === "Old Rail")).toBe(false);
    expect(out.some((p) => p.name === "Tesco")).toBe(true);
    expect(out.some((p) => p.kind === "bus")).toBe(true);
  });

  it("no-ops (keeps Google stations) when TfL has no coverage", () => {
    expect(mergeTflStations(googleSet, [])).toBe(googleSet);
  });
});

describe("mergeTflBusStops", () => {
  it("replaces Google bus stops with TfL ones carrying route numbers", () => {
    const out = mergeTflBusStops(googleSet, [
      {
        name: "Warwick Road",
        lat: 51.61,
        lng: -0.11,
        distanceMiles: 0.15,
        lines: ["34", "232"],
      },
    ]);
    expect(out.some((p) => p.name === "Some Stop (Stop A)")).toBe(false);
    const bus = out.find((p) => p.name === "Warwick Road");
    expect(bus?.kind).toBe("bus");
    expect(bus?.lines).toEqual(["34", "232"]);
    // Rail + POIs untouched.
    expect(out.some((p) => p.name === "Old Rail")).toBe(true);
    expect(out.some((p) => p.name === "Tesco")).toBe(true);
  });

  it("no-ops when TfL has no bus coverage", () => {
    expect(mergeTflBusStops(googleSet, [])).toBe(googleSet);
  });
});
