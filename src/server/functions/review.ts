/**
 * Review screen server functions.
 *
 * Powers the primary "swipe" verb. Three operations:
 *
 *   getNextReviewCard — the highest-priority cluster the current user
 *     hasn't yet swiped, scoped to their household's active searches.
 *     Returns `null` when the queue is empty.
 *   recordSwipe      — INSERT-or-UPDATE a swipe row (so undo + re-swipe
 *     works cleanly).
 *   undoLastSwipe    — delete the user's most recent swipe row.
 *
 * Ranking rules (intentionally simple for v1 — PR 8 / v1.1 can layer
 * AI-rule scoring on top):
 *
 *   1. The cluster must have at least one listing belonging to a search
 *      this household actively scrapes.
 *   2. The CURRENT user must not have swiped this cluster (any outcome).
 *   3. NO household member may have swiped 'skip' on it
 *      ("asymmetric-hides-from-disappointed-voter" — a single member
 *      vetoing a place hides it from the rest of the household so we
 *      never re-show a card someone already nope'd).
 *   4. Order by listings.first_seen_at DESC (newest first) then
 *      price_monthly ASC (cheaper wins the tiebreak).
 *
 * The cluster's `listings` set spans multiple portals — the headline
 * listing is the cheapest, the others surface in the "ALSO ON" badge.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  enrichments,
  householdMembers,
  listingPhotos,
  listings,
  searches,
  swipes,
} from "../../../db/schema";
import type { Features } from "../../lib/ai/prompt";
import { getCurrentUser } from "./session";

const swipeOutcomeSchema = z.enum(["keep", "skip", "shortlist"]);

const recordSwipeSchema = z.object({
  clusterId: z.string().trim().min(1),
  searchId: z.string().trim().min(1),
  outcome: swipeOutcomeSchema,
});

/**
 * Shared input shape for the queue read endpoints. `searchId` is
 * optional — when omitted (or undefined) the endpoint returns the queue
 * across every active search in the household. The empty-string shape
 * is treated the same as omitted so callers can blindly pass the URL
 * search param without having to branch.
 */
const queueFilterSchema = z
  .object({
    searchId: z.string().trim().min(1).optional(),
  })
  .optional();

/**
 * `getNextReviewCard` accepts an extra optional `clusterId`. When set,
 * the card hydrates that specific cluster instead of the top of the
 * queue — drives the desktop "click a queue row to preview" flow. The
 * cluster still has to belong to the household's active searches; an
 * unknown id resolves to `null` (handled as empty-queue downstream).
 */
const reviewCardInputSchema = z
  .object({
    searchId: z.string().trim().min(1).optional(),
    clusterId: z.string().trim().min(1).optional(),
  })
  .optional();

export type ReviewCardCluster = {
  id: string;
  normalisedAddress: string;
  postcode: string | null;
  lat: string | null;
  lng: string | null;
};

export type ReviewCardHeadlineListing = {
  id: string;
  portal: string;
  portalListingId: string;
  url: string;
  title: string;
  addressRaw: string;
  priceMonthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  photos: string[];
  outcode: string;
  firstSeenAt: Date;
};

export type ReviewCardAlsoOn = {
  portal: string;
  priceMonthly: number | null;
  url: string;
};

export type ReviewCard = {
  cluster: ReviewCardCluster;
  headlineListing: ReviewCardHeadlineListing;
  portalsAlsoOn: ReviewCardAlsoOn[];
  features?: Features;
  epcRating?: string;
  /**
   * The size of the queue *right now*, including the card currently
   * being returned. The UI surfaces this as "N LEFT TODAY". When the
   * caller has swiped, they'll re-fetch and the number drops.
   */
  leftToday: number;
  /**
   * Search id used to scope the swipe row. The headline listing
   * belongs to this search; if other listings under the cluster
   * belong to a different search, the swipe is still recorded against
   * the headline's search for clarity.
   */
  searchId: string;
  /**
   * Search name + a compact bed-range summary surfaced in the top-bar
   * "search pill". e.g. `"North London · 2-bed"`.
   */
  searchPill: string;
};

