/**
 * Consolidate one listing into the right cluster by photo identity.
 *
 * Runs after `cache-photos` has populated a listing's `content_key`/`phash`,
 * i.e. once we finally have the evidence that distinguishes one home from
 * another (structured fields can't — see `photo-match`). It corrects the
 * provisional, address-based cluster `findOrCreateCluster` assigned at scrape
 * time, in BOTH directions, but only ever MOVES THIS ONE listing:
 *
 *   - MERGE  — the listing photo-matches listings in a different cluster
 *              (cross-portal duplicate, or a re-list whose address differs):
 *              move it into that cluster.
 *   - SPLIT  — the listing does NOT photo-match its current cluster-mates
 *              (different flats that collided on a street-only address): move
 *              it out to the cluster it does match, or to a fresh one.
 *
 * Moving a single freshly-cached listing never touches swipes (it has none
 * yet) and never dissolves a cluster that holds decisions — the listing's old
 * cluster is deleted only when it's left genuinely empty (no listings, swipes,
 * pipeline rows or notifications). Bulk reconciliation of historical clusters
 * is the duplicates UI's job (proven `mergeClusters`); this keeps the live
 * pipeline self-correcting going forward.
 */
import { logger, task } from "@trigger.dev/sdk";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { addressOutcode } from "../lib/cluster/key";
import {
  type ListingPhotoSignals,
  clusterMatchVotes,
} from "../lib/cluster/photo-match";
import { enrichQueue } from "./queues";

export type ClusterByPhotosPayload = { listingId: string };
export type ClusterByPhotosOutput = {
  listingId: string;
  action: "noop" | "moved-existing" | "moved-new";
  fromCluster: string | null;
  toCluster: string | null;
};

type Signals = ListingPhotoSignals & { clusterId: string };

/** Load photo content keys + phashes for a set of listing ids. */
async function loadSignals(
  db: ReturnType<typeof getDb>,
  listingIds: string[]
): Promise<Map<string, { contentKeys: string[]; phashes: bigint[] }>> {
  const out = new Map<string, { contentKeys: string[]; phashes: bigint[] }>();
  if (listingIds.length === 0) {
    return out;
  }
  const rows = await db
    .select({
      listingId: schema.listingPhotos.listingId,
      contentKey: schema.listingPhotos.contentKey,
      phash: schema.listingPhotos.phash,
    })
    .from(schema.listingPhotos)
    .where(inArray(schema.listingPhotos.listingId, listingIds));
  for (const r of rows) {
    let e = out.get(r.listingId);
    if (!e) {
      e = { contentKeys: [], phashes: [] };
      out.set(r.listingId, e);
    }
    if (r.contentKey) {
      e.contentKeys.push(r.contentKey);
    }
    if (r.phash) {
      e.phashes.push(BigInt(r.phash));
    }
  }
  return out;
}

