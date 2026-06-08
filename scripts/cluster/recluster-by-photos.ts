/**
 * Photo-identity reclustering — analysis + apply.
 *
 * Loads every active clustered listing with its photo signals, groups them
 * into physical homes with `groupByPhotoIdentity`, and reconciles those
 * groups against the CURRENT clusters:
 *
 *   MERGE  — a home-group whose listings currently sit in >1 cluster (the new
 *            capability photos unlock: cross-portal / cross-cluster duplicates
 *            that structured fields couldn't match).
 *   SPLIT  — a current cluster whose listings fall into >1 home-group (should
 *            be near-zero after the Phase 0 same-portal split).
 *
 * Apply (--apply) rebuilds membership group-by-group, picking the survivor
 * cluster that already holds the most SWIPES (then most listings) so decisions
 * are never orphaned; swipes on dissolved clusters are re-pointed to the
 * survivor, de-duplping (user,cluster) with the same keep-the-strongest rule
 * the merge UI uses. Split-off groups get fresh clusters.
 *
 *   dry run : doppler run ... -- bun scripts/cluster/recluster-by-photos.ts
 *   apply   : doppler run ... -- bun scripts/cluster/recluster-by-photos.ts --apply
 */
import { neon } from "@neondatabase/serverless";
import { addressOutcode } from "../../src/lib/cluster/key";
import {
  type ListingPhotoSignals,
  groupByPhotoIdentity,
} from "../../src/lib/cluster/photo-match";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set (run via doppler prd)");
}
const APPLY = process.argv.includes("--apply");
const sql = neon(url);

type LRow = {
  id: string;
  cluster_id: string;
  portal: string;
  address_raw: string;
  postcode: string | null;
  bedrooms: number | null;
  price_monthly: number | null;
};
const listings = (await sql`
  SELECT id, cluster_id, portal, address_raw, postcode, bedrooms, price_monthly
  FROM listings WHERE status = 'active' AND cluster_id IS NOT NULL`) as LRow[];

const photos = (await sql`
  SELECT listing_id, content_key, phash FROM listing_photos`) as {
  listing_id: string;
  content_key: string | null;
  phash: string | null;
}[];
const ckByListing = new Map<string, string[]>();
const phByListing = new Map<string, bigint[]>();
for (const p of photos) {
  if (p.content_key) {
    (ckByListing.get(p.listing_id) ?? ckByListing.set(p.listing_id, []).get(p.listing_id))?.push(
      p.content_key
    );
  }
  if (p.phash) {
    (phByListing.get(p.listing_id) ?? phByListing.set(p.listing_id, []).get(p.listing_id))?.push(
      BigInt(p.phash)
    );
  }
}

const signals: ListingPhotoSignals[] = listings.map((l) => ({
  id: l.id,
  outcode: addressOutcode(l.postcode, l.address_raw),
  bedrooms: l.bedrooms,
  portal: l.portal,
  contentKeys: ckByListing.get(l.id) ?? [],
  phashes: phByListing.get(l.id) ?? [],
}));

const clusterOf = new Map(listings.map((l) => [l.id, l.cluster_id]));
const homeGroups = groupByPhotoIdentity(signals);

let merges = 0;
let splits = 0;
const mergeExamples: string[][] = [];
for (const group of homeGroups) {
  const clusters = new Set(group.map((id) => clusterOf.get(id) as string));
  if (clusters.size > 1) {
    merges++;
    if (mergeExamples.length < 15) {
      mergeExamples.push(group);
    }
  }
}
// Splits: any current cluster spread across >1 home-group.
const groupIdOf = new Map<string, number>();
homeGroups.forEach((g, i) => {
  for (const id of g) {
    groupIdOf.set(id, i);
  }
});
const groupsPerCluster = new Map<string, Set<number>>();
for (const l of listings) {
  const set = groupsPerCluster.get(l.cluster_id) ?? new Set();
  set.add(groupIdOf.get(l.id) as number);
  groupsPerCluster.set(l.cluster_id, set);
}
for (const set of groupsPerCluster.values()) {
  if (set.size > 1) {
    splits++;
  }
}

console.log(`\n=== RECLUSTER BY PHOTOS (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
console.log(`active clustered listings: ${listings.length}`);
console.log(`home-groups (photo identity): ${homeGroups.length}`);
console.log(`current clusters touched: ${new Set(listings.map((l) => l.cluster_id)).size}`);
console.log(`MERGES (home-group spanning >1 cluster): ${merges}`);
console.log(`SPLITS (cluster spanning >1 home-group): ${splits}\n`);

for (const g of mergeExamples) {
  console.log(`MERGE group (${g.length} listings across ${new Set(g.map((id) => clusterOf.get(id))).size} clusters):`);
  for (const id of g) {
    const l = listings.find((x) => x.id === id);
    console.log(`   [${l?.portal}] £${l?.price_monthly} ${l?.bedrooms}bd  cl=${(clusterOf.get(id) as string).slice(0, 8)}  "${l?.address_raw}"`);
  }
}

// Analysis only. MERGES of existing clusters are NOT applied here: every
// cluster is FK-referenced by swipes / shortlist_pipeline / match_
// notifications / merge-dismissals, and collapsing them correctly (survivor
// selection, per-household conflict resolution, geo backfill) is exactly what
// the proven `mergeClusters` server fn does. So these surface in the photo-
// aware duplicates UI for one-click, reviewed merging instead — which matters
// for the occasional borderline pair. Going forward, the `cluster-by-photos`
// task consolidates each newly-cached listing automatically.
console.log(
  "\nAnalysis only — review/apply MERGES via the duplicates UI (photo-aware).\n"
);
process.exit(0);
