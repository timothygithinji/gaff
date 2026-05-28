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
import { tasks } from "@trigger.dev/sdk";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  enrichments,
  listingPhotos,
  listings,
  matchNotifications,
  searches,
  swipes,
  vMutualMatches,
} from "../../../db/schema";
import { filterFeatures } from "../../lib/ai/feature-filter";
import type { Features } from "../../lib/ai/prompt";
import { resolvePhotoUrl } from "./photo-url";
import { getCurrentUser } from "./session";
import { requireHouseholdScope } from "./shortlist-helpers.server";

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
  /**
   * Portal's own "first listed" date (Rightmove `listingHistory`, Zoopla
   * `publishedOn`, OpenRent — not exposed). Drives the "Listed N ago"
   * card sub-line; null when the portal didn't say or scrape-detail
   * hasn't run yet — caller falls back to `firstSeenAt`.
   */
  publishedAt: Date | null;
  /**
   * Free-form portal badges off the listing card ("Reduced", "Just
   * added", "Available from 1 June 2026", "House share"). Surfaced
   * through `deriveListingMetaBadges` on the UI; raw shape preserved
   * here so the same data can drive other surfaces later.
   */
  tags: string[];
  sizeSqFt: number | null;
  /** Direct R2 / portal URL for the floor plan image, if scraped. */
  floorplanUrl: string | null;
  /**
   * Rightmove's `features.obligations.listed` flag — true when the
   * building is listed. Read off `rawJson` and forwarded so the swipe
   * card can render a caution badge without pulling the full detail.
   */
  listedBuilding: boolean | null;
  /**
   * Landlord-disclosed historic flooding (Rightmove only — minimal
   * shape, just enough for `deriveListingMetaBadges`). Full disclosure
   * lives on the listing detail page.
   */
  floodDisclosure: { floodedInLastFiveYears: boolean | null } | null;
};

export type ReviewCardAlsoOn = {
  portal: string;
  priceMonthly: number | null;
  url: string;
};

/**
 * Nearest station as scraped by Rightmove (the only portal that exposes
 * this in v1). Walking minutes are computed from `distanceMiles` using
 * a 20 min/mile rule of thumb so we can surface a useful number on the
 * card without an API call.
 */
export type ReviewCardStation = {
  name: string;
  distanceMiles: number | null;
  walkMinutes: number | null;
};

/**
 * Compact broadband summary lifted off `enrichments.broadband`. We
 * already enriched this via BT Wholesale; the card consumes
 * `downloadMbps` for the headline number and `fttpAvailable` for the
 * fibre badge.
 */
export type ReviewCardBroadband = {
  technology: "FTTP" | "FTTC" | "ADSL" | null;
  downloadMbps: number | null;
  fttpAvailable: boolean;
};

export type ReviewCard = {
  cluster: ReviewCardCluster;
  headlineListing: ReviewCardHeadlineListing;
  portalsAlsoOn: ReviewCardAlsoOn[];
  features?: Features;
  epcRating?: string;
  /**
   * True when `epcRating` is a postcode-level estimate rather than this
   * building's own certificate (the listing exposed no house number to
   * match on). The card marks it with a "~" so it doesn't read as exact.
   */
  epcIsEstimate?: boolean;
  /** Soonest commute target, in minutes, when enriched. */
  commuteMinutes: number | null;
  /** Closest scraped station (with derived walk minutes). */
  nearestStation: ReviewCardStation | null;
  broadband: ReviewCardBroadband | null;
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
 * Pick the soonest commute target from the `enrichments.commuteMinutes`
 * map. Returns null when no enrichment exists yet. The map is keyed by
 * the search's `commuteTargets[].label`; we don't care which label the
 * caller picks first — the smallest minute count wins so the review
 * card surfaces the best-case number.
 */
function pickSoonestCommute(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  let best: number | null = null;
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (
      typeof v === "number" &&
      Number.isFinite(v) &&
      (best === null || v < best)
    ) {
      best = v;
    }
  }
  return best;
}

