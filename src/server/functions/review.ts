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
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import type { Env } from "../../server";
import { getCurrentUser } from "./session";

const swipeOutcomeSchema = z.enum(["keep", "skip", "shortlist"]);

const recordSwipeSchema = z.object({
  clusterId: z.string().trim().min(1),
  searchId: z.string().trim().min(1),
  outcome: swipeOutcomeSchema,
});

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
  const db = getDb(env as unknown as Env);
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

export const getNextReviewCard = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReviewCard | null> => {
    const { householdId, memberUserIds, currentUserId } =
      await requireHouseholdMembers();
    const db = getDb(env as unknown as Env);

    // Step 1: collect the household's active searches. If there are
    // none, the queue is trivially empty.
    const activeSearches = await db
      .select()
      .from(searches)
      .where(
        and(eq(searches.householdId, householdId), eq(searches.active, true))
      );
    if (activeSearches.length === 0) {
      return null;
    }
    const activeSearchIds = activeSearches.map((s) => s.id);

    // Step 2: pull every cluster that has at least one listing in an
    // active search, ordered by newest-first / cheapest-first. Dedup
    // by cluster_id by aggregating min(first_seen_at) → DESC.
    //
    // We use raw SQL for the GROUP BY because Drizzle's relational
    // query builder doesn't expose `MIN(first_seen_at)` cleanly in this
    // shape — pulling the listing rows + grouping client-side would
    // require fetching the whole table, which is wrong.
    type RankedClusterRow = {
      clusterId: string;
      newestFirstSeenAt: Date;
      cheapestPrice: number | null;
    };

    const rankedRows = await db.execute(sql<RankedClusterRow>`
      SELECT
        ${listings.clusterId} AS "clusterId",
        MAX(${listings.firstSeenAt}) AS "newestFirstSeenAt",
        MIN(${listings.priceMonthly}) AS "cheapestPrice"
      FROM ${listings}
      WHERE ${listings.clusterId} IS NOT NULL
        AND ${inArray(listings.searchId, activeSearchIds)}
      GROUP BY ${listings.clusterId}
      ORDER BY MAX(${listings.firstSeenAt}) DESC,
               MIN(${listings.priceMonthly}) ASC NULLS LAST
    `);

    // drizzle-orm's `db.execute()` on neon-http returns the bare row
    // array under `.rows`, mirroring pg's result shape. Cast through
    // unknown because the static type is the generic `QueryResult`.
    const candidates = (
      rankedRows as unknown as { rows: RankedClusterRow[] }
    ).rows
      .filter((r): r is RankedClusterRow & { clusterId: string } =>
        Boolean(r.clusterId)
      )
      .map((r) => r.clusterId);

    if (candidates.length === 0) {
      return null;
    }

    // Step 3: subtract clusters the CURRENT user has already swiped
    // and clusters where ANY household member has swiped 'skip'.
    const mySwipes = await db
      .select({ clusterId: swipes.clusterId })
      .from(swipes)
      .where(
        and(
          eq(swipes.userId, currentUserId),
          inArray(swipes.clusterId, candidates)
        )
      );
    const mySwipedSet = new Set(mySwipes.map((s) => s.clusterId));

    const householdSkips = await db
      .select({ clusterId: swipes.clusterId })
      .from(swipes)
      .where(
        and(
          inArray(swipes.userId, memberUserIds),
          eq(swipes.outcome, "skip"),
          inArray(swipes.clusterId, candidates)
        )
      );
    const skipSet = new Set(householdSkips.map((s) => s.clusterId));

    const queue = candidates.filter(
      (cid) => !(mySwipedSet.has(cid) || skipSet.has(cid))
    );
    if (queue.length === 0) {
      return null;
    }

    const nextClusterId = queue[0];
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
      },
      portalsAlsoOn,
      features: asFeatures(enrichment?.features),
      epcRating: asEpcRating(enrichment?.epc),
      leftToday: queue.length,
      searchId: headline.searchId,
      searchPill,
    };
  }
);

export const recordSwipe = createServerFn({ method: "POST" })
  .inputValidator(recordSwipeSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }
    const db = getDb(env as unknown as Env);

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
    const db = getDb(env as unknown as Env);

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
