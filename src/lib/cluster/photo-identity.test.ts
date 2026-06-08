import { describe, expect, it } from "vitest";
import {
  contentKeysMatch,
  hammingDistance,
  phashesMatch,
  photoContentKey,
} from "./photo-identity";

describe("photoContentKey", () => {
  it("extracts the CDN basename, dropping query strings", () => {
    expect(
      photoContentKey("https://lid.zoocdn.com/1600/1200/abc123.jpg")
    ).toBe("abc123.jpg");
    expect(
      photoContentKey("https://lid.zoocdn.com/640/480/abc123.jpg?crop=1")
    ).toBe("abc123.jpg");
  });

  it("is case-insensitive and trims", () => {
    expect(photoContentKey("https://x/AbC.JPG")).toBe("abc.jpg");
  });

  it("is empty for an unusable url", () => {
    expect(photoContentKey("")).toBe("");
  });
});

describe("hammingDistance", () => {
  it("counts differing bits", () => {
    expect(hammingDistance(0n, 0n)).toBe(0);
    expect(hammingDistance(0b1011n, 0b1110n)).toBe(2);
    expect(hammingDistance(0xffffffffffffffffn, 0n)).toBe(64);
  });
});

describe("contentKeysMatch", () => {
  it("matches an identical same-portal re-list (full overlap)", () => {
    const a = ["1.jpg", "2.jpg", "3.jpg", "4.jpg"];
    expect(contentKeysMatch(a, [...a])).toBe(true);
  });

  it("rejects two flats that share no images", () => {
    expect(
      contentKeysMatch(["a.jpg", "b.jpg", "c.jpg"], ["x.jpg", "y.jpg", "z.jpg"])
    ).toBe(false);
  });

  it("rejects a single coincidental shared shot (streetview / board)", () => {
    // 1 shared out of 5+ — below both the floor and the 40% fraction.
    const a = ["s.jpg", "a1.jpg", "a2.jpg", "a3.jpg", "a4.jpg"];
    const b = ["s.jpg", "b1.jpg", "b2.jpg", "b3.jpg", "b4.jpg"];
    expect(contentKeysMatch(a, b)).toBe(false);
  });

  it("matches a small genuine re-list below the absolute floor", () => {
    // 2-photo listing re-posted: floor drops to the set size.
    expect(contentKeysMatch(["1.jpg", "2.jpg"], ["1.jpg", "2.jpg"])).toBe(true);
  });

  it("is false when either side has no photos", () => {
    expect(contentKeysMatch([], ["1.jpg"])).toBe(false);
  });
});

describe("phashesMatch", () => {
  it("matches sets of near-identical hashes (cross-portal recompress)", () => {
    const a = [0x0n, 0x1n, 0x2n, 0x3n];
    // Each within Hamming 2 of its partner.
    const b = [0x0n, 0x5n, 0x6n, 0x7n];
    expect(phashesMatch(a, b, 4)).toBe(true);
  });

  it("rejects sets of unrelated hashes", () => {
    const a = [0x0n, 0x1n, 0x2n];
    const b = [0xffffffffffffffffn, 0xff00ff00ff00ff00n, 0x0f0f0f0f0f0f0f0fn];
    expect(phashesMatch(a, b, 8)).toBe(false);
  });

  it("rejects weak overlap below the fraction floor", () => {
    // 5-photo listing, only 1 image pairs up → 1/5 = 20% < 40%.
    const a = [0x0n, 0x100n, 0x200n, 0x300n, 0x400n];
    const b = [0x0n, 0xfff1n, 0xfff2n, 0xfff3n, 0xfff4n];
    expect(phashesMatch(a, b, 4)).toBe(false);
  });

  it("does not let one target satisfy many sources (greedy claim)", () => {
    // 4 identical sources, only ONE matching target in a larger set → a single
    // pairing, the other 3 find nothing unclaimed → 1/4 < 40%.
    const a = [0x0n, 0x0n, 0x0n, 0x0n];
    const b = [0x0n, 0xff01n, 0xff02n, 0xff03n, 0xff04n];
    expect(phashesMatch(a, b, 4)).toBe(false);
  });
});