/**
 * Best-effort 2/3-letter outcode pulled off the listing postcode. The
 * scrape pipeline doesn't write an `outcode` column today, so we derive
 * it here. Falls back to an empty string if the postcode is missing.
 */
function outcodeOf(postcode: string | null | undefined): string {
  if (!postcode) {
    return "";
  }
  const trimmed = postcode.trim().toUpperCase();
  const idx = trimmed.indexOf(" ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

/**
 * Pretty bed-range like "2-bed" / "1-2 bed" / "Any size". Used by the
 * top-bar search pill.
 */
function bedSummary(min: number | null, max: number | null): string {
  if (min === null && max === null) {
    return "Any size";
  }
  if (min !== null && max !== null && min === max) {
    return `${min}-bed`;
  }
  if (min !== null && max !== null) {
    return `${min}-${max} bed`;
  }
  if (min !== null) {
    return `${min}+ bed`;
  }
  return `up to ${max}-bed`;
}

/** Coerce the polymorphic `features` jsonb to the Features shape. */
function asFeatures(value: unknown): Features | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  return value as Features;
}

/**
 * EPC rating string from the `enrichments.epc` jsonb blob. The blob's
 * shape is `{ currentRating?: string; potentialRating?: string; ... }`.
 */
function asEpcRating(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const obj = value as { currentRating?: unknown };
  if (typeof obj.currentRating === "string") {
    return obj.currentRating;
  }
  return;
}

/**
 * Resolve every member of the caller's household, or throw. Returns
 * the membership rows so we know who counts as "any household member"
 * for the asymmetric-hides-from-skip filter.
 */
async function requireHouseholdMembers(): Promise<{
  householdId: string;
  memberUserIds: string[];
  currentUserId: string;
}> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("unauthorized");
  }
  const db = getDb();
  const myMembership = await db.query.householdMembers.findFirst({
    where: (hm, { eq: eqOp }) => eqOp(hm.userId, session.userId),
  });
  if (!myMembership) {
    throw new Error("no_household");
  }
  const members = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, myMembership.householdId));
  return {
    householdId: myMembership.householdId,
    memberUserIds: members.map((m) => m.userId),
    currentUserId: session.userId,
  };
}

/**
 * The "ranked queue" step of the review pipeline, shared by
 * `getNextReviewCard` and `getReviewQueue`.
 *
 * Returns the cluster ids the caller still has to swipe, ordered by
 * the v1 ranking rules (newest-first listing, cheapest-tiebreak), with
 * already-swiped clusters and household-skip clusters removed. The
 * caller hydrates whichever positions it needs.
 */
