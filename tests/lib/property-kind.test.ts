import { describe, expect, it } from "vitest";
import { listingMatchesPropertyTypes } from "../../src/lib/property-kind";

const match = (type: string | null, title: string, wanted: string[]) =>
  listingMatchesPropertyTypes(type, title, wanted);

describe("listingMatchesPropertyTypes", () => {
  it("keeps everything when no filter is set", () => {
    expect(match("Flat", "2 bed flat", [])).toBe(true);
    expect(match(null, "anything", [])).toBe(true);
  });

  it("drops flats from a house search (the reported bug)", () => {
    expect(match("Flat", "2 bed flat in NW3", ["house"])).toBe(false);
    expect(match("Apartment", "Lovely apartment", ["house"])).toBe(false);
    expect(match("Maisonette", "Split-level maisonette", ["house"])).toBe(
      false
    );
  });

  it("keeps houses for a house search", () => {
    expect(match("Detached", "Detached house", ["house"])).toBe(true);
    expect(match("Terraced", "3 bed terraced", ["house"])).toBe(true);
    expect(match("End terrace house", "End of terrace", ["house"])).toBe(true);
    expect(match("Town house", "Modern town house", ["house"])).toBe(true);
  });

  it("treats bungalow as distinct from house", () => {
    // Bungalow excluded from a house-only search...
    expect(match("Bungalow", "Detached bungalow", ["house"])).toBe(false);
    // ...kept when bungalow is selected...
    expect(match("Bungalow", "Detached bungalow", ["bungalow"])).toBe(true);
    // ...and kept when both are selected.
    expect(match("Bungalow", "Detached bungalow", ["house", "bungalow"])).toBe(
      true
    );
  });

  it("drops houses from a flat search", () => {
    expect(match("Detached", "Detached house", ["flat"])).toBe(false);
    expect(match("Flat", "2 bed flat", ["flat"])).toBe(true);
  });

  it("counts studios as flats", () => {
    expect(match("Studio", "Studio flat", ["flat"])).toBe(true);
    expect(match("Studio", "Studio flat", ["house"])).toBe(false);
  });

  it("drops shares regardless of selected type", () => {
    expect(match("Room in a Shared House", "Room in shared house", ["house"])).toBe(
      false
    );
    expect(match("Room in a Shared Flat", "Room", ["flat"])).toBe(false);
  });

  it("keeps unclassifiable listings (keep-null convention)", () => {
    expect(match(null, "Parking space", ["house"])).toBe(true);
    expect(match("", "Plot of land", ["flat"])).toBe(true);
  });
});
