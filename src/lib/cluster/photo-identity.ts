/**
 * Photo-based property identity.
 *
 * Structured listing fields (address, postcode, coords, beds, price) are all
 * building-level or coarser in our data — no unit numbers, outcode-only
 * postcodes, and coordinates that are shared building centroids (a dozen
 * different flats can sit on the exact same lat/lng). So they can BLOCK
 * (narrow the candidate set) and CORROBORATE, but they cannot decide whether
 * two listings are the same physical home.
 *
 * Photos can. The same flat carries the same agent photo set across portals
 * and re-lists; two different flats in one building carry different interiors.
 * This module turns a listing's photos into an identity signal at two tiers:
 *
 *   1. content key  — the portal CDN basename. Zoopla serves images from
 *      `https://lid.zoocdn.com/<w>/<h>/<sha1>.jpg`, where `<sha1>` is a hash
 *      of the image BYTES. Equal basenames ⇒ byte-identical images. This is
 *      FREE (no download) and catches same-portal re-lists and the
 *      same-listing-scraped-by-two-searches duplicate rows exactly.
 *
 *   2. perceptual hash (phash) — a 64-bit dHash of the decoded image, robust
 *      to the resize/recompress a different portal applies when it rehosts.
 *      This is the CROSS-portal signal (content keys never match across
 *      portals because each rehosts under its own CDN). Computed in
 *      `cache-photos` where we already decode every image with `sharp`.
 *
 * Identity = enough overlap on EITHER tier. "Enough" is deliberately a
 * fraction of the SMALLER set plus an absolute floor, so a single shared
 * stock shot (floorplan, "to let" board, streetview) can't bridge two
 * genuinely distinct flats.
 */

/**
 * The stable per-image key: the CDN path basename with any query string
 * stripped. For Zoopla this is the content SHA; for other portals it's at
 * least a within-portal-stable object id. Empty string for an unusable URL
 * (callers skip empties so a missing key never counts as a match).
 */
export function photoContentKey(url: string): string {
  const noQuery = url.split("?")[0] ?? url;
  const base = noQuery.split("/").pop() ?? "";
  return base.trim().toLowerCase();
}

/** Hamming distance between two 64-bit hashes held as bigints. */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    x &= x - 1n; // clear the lowest set bit
    count++;
  }
  return count;
}

export type PhotoOverlapOptions = {
  /** Minimum number of matching images to call it the same home. */
  minShared: number;
  /** Minimum share of the SMALLER photo set that must match (0..1). */
  minFraction: number;
};

const DEFAULT_OVERLAP: PhotoOverlapOptions = {
  minShared: 3,
  minFraction: 0.4,
};

/**
 * Decide "same home" from two sets of content keys (the free, exact tier).
 * Use for SAME-portal comparisons; across portals the keys never collide, so
 * this correctly returns false and the caller falls back to perceptual hashes.
 *
 * A small photo set lowers the absolute floor to its own size so a genuine
 * 2-photo re-list isn't rejected for failing a fixed `minShared`.
 */
export function contentKeysMatch(
  a: Iterable<string>,
  b: Iterable<string>,
  opts: PhotoOverlapOptions = DEFAULT_OVERLAP
): boolean {
  const setA = new Set([...a].filter(Boolean));
  const setB = new Set([...b].filter(Boolean));
  if (setA.size === 0 || setB.size === 0) {
    return false;
  }
  let shared = 0;
  for (const k of setA) {
    if (setB.has(k)) {
      shared++;
    }
  }
  const smaller = Math.min(setA.size, setB.size);
  const need = Math.min(opts.minShared, smaller);
  return shared >= need && shared / smaller >= opts.minFraction;
}

/**
 * Decide "same home" from two sets of perceptual hashes (the cross-portal
 * tier). Two images match when their hashes are within `maxHamming`; the
 * listings match when enough images pair up under the same fraction+floor
 * rule as {@link contentKeysMatch}.
 *
 * Greedy pairing: each hash in the smaller set claims at most one partner in
 * the larger set, so N near-identical thumbnails can't inflate the count.
 */
export function phashesMatch(
  a: bigint[],
  b: bigint[],
  maxHamming = 10,
  opts: PhotoOverlapOptions = DEFAULT_OVERLAP
): boolean {
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  const claimed = new Array(large.length).fill(false);
  let shared = 0;
  for (const h of small) {
    for (let i = 0; i < large.length; i++) {
      if (!claimed[i] && hammingDistance(h, large[i] as bigint) <= maxHamming) {
        claimed[i] = true;
        shared++;
        break;
      }
    }
  }
  const smaller = small.length;
  const need = Math.min(opts.minShared, smaller);
  return shared >= need && shared / smaller >= opts.minFraction;
}