async function loadRankedQueueClusterIds(
  db: Db,
  householdId: string,
  memberUserIds: string[],
  currentUserId: string,
  /**
   * When set, restricts the ranked queue to listings belonging to this
   * one search (it must still be active and owned by the household).
   * Unknown/foreign ids are treated as "no matches" — we don't fall
   * back to "all searches" so the UI doesn't silently ignore a stale
   * URL filter.
   */
  filterSearchId?: string
): Promise<{
  clusterIds: string[];
  activeSearches: (typeof searches.$inferSelect)[];
}> {
  const allActiveSearches = await db
    .select()
    .from(searches)
    .where(
      and(eq(searches.householdId, householdId), eq(searches.active, true))
    );
  const activeSearches = filterSearchId
    ? allActiveSearches.filter((s) => s.id === filterSearchId)
    : allActiveSearches;
  if (activeSearches.length === 0) {
    return { clusterIds: [], activeSearches: [] };
  }
  const activeSearchIds = activeSearches.map((s) => s.id);

  const candidatesRows = await db
    .select({
      clusterId: listings.clusterId,
      newestFirstSeenAt: sql<Date>`MAX(${listings.firstSeenAt})`.as("newest"),
      cheapestPrice: sql<number | null>`MIN(${listings.priceMonthly})`.as(
        "cheapest"
      ),
    })
    .from(listings)
    .where(
      and(
        isNotNull(listings.clusterId),
        inArray(listings.searchId, activeSearchIds)
      )
    )
    .groupBy(listings.clusterId)
    .orderBy(
      desc(sql`MAX(${listings.firstSeenAt})`),
      sql`MIN(${listings.priceMonthly}) ASC NULLS LAST`
    );

  const candidates = candidatesRows
    .filter((r): r is typeof r & { clusterId: string } => Boolean(r.clusterId))
    .map((r) => r.clusterId);
  if (candidates.length === 0) {
    return { clusterIds: [], activeSearches };
  }

  const [mySwipes, householdSkips] = await Promise.all([
    db
      .select({ clusterId: swipes.clusterId })
      .from(swipes)
      .where(
        and(
          eq(swipes.userId, currentUserId),
          inArray(swipes.clusterId, candidates)
        )
      ),
    db
      .select({ clusterId: swipes.clusterId })
      .from(swipes)
      .where(
        and(
          inArray(swipes.userId, memberUserIds),
          eq(swipes.outcome, "skip"),
          inArray(swipes.clusterId, candidates)
        )
      ),
  ]);
  const mySwipedSet = new Set(mySwipes.map((s) => s.clusterId));
  const skipSet = new Set(householdSkips.map((s) => s.clusterId));
  const clusterIds = candidates.filter(
    (cid) => !(mySwipedSet.has(cid) || skipSet.has(cid))
  );

  return { clusterIds, activeSearches };
}

type Db = ReturnType<typeof getDb>;

