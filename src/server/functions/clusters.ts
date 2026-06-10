/**
 * Manual cluster de-duplication.
 *
 * Cross-portal clustering matches on exact normalised-address equality, so
 * the same property listed on different portals can land in separate
 * clusters (see `src/lib/cluster/key.ts`). There's no automatic
 * cross-portal merge on the ingest path; instead this exposes:
 *
 *   listDuplicateSuggestions — read-only: candidate duplicate groups in
 *     the household's own clusters, scored by the street-key + outcode +
 *     bedrooms + price-corroboration rule (cross-portal only).
 *   mergeClusters — collapse a group into one survivor cluster, re-pointing
 *     listings + swipes + pipeline + notifications (swipe conflicts resolve
 *     skip-wins) and deleting the absorbed clusters. One atomic db.batch.
 *   dismissDuplicateSuggestion — record a "these are NOT the same home"
 *     verdict for a group; persists the unordered cluster pairs so the
 *     union-find skips those edges and the suggestion stops coming back.
 *
 * All three are household-scoped: you can only see/merge/dismiss clusters
 * that have at least one listing belonging to one of your household's
 * searches.
 */
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  clusterMergeDismissals,
  listingPhotos,
  listings,
  matchNotifications,
  propertyClusters,
  searches,
  shortlistPipeline,
  swipes,
} from "../../../db/schema";
import {
  type Coord,
  listingCoord,
} from "../../lib/cluster/coords";
import { addressOutcode } from "../../lib/cluster/key";
import {
  type SwipeOutcome,
  pipelineIncomingWins,
  resolveSwipeOutcome,
} from "../../lib/cluster/merge";
import {
  type ListingPhotoSignals,
  sameHome,
} from "../../lib/cluster/photo-match";
import { requireHouseholdScope } from "./shortlist-helpers.server";
import { tasks } from "./trigger.server";

type Db = ReturnType<typeof getDb>;

/** A listing row narrowed to what clustering decisions need. */
type CandidateRow = {
  id: string;
  clusterId: string;
  portal: string;
  addressRaw: string;
  postcode: string | null;
  bedrooms: number | null;
  priceMonthly: number | null;
  title: string;
  status: (typeof listings.$inferSelect)["status"];
  // Coordinate, column-or-rawJson, extracted in SQL (see the select).
  lat: string | null;
  lng: string | null;
};

/**
 * A cluster reduced to the photo signals of its ACTIVE listings — that's all
 * a duplicate decision needs now. Identity is photos (see `photo-match`), so
 * two clusters are duplicates when any listing of one is the same home as any
 * listing of the other; street name / price never decide.
 */
type ClusterAgg = {
  id: string;
  signals: ListingPhotoSignals[];
};

