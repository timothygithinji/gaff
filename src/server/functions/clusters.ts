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
 *
 * Both are household-scoped: you can only see/merge clusters that have at
 * least one listing belonging to one of your household's searches.
 */
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  listings,
  matchNotifications,
  propertyClusters,
  searches,
  shortlistPipeline,
  swipes,
} from "../../../db/schema";
import {
  type Coord,
  coordsCorroborate,
  listingCoord,
} from "../../lib/cluster/coords";
import {
  addressOutcode,
  isDegenerateStreetKey,
  priceCorroborates,
  streetKey,
} from "../../lib/cluster/key";
import {
  type SwipeOutcome,
  pipelineIncomingWins,
  resolveSwipeOutcome,
} from "../../lib/cluster/merge";
import { requireHouseholdScope } from "./shortlist-helpers.server";

type Db = ReturnType<typeof getDb>;

/** A listing row narrowed to what clustering decisions need. */
type CandidateRow = {
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

type ClusterAgg = {
  id: string;
  outcodes: Set<string>;
  bedrooms: Set<number>;
  keys: Set<string>;
  prices: number[];
  portals: Set<string>;
  coords: Coord[];
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

function aggregate(rows: CandidateRow[]): Map<string, ClusterAgg> {
  const aggs = new Map<string, ClusterAgg>();
  for (const r of rows) {
    if (r.status !== "active") {
      continue; // only active listings decide a merge suggestion
    }
    let a = aggs.get(r.clusterId);
    if (!a) {
      a = {
        id: r.clusterId,
        outcodes: new Set(),
        bedrooms: new Set(),
        keys: new Set(),
        prices: [],
        portals: new Set(),
        coords: [],
      };
      aggs.set(r.clusterId, a);
    }
    a.outcodes.add(addressOutcode(r.postcode, r.addressRaw));
    if (r.bedrooms != null) {
      a.bedrooms.add(r.bedrooms);
    }
    a.keys.add(streetKey(r.addressRaw));
    if (r.priceMonthly != null) {
      a.prices.push(r.priceMonthly);
    }
    a.portals.add(r.portal);
    const coord = listingCoord({ lat: r.lat, lng: r.lng });
    if (coord) {
      a.coords.push(coord);
    }
  }
  return aggs;
}

const intersects = (a: Set<unknown>, b: Set<unknown>) =>
  [...a].some((x) => b.has(x));

function clustersAreDuplicates(a: ClusterAgg, b: ClusterAgg): boolean {
  if (!intersects(a.outcodes, b.outcodes) || !intersects(a.bedrooms, b.bedrooms)) {
    return false;
  }
  const sharesKey = [...a.keys]
    .filter((k) => !isDegenerateStreetKey(k))
    .some((k) => b.keys.has(k));
  if (!sharesKey) {
    return false;
  }
  // Cross-portal only — never collapse two distinct same-portal listings.
  const samePortalOnly =
    a.portals.size === 1 &&
    b.portals.size === 1 &&
    [...a.portals][0] === [...b.portals][0];
  if (samePortalOnly) {
    return false;
  }
  // Strong evidence required beyond a shared street: either the rents
  // corroborate, OR the locations sit within ~30m. Street name alone is
  // never enough — two homes on the same road are different homes.
  const priceMatch = a.prices.some((p) =>
    b.prices.some((q) => priceCorroborates(p, q))
  );
  const coordMatch = coordsCorroborate(centroid(a.coords), centroid(b.coords), 30);
  return priceMatch || coordMatch;
}

/** Union-find the household's clusters into proposed duplicate groups. */
function groupDuplicates(aggs: Map<string, ClusterAgg>): string[][] {
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
      if (a && b && clustersAreDuplicates(a, b)) {
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
    const rows = await loadHouseholdClusterRows(db, householdId);
    const groups = groupDuplicates(aggregate(rows));
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
      const hhSearches = await db
        .select({ id: searches.id })
        .from(searches)
        .where(eq(searches.householdId, householdId));
      const hhSearchIds = new Set(hhSearches.map((s) => s.id));
      const involvedListings = await db
        .select({ clusterId: listings.clusterId, searchId: listings.searchId })
        .from(listings)
        .where(inArray(listings.clusterId, involved));
      for (const id of involved) {
        const ok = involvedListings.some(
          (l) => l.clusterId === id && hhSearchIds.has(l.searchId)
        );
        if (!ok) {
          throw new Error("cluster_not_in_household");
        }
      }

      const absorbedSet = new Set(absorbed);
      const [sw, pp, nt] = await Promise.all([
        db.select().from(swipes).where(inArray(swipes.clusterId, involved)),
        db
          .select()
          .from(shortlistPipeline)
          .where(inArray(shortlistPipeline.clusterId, involved)),
        db
          .select()
          .from(matchNotifications)
          .where(inArray(matchNotifications.clusterId, involved)),
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
      return { ok: true, merged: absorbed.length };
    }
  );