export const getNextReviewCard = createServerFn({ method: "GET" })
  .inputValidator(reviewCardInputSchema)
  .handler(async ({ data }): Promise<ReviewCard | null> => {
    const { householdId, memberUserIds, currentUserId } =
      await requireHouseholdMembers();
    const db = getDb();

    const { clusterIds, activeSearches } = await loadRankedQueueClusterIds(
      db,
      householdId,
      memberUserIds,
      currentUserId,
      data?.searchId
    );
    if (clusterIds.length === 0) {
      return null;
    }
    const activeSearchIds = activeSearches.map((s) => s.id);

    // If the caller explicitly pinned a cluster, hydrate that one as
    // long as it's still in the queue (i.e. the user hasn't swiped on
    // it and it hasn't been household-skipped). Otherwise fall back to
    // the top-of-queue card. This drives the queue-rail click-to-preview
    // behaviour without going through a separate endpoint.
    const explicit = data?.clusterId;
    const nextClusterId =
      explicit && clusterIds.includes(explicit) ? explicit : clusterIds[0];
    if (!nextClusterId) {
      return null;
    }

    // Step 4: hydrate the chosen cluster — listings, photos, features.
    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, nextClusterId),
    });
    if (!cluster) {
      // Shouldn't be reachable — the SQL above filters by listings
      // whose cluster_id is non-null. Guard anyway.
      return null;
    }

    const clusterListings = await db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.clusterId, nextClusterId),
          inArray(listings.searchId, activeSearchIds)
        )
      )
      .orderBy(
        // Cheapest listing wins the headline slot. NULL prices sink to
        // the bottom — `NULLS LAST` would be ideal but drizzle's
        // `orderBy()` doesn't expose it; the JS-level resort below
        // handles it.
        listings.priceMonthly
      );

    const sortedListings = [...clusterListings].sort((a, b) => {
      if (a.priceMonthly == null && b.priceMonthly == null) {
        return 0;
      }
      if (a.priceMonthly == null) {
        return 1;
      }
      if (b.priceMonthly == null) {
        return -1;
      }
      return a.priceMonthly - b.priceMonthly;
    });

    const headline = sortedListings[0];
    if (!headline) {
      return null;
    }

    // Pull photos for the headline listing only. The "ALSO ON" cards
    // don't currently surface their own photos.
    const photos = await db
      .select()
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, headline.id))
      .orderBy(listingPhotos.position);

    const photoUrls = photos.map((p) => p.r2Key ?? p.url);

    // Pull the most recent enrichments row for the headline listing.
    // The unique (listing_id, prompt_version) means there can be many
    // versions; we take the lexically-greatest version string, which
    // works for the `v1.0.0` semver shape used today.
    const enrichmentRows = await db
      .select()
      .from(enrichments)
      .where(eq(enrichments.listingId, headline.id))
      .orderBy(desc(enrichments.promptVersion));
    const enrichment = enrichmentRows[0];

    // "ALSO ON" portals — every listing under this cluster other than
    // the headline. The chip surfaces the portal + cheaper-price hint.
    const portalsAlsoOn: ReviewCardAlsoOn[] = sortedListings
      .filter((l) => l.id !== headline.id)
      .map((l) => ({
        portal: l.portal,
        priceMonthly: l.priceMonthly,
        url: l.url,
      }));

    const headlineSearch = activeSearches.find(
      (s) => s.id === headline.searchId
    );
    const searchPill = headlineSearch
      ? `${headlineSearch.name} · ${bedSummary(
          headlineSearch.minBedrooms,
          headlineSearch.maxBedrooms
        )}`
      : "Your queue";

    return {
      cluster: {
        id: cluster.id,
        normalisedAddress: cluster.normalisedAddress,
        postcode: cluster.postcode,
        lat: cluster.lat,
        lng: cluster.lng,
      },
      headlineListing: {
        id: headline.id,
        portal: headline.portal,
        portalListingId: headline.portalListingId,
        url: headline.url,
        title: headline.title,
        addressRaw: headline.addressRaw,
        priceMonthly: headline.priceMonthly,
        bedrooms: headline.bedrooms,
        bathrooms: headline.bathrooms,
        propertyType: headline.propertyType,
        photos: photoUrls,
        outcode: outcodeOf(headline.postcode ?? cluster.postcode),
        firstSeenAt: headline.firstSeenAt,
      },
      portalsAlsoOn,
      features: asFeatures(enrichment?.features),
      epcRating: asEpcRating(enrichment?.epc),
      leftToday: clusterIds.length,
      searchId: headline.searchId,
      searchPill,
    };
  });

/**
 * Lightweight queue row for the desktop Review screen's "Up next" rail.
 * Mirrors `getNextReviewCard`'s ranking but hydrates a thin shape — just
 * what the rail's thumbnail row needs (title / outcode / beds / price /
 * one photo / portal count). Per the blind-review rule, this never
 * surfaces a peer-member outcome.
 */
export type ReviewQueueItem = {
  clusterId: string;
  searchId: string;
  headlineListingId: string;
  title: string;
  outcode: string;
  bedrooms: number | null;
  priceMonthly: number | null;
  photo: string | null;
  portalCount: number;
};

export type ReviewQueue = {
  /**
   * Every ranked cluster still awaiting the caller's swipe, in queue
   * order (top of queue first). The client decides which entry is
   * "currently displayed in the hero" by matching the `card.cluster.id`
   * against this list — that allows queue-row click to repoint the
   * hero without a separate endpoint.
   */
  items: ReviewQueueItem[];
  /**
   * Same as `items.length`. Kept for symmetry with the header copy
   * "N in queue" and so the UI doesn't have to know it's a derived
   * count.
   */
  remaining: number;
};

export const getReviewQueue = createServerFn({ method: "GET" })
  .inputValidator(queueFilterSchema)
  .handler(async ({ data }): Promise<ReviewQueue> => {
    const { householdId, memberUserIds, currentUserId } =
      await requireHouseholdMembers();
    const db = getDb();

    const { clusterIds, activeSearches } = await loadRankedQueueClusterIds(
      db,
      householdId,
      memberUserIds,
      currentUserId,
      data?.searchId
    );
    const remaining = clusterIds.length;
    if (remaining === 0) {
      return { items: [], remaining: 0 };
    }

    const items = await hydrateQueueItems(
      db,
      clusterIds,
      activeSearches.map((s) => s.id)
    );
    return { items, remaining };
  });