export const clusterByPhotosTask = task({
  id: "cluster-by-photos",
  queue: enrichQueue,
  maxDuration: 120,

  run: async (
    payload: ClusterByPhotosPayload
  ): Promise<ClusterByPhotosOutput> => {
    const db = getDb();
    const { listingId } = payload;

    const listing = await db.query.listings.findFirst({
      where: (l, { eq: eqOp }) => eqOp(l.id, listingId),
    });
    if (!listing?.clusterId) {
      return { listingId, action: "noop", fromCluster: null, toCluster: null };
    }
    const outcode = addressOutcode(listing.postcode, listing.addressRaw);
    const self = await loadSignals(db, [listingId]);
    const selfSig = self.get(listingId);
    if (!selfSig || (selfSig.contentKeys.length === 0 && selfSig.phashes.length === 0)) {
      // No photo evidence yet — leave the provisional cluster alone.
      return {
        listingId,
        action: "noop",
        fromCluster: listing.clusterId,
        toCluster: listing.clusterId,
      };
    }
    const me: ListingPhotoSignals = {
      id: listingId,
      outcode,
      bedrooms: listing.bedrooms,
      portal: listing.portal,
      contentKeys: selfSig.contentKeys,
      phashes: selfSig.phashes,
    };

    // Candidates: active listings in the same outcode, compatible bedrooms,
    // excluding self. Bedrooms compared loosely (NULL on either side passes;
    // sameHome enforces the rest).
    const candidateRows = await db
      .select({
        id: schema.listings.id,
        clusterId: schema.listings.clusterId,
        portal: schema.listings.portal,
        postcode: schema.listings.postcode,
        addressRaw: schema.listings.addressRaw,
        bedrooms: schema.listings.bedrooms,
      })
      .from(schema.listings)
      .where(
        and(
          eq(schema.listings.status, "active"),
          ne(schema.listings.id, listingId)
        )
      );
    const candidates = candidateRows.filter(
      (c) =>
        c.clusterId != null &&
        addressOutcode(c.postcode, c.addressRaw) === outcode &&
        (c.bedrooms == null || me.bedrooms == null || c.bedrooms === me.bedrooms)
    );
    const candSig = await loadSignals(
      db,
      candidates.map((c) => c.id)
    );

    // Which clusters does this listing actually photo-match?
    const others: Signals[] = candidates.flatMap((c) => {
      const s = candSig.get(c.id);
      return s
        ? [
            {
              id: c.id,
              clusterId: c.clusterId as string,
              outcode,
              bedrooms: c.bedrooms,
              portal: c.portal,
              contentKeys: s.contentKeys,
              phashes: s.phashes,
            },
          ]
        : [];
    });
    const matchVotes = clusterMatchVotes(me, others);

    // Target cluster: the one with the most photo-matches. If none match and
    // the listing currently shares a cluster with non-matching listings, it
    // should split off to its own. If nothing needs to change, no-op.
    const currentClusterMates = candidates.filter(
      (c) => c.clusterId === listing.clusterId
    );
    const matchesCurrent = (matchVotes.get(listing.clusterId) ?? 0) > 0;

    let target: string | null = null;
    let action: ClusterByPhotosOutput["action"] = "noop";
    if (matchVotes.size > 0) {
      const best = [...matchVotes.entries()].sort((a, b) => b[1] - a[1])[0];
      target = best?.[0] ?? null;
    }

    if (target && target !== listing.clusterId) {
      action = "moved-existing";
    } else if (
      !matchesCurrent &&
      currentClusterMates.length > 0 &&
      matchVotes.size === 0
    ) {
      // Doesn't belong with its current mates and matches nothing else → its
      // own home. Mint a fresh cluster carrying this listing's own geo.
      const newId = nanoid();
      await db.insert(schema.propertyClusters).values({
        id: newId,
        normalisedAddress: `${listing.addressRaw.toLowerCase()}#${newId.slice(0, 8)}`,
        postcode: listing.postcode,
        lat: listing.lat,
        lng: listing.lng,
      });
      target = newId;
      action = "moved-new";
    }

    if (action === "noop" || !target) {
      return {
        listingId,
        action: "noop",
        fromCluster: listing.clusterId,
        toCluster: listing.clusterId,
      };
    }

    const fromCluster = listing.clusterId;
    await db
      .update(schema.listings)
      .set({ clusterId: target })
      .where(eq(schema.listings.id, listingId));

    // Delete the old cluster only if it's now genuinely empty of everything
    // that matters — never strand a decision.
    await db.execute(sql`
      DELETE FROM property_clusters pc
      WHERE pc.id = ${fromCluster}
        AND NOT EXISTS (SELECT 1 FROM listings WHERE cluster_id = pc.id)
        AND NOT EXISTS (SELECT 1 FROM swipes WHERE cluster_id = pc.id)
        AND NOT EXISTS (SELECT 1 FROM shortlist_pipeline WHERE cluster_id = pc.id)
        AND NOT EXISTS (SELECT 1 FROM match_notifications WHERE cluster_id = pc.id)
    `);

    logger.log("cluster-by-photos: moved", {
      listingId,
      action,
      fromCluster,
      toCluster: target,
    });
    return { listingId, action, fromCluster, toCluster: target };
  },
});
