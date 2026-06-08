import { describe, expect, it } from "vitest";
import {
  type ListingPhotoSignals,
  clusterMatchVotes,
  groupByPhotoIdentity,
  sameHome,
} from "./photo-match";

function L(over: Partial<ListingPhotoSignals>): ListingPhotoSignals {
  return {
    id: "x",
    outcode: "n8",
    bedrooms: 3,
    portal: "zoopla",
    contentKeys: [],
    phashes: [],
    ...over,
  };
}

describe("sameHome blocking", () => {
  it("rejects different outcodes outright", () => {
    const a = L({ outcode: "n8", contentKeys: ["1", "2", "3"] });
    const b = L({ outcode: "n7", contentKeys: ["1", "2", "3"] });
    expect(sameHome(a, b)).toBe(false);
  });

  it("rejects mismatched bedroom counts", () => {
    const a = L({ bedrooms: 3, contentKeys: ["1", "2", "3"] });
    const b = L({ bedrooms: 2, contentKeys: ["1", "2", "3"] });
    expect(sameHome(a, b)).toBe(false);
  });

  it("allows a null bedroom count through to the photo test", () => {
    const a = L({ bedrooms: null, contentKeys: ["1", "2", "3"] });
    const b = L({ bedrooms: 3, contentKeys: ["1", "2", "3"] });
    expect(sameHome(a, b)).toBe(true);
  });
});

describe("sameHome identity", () => {
  it("same-portal re-list matches on content keys", () => {
    const a = L({ portal: "zoopla", contentKeys: ["1", "2", "3", "4"] });
    const b = L({ portal: "zoopla", contentKeys: ["1", "2", "3", "4"] });
    expect(sameHome(a, b)).toBe(true);
  });

  it("same building, different flats (disjoint photos) do NOT match", () => {
    const a = L({ portal: "zoopla", contentKeys: ["a1", "a2", "a3"] });
    const b = L({ portal: "zoopla", contentKeys: ["b1", "b2", "b3"] });
    expect(sameHome(a, b)).toBe(false);
  });

  it("cross-portal matches on near-identical perceptual hashes", () => {
    const a = L({ portal: "zoopla", phashes: [0n, 1n, 2n, 3n] });
    const b = L({ portal: "rightmove", phashes: [0n, 5n, 6n, 7n] });
    expect(sameHome(a, b, { maxHamming: 4 })).toBe(true);
  });

  it("cross-portal unrelated photos do not match", () => {
    const a = L({ portal: "zoopla", phashes: [0n, 1n, 2n] });
    const b = L({
      portal: "rightmove",
      phashes: [0xffffffffffffffffn, 0xff00ff00n, 0x0f0f0f0fn],
    });
    expect(sameHome(a, b, { maxHamming: 6 })).toBe(false);
  });
});

describe("groupByPhotoIdentity", () => {
  it("separates distinct flats in one building and groups true duplicates", () => {
    // Mirrors the jRr Turnpike Lane case: same outcode/beds, one identical
    // pair, the rest disjoint.
    const flatA1 = L({ id: "a1", contentKeys: ["a1", "a2", "a3", "a4"] });
    const flatA2 = L({ id: "a2", contentKeys: ["a1", "a2", "a3", "a4"] }); // dup of a1
    const flatB = L({ id: "b", contentKeys: ["b1", "b2", "b3", "b4"] });
    const flatC = L({ id: "c", contentKeys: ["c1", "c2", "c3", "c4"] });

    const groups = groupByPhotoIdentity([flatA1, flatA2, flatB, flatC]).map(
      (g) => g.sort().join(",")
    );
    expect(groups.sort()).toEqual(["a1,a2", "b", "c"]);
  });

  it("leaves a photo-less listing as its own singleton", () => {
    const withPhotos = L({ id: "p", contentKeys: ["1", "2", "3"] });
    const noPhotos = L({ id: "n", contentKeys: [], phashes: [] });
    const groups = groupByPhotoIdentity([withPhotos, noPhotos]).map((g) =>
      g.join(",")
    );
    expect(groups.sort()).toEqual(["n", "p"]);
  });
});

describe("clusterMatchVotes", () => {
  const me = L({ id: "me", contentKeys: ["1", "2", "3", "4"] });

  it("tallies matches per cluster and ignores non-matches", () => {
    const others = [
      { ...L({ id: "a", contentKeys: ["1", "2", "3", "4"] }), clusterId: "C1" },
      { ...L({ id: "b", contentKeys: ["1", "2", "3", "4"] }), clusterId: "C1" },
      { ...L({ id: "c", contentKeys: ["x", "y", "z"] }), clusterId: "C2" },
    ];
    const votes = clusterMatchVotes(me, others);
    expect(votes.get("C1")).toBe(2);
    expect(votes.has("C2")).toBe(false);
  });

  it("returns an empty map when nothing matches", () => {
    const others = [
      { ...L({ id: "c", contentKeys: ["x", "y", "z"] }), clusterId: "C2" },
    ];
    expect(clusterMatchVotes(me, others).size).toBe(0);
  });
});