/**
 * Lightweight per-cluster hydration for the queue rail. Pulls listings
 * + first photos for the given upcoming clusters in two round-trips,
 * groups in JS to pick the cheapest listing per cluster as the row
 * headline, and counts distinct portals so the rail can render the
 * "·N" suffix.
 *
 * Returned order matches `upcomingClusterIds` — Map iteration order
 * isn't guaranteed to track the SQL ranking once we group by id.
 */
async function hydrateQueueItems(
  db: Db,
  upcomingClusterIds: string[],
  activeSearchIds: string[]
): Promise<ReviewQueueItem[]> {
  const rows = await db
    .select({
      id: listings.id,
      clusterId: listings.clusterId,
      searchId: listings.searchId,
      portal: listings.portal,
      title: listings.title,
      postcode: listings.postcode,
      bedrooms: listings.bedrooms,
      priceMonthly: listings.priceMonthly,
    })
    .from(listings)
    .where(
      and(
        inArray(listings.clusterId, upcomingClusterIds),
        inArray(listings.searchId, activeSearchIds)
      )
    );

  type GroupedCluster = {
    headline: (typeof rows)[number];
    portals: Set<string>;
  };
  const grouped = new Map<string, GroupedCluster>();
  for (const row of rows) {
    if (!row.clusterId) {
      continue;
    }
    const existing = grouped.get(row.clusterId);
    if (!existing) {
      grouped.set(row.clusterId, {
        headline: row,
        portals: new Set([row.portal]),
      });
      continue;
    }
    existing.portals.add(row.portal);
    if (isCheaper(row.priceMonthly, existing.headline.priceMonthly)) {
      existing.headline = row;
    }
  }

  const headlineListingIds = Array.from(grouped.values()).map(
    (g) => g.headline.id
  );
  const photoByListingId = await loadFirstPhotoByListing(
    db,
    headlineListingIds
  );

  return upcomingClusterIds
    .map((clusterId): ReviewQueueItem | null => {
      const g = grouped.get(clusterId);
      if (!g) {
        return null;
      }
      return {
        clusterId,
        searchId: g.headline.searchId,
        headlineListingId: g.headline.id,
        title: g.headline.title,
        outcode: outcodeOf(g.headline.postcode),
        bedrooms: g.headline.bedrooms,
        priceMonthly: g.headline.priceMonthly,
        photo: photoByListingId.get(g.headline.id) ?? null,
        portalCount: g.portals.size,
      };
    })
    .filter((item): item is ReviewQueueItem => item !== null);
}

/**
 * `a` beats `b` for the headline slot when it has a real price and `b`
 * doesn't, or when both are real and `a` is strictly smaller. A null
 * price never beats a real one.
 */
function isCheaper(a: number | null, b: number | null): boolean {
  if (a == null) {
    return false;
  }
  if (b == null) {
    return true;
  }
  return a < b;
}

async function loadFirstPhotoByListing(
  db: Db,
  listingIds: string[]
): Promise<Map<string, string>> {
  if (listingIds.length === 0) {
    return new Map();
  }
  const photos = await db
    .select({
      listingId: listingPhotos.listingId,
      url: listingPhotos.url,
      r2Key: listingPhotos.r2Key,
    })
    .from(listingPhotos)
    .where(inArray(listingPhotos.listingId, listingIds))
    .orderBy(listingPhotos.position);
  const byListingId = new Map<string, string>();
  for (const p of photos) {
    if (!byListingId.has(p.listingId)) {
      byListingId.set(p.listingId, p.r2Key ?? p.url);
    }
  }
  return byListingId;
}

