import { describe, expect, it } from "vitest";
import { coordsCorroborate, distanceMetres, listingCoord } from "./coords";

describe("listingCoord", () => {
  it("prefers the column when present", () => {
    expect(
      listingCoord({ lat: 51.6, lng: -0.12, rawJson: { lat: 1, lng: 2 } })
    ).toEqual({ lat: 51.6, lng: -0.12 });
  });

  it("accepts numeric-string columns (drizzle numeric)", () => {
    expect(listingCoord({ lat: "51.6", lng: "-0.12" })).toEqual({
      lat: 51.6,
      lng: -0.12,
    });
  });

  it("falls back to raw_json when columns are null", () => {
    expect(
      listingCoord({ lat: null, lng: null, rawJson: { lat: 51.62, lng: -0.13 } })
    ).toEqual({ lat: 51.62, lng: -0.13 });
  });

  it("returns null when nothing usable", () => {
    expect(listingCoord({ lat: null, lng: null, rawJson: {} })).toBeNull();
  });
});

describe("distanceMetres / coordsCorroborate", () => {
  const a = { lat: 51.61195, lng: -0.122162 };

  it("is ~0 for the same point", () => {
    expect(distanceMetres(a, a)).toBeCloseTo(0, 5);
  });

  it("separates different buildings on a long road (hundreds of m)", () => {
    const far = { lat: 51.6155, lng: -0.122162 }; // ~390m north
    expect(distanceMetres(a, far)).toBeGreaterThan(100);
    expect(coordsCorroborate(a, far)).toBe(false);
  });

  it("absorbs building-vs-centroid jitter within ~30m", () => {
    const near = { lat: 51.61215, lng: -0.122162 }; // ~22m north
    expect(coordsCorroborate(a, near)).toBe(true);
  });

  it("never corroborates on a null coord", () => {
    expect(coordsCorroborate(a, null)).toBe(false);
    expect(coordsCorroborate(null, a)).toBe(false);
  });
});