/** Average of a cluster's listing coordinates, or null if it has none. */
function centroid(coords: Coord[]): Coord | null {
  if (coords.length === 0) {
    return null;
  }
  const sum = coords.reduce(
    (acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
}

function aggregate(
  rows: CandidateRow[],
  photoSignals: Map<string, { contentKeys: string[]; phashes: bigint[] }>
): Map<string, ClusterAgg> {
  const aggs = new Map<string, ClusterAgg>();
  for (const r of rows) {
    if (r.status !== "active") {
      continue; // only active listings decide a merge suggestion
    }
    let a = aggs.get(r.clusterId);
    if (!a) {
      a = { id: r.clusterId, signals: [] };
      aggs.set(r.clusterId, a);
    }
    const ph = photoSignals.get(r.id);
    a.signals.push({
      id: r.id,
      outcode: addressOutcode(r.postcode, r.addressRaw),
      bedrooms: r.bedrooms,
      portal: r.portal,
      contentKeys: ph?.contentKeys ?? [],
      phashes: ph?.phashes ?? [],
    });
  }
  return aggs;
}

// Two clusters are duplicates when any listing of one is the SAME physical
// home as any listing of the other — decided by photos (content-key or
// perceptual-hash overlap), blocked by outcode + bedrooms. Street name and
// price never enter: they identify a road, not a home.
function clustersAreDuplicates(a: ClusterAgg, b: ClusterAgg): boolean {
  return a.signals.some((sa) => b.signals.some((sb) => sameHome(sa, sb)));
}

/** Canonical key for an unordered cluster pair (lo|hi, lexicographic). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Union-find the household's clusters into proposed duplicate groups.
 * `dismissed` holds pair keys a human has flagged as "not a duplicate" —
 * those edges are skipped, so a dismissed pair never re-groups (and in a
 * 3+ group, dismissing one edge cleanly splits the rest).
 */
function groupDuplicates(
  aggs: Map<string, ClusterAgg>,
  dismissed: Set<string>
): string[][] {
  const list = [...aggs.values()];
  const parent = new Map(list.map((a) => [a.id, a.id]));
  const find = (x: string): string => {
    const p = parent.get(x);
    if (p === x || p === undefined) {
      return x;
    }
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (
        a &&
        b &&
        !dismissed.has(pairKey(a.id, b.id)) &&
        clustersAreDuplicates(a, b)
      ) {
        parent.set(find(a.id), find(b.id));
      }
    }
  }
  const comps = new Map<string, string[]>();
  for (const a of list) {
    const root = find(a.id);
    const arr = comps.get(root) ?? [];
    arr.push(a.id);
    comps.set(root, arr);
  }
  return [...comps.values()].filter((c) => c.length > 1);
}

/** Load every clustered listing reachable from the household's searches. */
async function loadHouseholdClusterRows(
  db: Db,
  householdId: string
): Promise<CandidateRow[]> {
  return db
    .select({
      id: listings.id,
      clusterId: listings.clusterId,
      portal: listings.portal,
      addressRaw: listings.addressRaw,
      postcode: listings.postcode,
      bedrooms: listings.bedrooms,
      priceMonthly: listings.priceMonthly,
      title: listings.title,
      status: listings.status,
      // Coordinate, column first then the rawJson blob (~35% of columns
      // are populated; rawJson.lat/lng is reliable across all portals).
      lat: sql<string | null>`coalesce(${listings.lat}::text, ${listings.rawJson}->>'lat')`,
      lng: sql<string | null>`coalesce(${listings.lng}::text, ${listings.rawJson}->>'lng')`,
    })
    .from(listings)
    .innerJoin(searches, eq(listings.searchId, searches.id))
    .where(eq(searches.householdId, householdId))
    .then((rows) =>
      rows.filter((r): r is CandidateRow => r.clusterId != null)
    );
}

/**
 * Photo identity signals (content keys + perceptual hashes) for every listing
 * reachable from the household's searches, keyed by listing id. This is what
 * makes a merge suggestion: see `clustersAreDuplicates`.
 */
async function loadHouseholdPhotoSignals(
  db: Db,
  householdId: string
): Promise<Map<string, { contentKeys: string[]; phashes: bigint[] }>> {
  const rows = await db
    .select({
      listingId: listingPhotos.listingId,
      contentKey: listingPhotos.contentKey,
      phash: listingPhotos.phash,
    })
    .from(listingPhotos)
    .innerJoin(listings, eq(listingPhotos.listingId, listings.id))
    .innerJoin(searches, eq(listings.searchId, searches.id))
    .where(eq(searches.householdId, householdId));
  const out = new Map<string, { contentKeys: string[]; phashes: bigint[] }>();
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

/** The household's dismissed pairs, as canonical `lo|hi` pair keys. */
async function loadDismissedPairs(
  db: Db,
  householdId: string
): Promise<Set<string>> {
  const rows = await db
    .select({
      lo: clusterMergeDismissals.clusterIdLo,
      hi: clusterMergeDismissals.clusterIdHi,
    })
    .from(clusterMergeDismissals)
    .where(eq(clusterMergeDismissals.householdId, householdId));
  return new Set(rows.map((r) => pairKey(r.lo, r.hi)));
}

export type DuplicateClusterSummary = {
  clusterId: string;
  headlineTitle: string;
  headlineAddress: string;
  priceMonthly: number | null;
  bedrooms: number | null;
  portals: string[];
  listingCount: number;
  /** Centroid of the cluster's listing coordinates, for distance display. */
  lat: number | null;
  lng: number | null;
};

export type DuplicateGroup = {
  suggestedSurvivorId: string;
  clusters: DuplicateClusterSummary[];
};

function summarise(
  clusterId: string,
  rows: CandidateRow[]
): DuplicateClusterSummary {
  const mine = rows.filter((r) => r.clusterId === clusterId);
  const cheapest = [...mine].sort((a, b) => {
    if (a.priceMonthly == null) {
      return 1;
    }
    if (b.priceMonthly == null) {
      return -1;
    }
    return a.priceMonthly - b.priceMonthly;
  })[0];
  const coords = mine
    .map((r) => listingCoord({ lat: r.lat, lng: r.lng }))
    .filter((c): c is Coord => c != null);
  const c = centroid(coords);
  return {
    clusterId,
    headlineTitle: cheapest?.title ?? "",
    headlineAddress: cheapest?.addressRaw ?? "",
    priceMonthly: cheapest?.priceMonthly ?? null,
    bedrooms: cheapest?.bedrooms ?? null,
    portals: [...new Set(mine.map((r) => r.portal))].sort(),
    listingCount: mine.length,
    lat: c?.lat ?? null,
    lng: c?.lng ?? null,
  };
}

export const listDuplicateSuggestions = createServerFn({ method: "GET" })
  .handler(async (): Promise<DuplicateGroup[]> => {
    const { householdId } = await requireHouseholdScope();
    const db = getDb();
    const [rows, photoSignals, dismissed] = await Promise.all([
      loadHouseholdClusterRows(db, householdId),
      loadHouseholdPhotoSignals(db, householdId),
      loadDismissedPairs(db, householdId),
    ]);
    const groups = groupDuplicates(aggregate(rows, photoSignals), dismissed);
    return groups.map((ids) => {
      const summaries = ids.map((id) => summarise(id, rows));
      // Suggest the cluster with the most listings as the survivor.
      const survivor = summaries.reduce((best, s) =>
        s.listingCount > best.listingCount ||
        (s.listingCount === best.listingCount &&
          s.clusterId.localeCompare(best.clusterId) < 0)
          ? s
          : best
      );
      return { suggestedSurvivorId: survivor.clusterId, clusters: summaries };
    });
  });

/**
 * Guard: every `clusterIds` entry must have at least one listing belonging
 * to one of this household's searches. Throws `cluster_not_in_household`
 * otherwise. Shared by merge + dismiss so neither can touch a stranger's
 * clusters by guessing IDs.
 */
async function assertClustersInHousehold(
  db: Db,
  householdId: string,
  clusterIds: string[]
): Promise<void> {
  const hhSearches = await db
    .select({ id: searches.id })
    .from(searches)
    .where(eq(searches.householdId, householdId));
  const hhSearchIds = new Set(hhSearches.map((s) => s.id));
  const involvedListings = await db
    .select({ clusterId: listings.clusterId, searchId: listings.searchId })
    .from(listings)
    .where(inArray(listings.clusterId, clusterIds));
  for (const id of clusterIds) {
    const ok = involvedListings.some(
      (l) =>
        l.clusterId === id && l.searchId != null && hhSearchIds.has(l.searchId)
    );
    if (!ok) {
      throw new Error("cluster_not_in_household");
    }
  }
}

const dismissSchema = z.object({
  clusterIds: z.array(z.string().trim().min(1)).min(2),
});

/**
 * Mark a suggested duplicate group as "not the same home". Persists every
 * unordered pair among `clusterIds` so the union-find in
 * `listDuplicateSuggestions` skips those edges forever — the group stops
 * being suggested. Idempotent (onConflictDoNothing on the pair).
 */
export const dismissDuplicateSuggestion = createServerFn({ method: "POST" })
  .inputValidator(dismissSchema)
  .handler(async ({ data }): Promise<{ ok: true; dismissed: number }> => {
    const { householdId, currentUserId } = await requireHouseholdScope();
    const db = getDb();
    const ids = [...new Set(data.clusterIds)];
    if (ids.length < 2) {
      return { ok: true, dismissed: 0 };
    }
    await assertClustersInHousehold(db, householdId, ids);

    const rows: (typeof clusterMergeDismissals.$inferInsert)[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        if (!(a && b)) {
          continue;
        }
        const [lo, hi] = a < b ? [a, b] : [b, a];
        rows.push({
          id: nanoid(),
          householdId,
          clusterIdLo: lo,
          clusterIdHi: hi,
          dismissedByUserId: currentUserId,
        });
      }
    }
    await db
      .insert(clusterMergeDismissals)
      .values(rows)
      .onConflictDoNothing({
        target: [
          clusterMergeDismissals.householdId,
          clusterMergeDismissals.clusterIdLo,
          clusterMergeDismissals.clusterIdHi,
        ],
      });
    return { ok: true, dismissed: rows.length };
  });

const mergeSchema = z.object({
  survivorClusterId: z.string().trim().min(1),
  absorbedClusterIds: z.array(z.string().trim().min(1)).min(1),
});

export const mergeClusters = createServerFn({ method: "POST" })
  .inputValidator(mergeSchema)
  .handler(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: three sequential, independent conflict-resolution passes (swipes, pipeline, notifications) that read clearly top-to-bottom
    async ({ data }): Promise<{ ok: true; merged: number }> => {
      const { householdId } = await requireHouseholdScope();
      const db = getDb();
      const { survivorClusterId } = data;
      const absorbed = data.absorbedClusterIds.filter(
        (id) => id !== survivorClusterId
      );
      if (absorbed.length === 0) {
        return { ok: true, merged: 0 };
      }
      const involved = [survivorClusterId, ...absorbed];

      // Authorisation: every involved cluster must have at least one
      // listing belonging to one of THIS household's searches.
      await assertClustersInHousehold(db, householdId, involved);

      const absorbedSet = new Set(absorbed);
      const [sw, pp, nt, clusterRows] = await db.batch([
        db.select().from(swipes).where(inArray(swipes.clusterId, involved)),
        db
          .select()
          .from(shortlistPipeline)
          .where(inArray(shortlistPipeline.clusterId, involved)),
        db
          .select()
          .from(matchNotifications)
          .where(inArray(matchNotifications.clusterId, involved)),
        db
          .select()
          .from(propertyClusters)
          .where(inArray(propertyClusters.id, involved)),
      ]);

      // biome-ignore lint/suspicious/noExplicitAny: heterogeneous drizzle query builders
      const ops: any[] = [];

      // --- swipes: re-point absorbed → survivor; (user,search) conflicts
      //     resolve skip-wins, dropping the redundant row. ---
      const claimedSwipe = new Map<string, { id: string; outcome: SwipeOutcome }>();
      for (const s of sw) {
        if (s.clusterId === survivorClusterId) {
          claimedSwipe.set(`${s.userId}|${s.searchId}`, {
            id: s.id,
            outcome: s.outcome,
          });
        }
      }
      for (const s of sw) {
        if (!absorbedSet.has(s.clusterId)) {
          continue;
        }
        const key = `${s.userId}|${s.searchId}`;
        const held = claimedSwipe.get(key);
        if (held) {
          const winner = resolveSwipeOutcome(held.outcome, s.outcome);
          if (winner !== held.outcome) {
            ops.push(
              db.update(swipes).set({ outcome: winner }).where(eq(swipes.id, held.id))
            );
            held.outcome = winner;
          }
          ops.push(db.delete(swipes).where(eq(swipes.id, s.id)));
        } else {
          ops.push(
            db
              .update(swipes)
              .set({ clusterId: survivorClusterId })
              .where(eq(swipes.id, s.id))
          );
          claimedSwipe.set(key, { id: s.id, outcome: s.outcome });
        }
      }

      // --- shortlist_pipeline: one row per (household,cluster); conflict
      //     keeps the most-recently-moved row. ---
      const claimedPipe = new Map<string, { id: string; lastMovedAt: Date }>();
      for (const p of pp) {
        if (p.clusterId === survivorClusterId) {
          claimedPipe.set(p.householdId, { id: p.id, lastMovedAt: p.lastMovedAt });
        }
      }
      for (const p of pp) {
        if (!absorbedSet.has(p.clusterId)) {
          continue;
        }
        const held = claimedPipe.get(p.householdId);
        if (!held) {
          ops.push(
            db
              .update(shortlistPipeline)
              .set({ clusterId: survivorClusterId })
              .where(eq(shortlistPipeline.id, p.id))
          );
          claimedPipe.set(p.householdId, { id: p.id, lastMovedAt: p.lastMovedAt });
        } else if (pipelineIncomingWins(held.lastMovedAt, p.lastMovedAt)) {
          ops.push(db.delete(shortlistPipeline).where(eq(shortlistPipeline.id, held.id)));
          ops.push(
            db
              .update(shortlistPipeline)
              .set({ clusterId: survivorClusterId })
              .where(eq(shortlistPipeline.id, p.id))
          );
          claimedPipe.set(p.householdId, { id: p.id, lastMovedAt: p.lastMovedAt });
        } else {
          ops.push(db.delete(shortlistPipeline).where(eq(shortlistPipeline.id, p.id)));
        }
      }

      // --- match_notifications: one row per (household,cluster); on
      //     conflict the survivor's "already emailed" wins, drop the dup. ---
      const claimedNotif = new Set<string>();
      for (const n of nt) {
        if (n.clusterId === survivorClusterId) {
          claimedNotif.add(n.householdId);
        }
      }
      for (const n of nt) {
        if (!absorbedSet.has(n.clusterId)) {
          continue;
        }
        if (claimedNotif.has(n.householdId)) {
          ops.push(db.delete(matchNotifications).where(eq(matchNotifications.id, n.id)));
        } else {
          ops.push(
            db
              .update(matchNotifications)
              .set({ clusterId: survivorClusterId })
              .where(eq(matchNotifications.id, n.id))
          );
          claimedNotif.add(n.householdId);
        }
      }

      // --- survivor row backfill: the absorbed cluster ROWS are about to be
      //     deleted, taking their postcode/coords/manual-address-pin/council-
      //     tax authority with them. The survivor keeps its OWN values, but
      //     where it's NULL we fold in the first absorbed cluster that has
      //     one — so merging the cluster that happened to carry the real
      //     coords into an empty survivor doesn't strand that geo data. ---
      const survivorRow = clusterRows.find((c) => c.id === survivorClusterId);
      const absorbedRows = clusterRows.filter((c) => absorbedSet.has(c.id));
      const patch: Partial<typeof propertyClusters.$inferInsert> = {};
      let geoFilled = false;
      if (survivorRow) {
        for (const f of ["postcode", "lat", "lng", "userAddress"] as const) {
          if (survivorRow[f] == null) {
            const donor = absorbedRows.find((a) => a[f] != null);
            if (donor) {
              patch[f] = donor[f];
              if (f !== "userAddress") {
                geoFilled = true;
              }
            }
          }
        }
        // Authority code + name must come from the SAME donor so the name
        // still matches the code.
        if (survivorRow.councilTaxAuthorityCode == null) {
          const donor = absorbedRows.find(
            (a) => a.councilTaxAuthorityCode != null
          );
          if (donor) {
            patch.councilTaxAuthorityCode = donor.councilTaxAuthorityCode;
            patch.councilTaxAuthorityName = donor.councilTaxAuthorityName;
          }
        }
      }
      if (Object.keys(patch).length > 0) {
        ops.push(
          db
            .update(propertyClusters)
            .set(patch)
            .where(eq(propertyClusters.id, survivorClusterId))
        );
      }

      // --- listings (all statuses) then drop the emptied clusters. These
      //     run LAST so the RESTRICT FKs on swipes/pipeline are clear. ---
      ops.push(
        db
          .update(listings)
          .set({ clusterId: survivorClusterId })
          .where(inArray(listings.clusterId, absorbed))
      );
      ops.push(
        db.delete(propertyClusters).where(inArray(propertyClusters.id, absorbed))
      );

      await db.batch(ops as [(typeof ops)[number], ...(typeof ops)[number][]]);

      // If we just gave the survivor its first postcode/coords but it still
      // has no council-tax authority, re-resolve it. Best-effort: the merge
      // has already committed, so a trigger hiccup must not fail the call.
      const survivorHasAuthority =
        survivorRow?.councilTaxAuthorityCode != null ||
        patch.councilTaxAuthorityCode != null;
      if (geoFilled && !survivorHasAuthority) {
        try {
          await tasks.trigger("enrich-council-tax", {
            clusterId: survivorClusterId,
          });
        } catch {
          // Non-fatal: the next scheduled enrichment sweep will pick it up.
        }
      }

      return { ok: true, merged: absorbed.length };
    }
  );