/**
 * The current user's swipe activity since UTC midnight, bucketed by
 * outcome. Drives the desktop Review header strip ("5 reviewed · 1
 * kept · 4 skipped"). This counts the *user's* decisions, not the
 * household's — every member's strip reflects their own work.
 *
 * UTC midnight is used so the bucket boundary doesn't shift around as
 * the user moves between devices or timezones. The visible difference
 * vs Europe/London-midnight is at most one hour in either direction.
 */
export type TodayReviewStats = {
  kept: number;
  skipped: number;
  shortlisted: number;
  reviewed: number;
};

export const getTodayReviewStats = createServerFn({ method: "GET" })
  .inputValidator(queueFilterSchema)
  .handler(async ({ data }): Promise<TodayReviewStats> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }
    const db = getDb();

    const now = new Date();
    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    const filterSearchId = data?.searchId;
    const rows = await db
      .select({
        outcome: swipes.outcome,
        count: sql<string>`COUNT(*)`,
      })
      .from(swipes)
      .where(
        and(
          eq(swipes.userId, session.userId),
          sql`${swipes.createdAt} >= ${startOfTodayUtc}`,
          filterSearchId ? eq(swipes.searchId, filterSearchId) : undefined
        )
      )
      .groupBy(swipes.outcome);

    const stats: TodayReviewStats = {
      kept: 0,
      skipped: 0,
      shortlisted: 0,
      reviewed: 0,
    };
    for (const row of rows) {
      const n = Number(row.count);
      stats.reviewed += n;
      if (row.outcome === "keep") {
        stats.kept = n;
      } else if (row.outcome === "skip") {
        stats.skipped = n;
      } else if (row.outcome === "shortlist") {
        stats.shortlisted = n;
      }
    }
    return stats;
  });

export const recordSwipe = createServerFn({ method: "POST" })
  .inputValidator(recordSwipeSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }
    const db = getDb();

    // Authz: the search must belong to the caller's household. We don't
    // separately check the cluster — clusters are global, scoped by the
    // search the swipe is recorded against.
    const membership = await db.query.householdMembers.findFirst({
      where: (hm, { eq: eqOp }) => eqOp(hm.userId, session.userId),
    });
    if (!membership) {
      throw new Error("no_household");
    }
    const search = await db.query.searches.findFirst({
      where: (s, { eq: eqOp, and: andOp }) =>
        andOp(
          eqOp(s.id, data.searchId),
          eqOp(s.householdId, membership.householdId)
        ),
    });
    if (!search) {
      throw new Error("search_not_found");
    }
    // Cluster must exist — defensive.
    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, data.clusterId),
    });
    if (!cluster) {
      throw new Error("cluster_not_found");
    }

    // INSERT … ON CONFLICT DO UPDATE — undo + re-swipe needs to land on
    // a fresh `created_at` so the queue ordering of "most-recent first"
    // still works for undoLastSwipe afterwards.
    await db
      .insert(swipes)
      .values({
        id: nanoid(),
        userId: session.userId,
        clusterId: data.clusterId,
        searchId: data.searchId,
        outcome: data.outcome,
      })
      .onConflictDoUpdate({
        target: [swipes.userId, swipes.clusterId, swipes.searchId],
        set: {
          outcome: data.outcome,
          createdAt: sql`NOW()`,
        },
      });

    return { ok: true };
  });

export const undoLastSwipe = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; clusterId: string | null }> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }
    const db = getDb();

    const last = await db
      .select({ id: swipes.id, clusterId: swipes.clusterId })
      .from(swipes)
      .where(eq(swipes.userId, session.userId))
      .orderBy(desc(swipes.createdAt))
      .limit(1);

    const row = last[0];
    if (!row) {
      return { ok: true, clusterId: null };
    }

    await db.delete(swipes).where(eq(swipes.id, row.id));
    return { ok: true, clusterId: row.clusterId };
  }
);
