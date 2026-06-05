import { describe, expect, it } from "vitest";
import {
  type SearchLocation,
  deselectedOutcodes,
} from "../../src/lib/search-location";

function area(
  coveringOutcodes: string[] | undefined,
  allOutcodes: string[] | undefined
): SearchLocation {
  return {
    placeId: "curated:north-london",
    name: "North London",
    formattedAddress: "North London, London, UK",
    type: "colloquial_area",
    lat: 51.58,
    lng: -0.15,
    bounds: { ne: { lat: 51.63, lng: -0.06 }, sw: { lat: 51.53, lng: -0.25 } },
    coveringOutcodes,
    allOutcodes,
    portalRefs: {},
  };
}

describe("deselectedOutcodes", () => {
  it("returns allOutcodes minus the active coveringOutcodes", () => {
    expect(
      deselectedOutcodes(area(["N1", "N4"], ["N1", "N4", "N9", "N21"]))
    ).toEqual(["N9", "N21"]);
  });

  it("is empty when nothing is switched off", () => {
    expect(
      deselectedOutcodes(area(["N1", "N4", "N9"], ["N1", "N4", "N9"]))
    ).toEqual([]);
  });

  it("is empty for a postcode search (no allOutcodes)", () => {
    expect(deselectedOutcodes(area(undefined, undefined))).toEqual([]);
  });

  it("treats a missing active list as everything switched off", () => {
    expect(deselectedOutcodes(area(undefined, ["N1", "N9"]))).toEqual([
      "N1",
      "N9",
    ]);
  });

  it("normalises case/whitespace and dedupes", () => {
    expect(
      deselectedOutcodes(area([" n1 "], ["N1", "n9", "N9", " nw1 "]))
    ).toEqual(["N9", "NW1"]);
  });
});
