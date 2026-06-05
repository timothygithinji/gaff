/**
 * Unit tests for the server-side price / bedroom / exclusion re-filters.
 *
 * Portals encode the search's bands into their URL but don't reliably honour
 * them (OpenRent returns its full result set regardless), so these filters
 * are the backstop that keeps out-of-criteria listings out of the DB and
 * the review queue. The checks here pin inclusive bounds, the
 * "keep unknown values" rule, and the share-detector heuristics.
 */

import { describe, expect, it } from "vitest";
import type { ListingSummary } from "../lib/parsers/types";
import type { SearchLocation } from "../lib/search-location";
import {
  filterByBedroomRange,
  filterByExcludeLocations,
  filterByExclusions,
  filterByPriceRange,
} from "./scrape-portal";

function listing(
  portalListingId: string,
  priceMonthly: number | undefined
): ListingSummary {
  return { portalListingId, priceMonthly } as ListingSummary;
}

function bedListing(
  portalListingId: string,
  bedrooms: number | undefined
): ListingSummary {
  return { portalListingId, bedrooms } as ListingSummary;
}

const summaries: ListingSummary[] = [
  listing("a", 600),
  listing("b", 1000),
  listing("c", 2800),
  listing("d", 9000),
  listing("e", undefined),
];

const ids = (rows: ListingSummary[]) => rows.map((r) => r.portalListingId);

describe("filterByPriceRange", () => {
  it("drops listings below min and above max (bounds inclusive)", () => {
    expect(ids(filterByPriceRange(summaries, 1000, 2800))).toEqual([
      "b",
      "c",
      "e", // unknown price kept
    ]);
  });

  it("honours a min-only band", () => {
    expect(ids(filterByPriceRange(summaries, 1000, null))).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("honours a max-only band", () => {
    expect(ids(filterByPriceRange(summaries, null, 2800))).toEqual([
      "a",
      "b",
      "c",
      "e",
    ]);
  });

  it("is a no-op when no band is set", () => {
    const out = filterByPriceRange(summaries, null, null);
    expect(out).toBe(summaries);
  });

  it("keeps listings whose price didn't parse", () => {
    expect(ids(filterByPriceRange([listing("x", undefined)], 1000, 2000))).toEqual(
      ["x"]
    );
  });
});

describe("filterByBedroomRange", () => {
  const bedSummaries: ListingSummary[] = [
    bedListing("studio", 0),
    bedListing("one", 1),
    bedListing("two", 2),
    bedListing("three", 3),
    bedListing("unknown", undefined),
  ];

  it("drops listings outside the inclusive bed band", () => {
    // N14 prod scenario: min_bedrooms=2, no max — studios and 1-beds
    // (including `Room in a Shared X`) come back from OR even with
    // `bedrooms_min=2` in the URL.
    expect(ids(filterByBedroomRange(bedSummaries, 2, null))).toEqual([
      "two",
      "three",
      "unknown",
    ]);
  });

  it("honours a max-only bed band", () => {
    expect(ids(filterByBedroomRange(bedSummaries, null, 2))).toEqual([
      "studio",
      "one",
      "two",
      "unknown",
    ]);
  });

  it("is a no-op when no bed band is set", () => {
    const out = filterByBedroomRange(bedSummaries, null, null);
    expect(out).toBe(bedSummaries);
  });

  it("keeps listings whose bedrooms didn't parse", () => {
    expect(
      ids(filterByBedroomRange([bedListing("x", undefined)], 2, null))
    ).toEqual(["x"]);
  });
});

describe("filterByExclusions", () => {
  function shareListing(
    portalListingId: string,
    propertyType: string | undefined,
    title: string
  ): ListingSummary {
    return { portalListingId, propertyType, title } as ListingSummary;
  }

  const mixed: ListingSummary[] = [
    shareListing("flat", "Flat", "2 Bed Flat — Tudor Way"),
    shareListing(
      "shared-flat",
      "Room in a Shared Flat",
      "Room in a Shared Flat — Tudor Way"
    ),
    shareListing(
      "shared-house",
      "Room in a Shared House",
      "Room in a Shared House — Cat Hill"
    ),
    shareListing("studio", "Studio Flat", "Studio Flat — Bowes Road"),
    shareListing("hmo", "House", "5 Bed HMO — Friern Barnet"),
  ];

  it("drops `Room in a Shared X` listings when house_share is excluded", () => {
    // The exact prod offenders from OpenRent — propertyType set by the
    // OR parser, URL filter has no equivalent.
    expect(ids(filterByExclusions(mixed, ["house_share"]))).toEqual([
      "flat",
      "studio",
    ]);
  });

  it("is a no-op when house_share isn't excluded", () => {
    const out = filterByExclusions(mixed, ["student", "retirement"]);
    expect(out).toBe(mixed);
  });

  it("is a no-op for an empty exclusion list", () => {
    const out = filterByExclusions(mixed, []);
    expect(out).toBe(mixed);
  });
});

describe("filterByExcludeLocations", () => {
  function pcListing(
    portalListingId: string,
    postcode: string | undefined
  ): ListingSummary {
    return { portalListingId, postcode } as ListingSummary;
  }

  /** Area include location: N1/N4/NW1 kept, N9 switched off. */
  const northLondon: SearchLocation = {
    placeId: "curated:north-london",
    name: "North London",
    formattedAddress: "North London, London, UK",
    type: "colloquial_area",
    lat: 51.58,
    lng: -0.15,
    bounds: { ne: { lat: 51.63, lng: -0.06 }, sw: { lat: 51.53, lng: -0.25 } },
    coveringOutcodes: ["N1", "N4", "NW1"],
    allOutcodes: ["N1", "N4", "NW1", "N9"],
    portalRefs: {},
  };

  const rows: ListingSummary[] = [
    pcListing("keep-n1", "N1 7AA"),
    pcListing("drop-n9", "N9 0AB"), // switched-off outcode (OpenRent spill)
    pcListing("keep-nw1", "NW1 4RY"),
    pcListing("keep-unknown", undefined), // no postcode → kept
  ];

  it("drops listings in a switched-off (deselected) outcode", () => {
    const out = filterByExcludeLocations(rows, [], northLondon);
    expect(ids(out)).toEqual(["keep-n1", "keep-nw1", "keep-unknown"]);
  });

  it("still applies explicit postal_code excludes alongside deselected ones", () => {
    const excludes: SearchLocation[] = [
      {
        placeId: "",
        name: "NW1",
        formattedAddress: "NW1",
        type: "postal_code",
        lat: 51.53,
        lng: -0.14,
        bounds: null,
        portalRefs: {},
      },
    ];
    const out = filterByExcludeLocations(rows, excludes, northLondon);
    // NW1 excluded by the user, N9 dropped as deselected.
    expect(ids(out)).toEqual(["keep-n1", "keep-unknown"]);
  });

  it("is a no-op when nothing is excluded or deselected", () => {
    const allOn: SearchLocation = {
      ...northLondon,
      coveringOutcodes: ["N1", "N4", "NW1", "N9"],
      allOutcodes: ["N1", "N4", "NW1", "N9"],
    };
    const out = filterByExcludeLocations(rows, [], allOn);
    expect(out).toBe(rows);
  });
});