/**
 * Lift the nearest scraped station out of `listing.rawJson.nearestStations`
 * (Rightmove parser populates this; Zoopla/OpenRent don't). We pick the
 * closest by distanceMiles and derive walk minutes at ~20 min/mile so
 * the card has a usable headline.
 */
function pickNearestStation(rawJson: unknown): ReviewCardStation | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const arr = (rawJson as Record<string, unknown>).nearestStations;
  if (!Array.isArray(arr)) {
    return null;
  }
  const candidates = arr
    .filter(
      (s): s is { name: unknown; distanceMiles?: unknown } =>
        Boolean(s) && typeof s === "object"
    )
    .map((s) => ({
      name: typeof s.name === "string" ? s.name : "",
      distanceMiles:
        typeof s.distanceMiles === "number" ? s.distanceMiles : null,
    }))
    .filter((s) => s.name);
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => {
    if (a.distanceMiles === null && b.distanceMiles === null) {
      return 0;
    }
    if (a.distanceMiles === null) {
      return 1;
    }
    if (b.distanceMiles === null) {
      return -1;
    }
    return a.distanceMiles - b.distanceMiles;
  });
  const top = candidates[0];
  if (!top) {
    return null;
  }
  const walk =
    top.distanceMiles !== null
      ? Math.max(1, Math.round(top.distanceMiles * 20))
      : null;
  return {
    name: top.name,
    distanceMiles: top.distanceMiles,
    walkMinutes: walk,
  };
}

function asBroadband(value: unknown): ReviewCardBroadband | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const b = value as Record<string, unknown>;
  const tech =
    b.technology === "FTTP" ||
    b.technology === "FTTC" ||
    b.technology === "ADSL"
      ? b.technology
      : null;
  return {
    technology: tech,
    downloadMbps: typeof b.downloadMbps === "number" ? b.downloadMbps : null,
    fttpAvailable: b.fttpAvailable === true,
  };
}

function readFloorplanUrl(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const u = (rawJson as Record<string, unknown>).floorplanUrl;
  return typeof u === "string" && u.length > 0 ? u : null;
}

function readTags(rawJson: unknown): string[] {
  if (!rawJson || typeof rawJson !== "object") {
    return [];
  }
  const tags = (rawJson as Record<string, unknown>).tags;
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.filter(
    (t): t is string => typeof t === "string" && t.length > 0
  );
}

function readBool(rawJson: unknown, key: string): boolean | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const v = (rawJson as Record<string, unknown>)[key];
  return typeof v === "boolean" ? v : null;
}

/**
 * Pull just the bit of the Rightmove flood disclosure the meta-badge
 * derivation needs. The full shape lives on the listing detail page.
 */
function readFloodDisclosureForBadges(
  rawJson: unknown
): { floodedInLastFiveYears: boolean | null } | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const fd = (rawJson as Record<string, unknown>).floodDisclosure;
  if (!fd || typeof fd !== "object") {
    return null;
  }
  const flooded = (fd as Record<string, unknown>).floodedInLastFiveYears;
  return {
    floodedInLastFiveYears: typeof flooded === "boolean" ? flooded : null,
  };
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

/** True when the stored EPC blob is a postcode-level estimate. */
function isEpcEstimate(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === "estimate"
  );
}

/**
 * SQL predicate (requires `searches` joined on `listings.searchId`): the
 * listing's monthly price sits within its own search's band. Bounds are
 * inclusive, a null band edge is unbounded, and a null price is kept (the
 * parser couldn't read one — mirrors `filterByPriceRange` on the scrape
 * side). This is the read-time backstop: rows ingested before the
 * scrape-side filter existed — or any that slip through — never reach the
 * queue or a review card.
 */
function listingWithinSearchBand() {
  return sql`(
    ${listings.priceMonthly} IS NULL
    OR (
      (${searches.minPrice} IS NULL OR ${listings.priceMonthly} >= ${searches.minPrice})
      AND (${searches.maxPrice} IS NULL OR ${listings.priceMonthly} <= ${searches.maxPrice})
    )
  )`;
}

