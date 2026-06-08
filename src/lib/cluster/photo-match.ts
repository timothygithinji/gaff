/**
 * Group listings into physical homes by photo identity.
 *
 * This is the engine the recluster pass and the live `cluster-by-photos`
 * consolidation both run. It takes listings already carrying their photo
 * signals and returns connected components, where two listings are linked
 * when they're the SAME home. The decision is photos-first, exactly the
 * model the data forces (every structured field here is building-level):
 *
 *   - BLOCK    candidates by outcode + bedrooms — a cheap gate so we never
 *              compare across neighbourhoods or bedroom counts. Never decides.
 *   - IDENTIFY by photos: same-portal content-key overlap OR cross-portal
 *              perceptual-hash overlap (see photo-identity). This decides.
 *   - Listings with no usable photos can't be matched, so they stay as their
 *              own singleton home rather than being merged on block alone.
 *
 * Pure and sharp-free (hashes arrive pre-computed as bigints) so it unit-tests
 * against fixtures and runs identically offline (recluster) and online (task).
 */
import {
  type PhotoOverlapOptions,
  contentKeysMatch,
  phashesMatch,
} from "./photo-identity";

export type ListingPhotoSignals = {
  id: string;
  /** Blocking key — postal outcode, lowercased (see addressOutcode). */
  outcode: string;
  /** Blocking key — bedroom count, or null when the portal didn't say. */
  bedrooms: number | null;
  /** Portal slug; same-portal pairs use content keys, cross-portal use phash. */
  portal: string;
  /** Photo CDN content keys (basenames) for this listing. */
  contentKeys: string[];
  /** Photo perceptual hashes for this listing, as bigints. */
  phashes: bigint[];
};

export type PhotoMatchOptions = {
  maxHamming?: number;
  overlap?: PhotoOverlapOptions;
};

/** Two listings may be compared at all only if they share a block. */
function sameBlock(a: ListingPhotoSignals, b: ListingPhotoSignals): boolean {
  if (a.outcode !== b.outcode || a.outcode === "") {
    return false;
  }
  // Bedrooms must agree when both are known; a null (portal silent) doesn't
  // veto — photos still have to clinch it.
  if (a.bedrooms != null && b.bedrooms != null && a.bedrooms !== b.bedrooms) {
    return false;
  }
  return true;
}

/** Same physical home? Block first, then let photos decide. */
export function sameHome(
  a: ListingPhotoSignals,
  b: ListingPhotoSignals,
  opts: PhotoMatchOptions = {}
): boolean {
  if (!sameBlock(a, b)) {
    return false;
  }
  if (a.portal === b.portal && contentKeysMatch(a.contentKeys, b.contentKeys, opts.overlap)) {
    return true;
  }
  return phashesMatch(a.phashes, b.phashes, opts.maxHamming ?? 10, opts.overlap);
}

/**
 * Tally, per cluster, how many of `others` are the same home as `me`. Used by
 * the live consolidation task to pick the cluster a freshly-cached listing
 * most belongs to (the one with the most photo-matches). Empty map ⇒ matches
 * nothing.
 */
export function clusterMatchVotes(
  me: ListingPhotoSignals,
  others: Array<ListingPhotoSignals & { clusterId: string }>,
  opts: PhotoMatchOptions = {}
): Map<string, number> {
  const votes = new Map<string, number>();
  for (const other of others) {
    if (other.id !== me.id && sameHome(me, other, opts)) {
      votes.set(other.clusterId, (votes.get(other.clusterId) ?? 0) + 1);
    }
  }
  return votes;
}

/**
 * Union-find the listings into same-home components. Returns arrays of
 * listing ids; every input id appears in exactly one group (a listing that
 * matches nothing is its own singleton group).
 */
export function groupByPhotoIdentity(
  listings: ListingPhotoSignals[],
  opts: PhotoMatchOptions = {}
): string[][] {
  const parent = listings.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) {
      r = parent[r] as number;
    }
    let c = x;
    while (parent[c] !== r) {
      const next = parent[c] as number;
      parent[c] = r;
      c = next;
    }
    return r;
  };
  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      const a = listings[i];
      const b = listings[j];
      if (a && b && find(i) !== find(j) && sameHome(a, b, opts)) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, string[]>();
  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    if (!l) {
      continue;
    }
    const root = find(i);
    let g = groups.get(root);
    if (!g) {
      g = [];
      groups.set(root, g);
    }
    g.push(l.id);
  }
  return [...groups.values()];
}