/** JS twin of {@link listingWithinSearchBand} for already-fetched rows. */
function priceWithinBand(
  price: number | null,
  min: number | null,
  max: number | null
): boolean {
  if (price == null) {
    return true;
  }
  if (min != null && price < min) {
    return false;
  }
  if (max != null && price > max) {
    return false;
  }
  return true;
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
    .innerJoin(searches, eq(listings.searchId, searches.id))
    .where(
      and(
        isNotNull(listings.clusterId),
        inArray(listings.searchId, activeSearchIds),
        listingWithinSearchBand()
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
      await requireHouseholdScope();
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

    // Read-time price guard: only consider listings within their own
    // search's band, so the headline (and "ALSO ON" set derived from it)
    // can't be an out-of-band listing even when the cluster qualified via a
    // sibling that IS in band.
    const bandBySearchId = new Map(
      activeSearches.map(
        (s) => [s.id, { min: s.minPrice, max: s.maxPrice }] as const
      )
    );
    const inBandListings = clusterListings.filter((l) => {
      const band = bandBySearchId.get(l.searchId);
      return band
        ? priceWithinBand(l.priceMonthly, band.min, band.max)
        : true;
    });

    const sortedListings = [...inBandListings].sort((a, b) => {
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

    const photoUrls = photos.map(resolvePhotoUrl);

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
        publishedAt: headline.publishedAt,
        tags: readTags(headline.rawJson),
        sizeSqFt: headline.sizeSqFt,
        floorplanUrl: readFloorplanUrl(headline.rawJson),
        listedBuilding: readBool(headline.rawJson, "listedBuilding"),
        floodDisclosure: readFloodDisclosureForBadges(headline.rawJson),
      },
      portalsAlsoOn,
      // Strip generic-noise highlights/watchouts via the shared filter
      // (`src/lib/ai/feature-filter.ts`). The persisted v2.0.0 rows
      // are still full of bills-not-included, restated specs, etc.;
      // this drops them at read time without re-running AI.
      features: filterFeatures(asFeatures(enrichment?.features)),
      epcRating: asEpcRating(enrichment?.epc),
      epcIsEstimate: isEpcEstimate(enrichment?.epc),
      commuteMinutes: pickSoonestCommute(enrichment?.commuteMinutes),
      nearestStation: pickNearestStation(headline.rawJson),
      broadband: asBroadband(enrichment?.broadband),
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
      await requireHouseholdScope();
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
    .innerJoin(searches, eq(listings.searchId, searches.id))
    .where(
      and(
        inArray(listings.clusterId, upcomingClusterIds),
        inArray(listings.searchId, activeSearchIds),
        listingWithinSearchBand()
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
      byListingId.set(p.listingId, resolvePhotoUrl(p));
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

/**
 * If this cluster has just become a mutual match for the household and we
 * haven't emailed about it yet, claim the notification atomically (the
 * unique index means concurrent swipes can't double-send) and fire the
 * instant match email. No-op when not yet mutual or already notified.
 */
async function notifyMutualMatchIfNew(
  db: Db,
  householdId: string,
  clusterId: string
): Promise<void> {
  const mutual = await db
    .select({ clusterId: vMutualMatches.clusterId })
    .from(vMutualMatches)
    .where(
      and(
        eq(vMutualMatches.householdId, householdId),
        eq(vMutualMatches.clusterId, clusterId)
      )
    )
    .limit(1);
  if (mutual.length === 0) {
    return;
  }
  const claimed = await db
    .insert(matchNotifications)
    .values({ id: nanoid(), householdId, clusterId })
    .onConflictDoNothing({
      target: [matchNotifications.householdId, matchNotifications.clusterId],
    })
    .returning({ id: matchNotifications.id });
  if (claimed.length === 0) {
    return;
  }
  await tasks.trigger("send-match-email", { householdId, clusterId });
}

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

    // A keep/shortlist can complete a mutual match — fire the instant
    // "you both want this" email. Best-effort: the swipe is already
    // recorded, so a transient notification failure must never fail it.
    if (data.outcome !== "skip") {
      try {
        await notifyMutualMatchIfNew(db, membership.householdId, data.clusterId);
      } catch {
        // Best-effort: the swipe is recorded; a notification hiccup
        // (mutual-match query / Trigger dispatch) must never fail it.
      }
    }

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
