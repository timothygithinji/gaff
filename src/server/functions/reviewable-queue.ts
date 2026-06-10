/**
 * The "reviewable queue" selection logic — the single source of truth for
 * WHICH clusters a household still has to review, shared by the review
 * screens (`./review`) and the email digest (`src/trigger/household-digest`).
 *
 * This module deliberately has NO dependency on auth/request context or
 * `@tanstack/react-start`, so it bundles cleanly into a Trigger.dev task as
 * well as the web server. It was split out of `review.ts` after the digest
 * and the review page drifted: the digest filtered only on price, so it
 * could email "N new places to review" for listings the review page then
 * dropped on bedroom/bathroom/exclusion/property-type — an empty queue. Both
 * now call {@link loadRankedQueueClusterIds}, so they can't diverge again.
 */

import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { getDb } from "../../../db";
import {
  clusterDeferrals,
  enrichments,
  listings,
  searches,
  swipes,
} from "../../../db/schema";
import { HOUSE_SHARE_PATTERN } from "../../lib/property-kind";
import {
  type ActiveSearch,
  type ClusterTargetEnrichment,
  clusterPassesSearch,
  searchHasTargets,
} from "../../lib/queue-targets";
import { requestMemo } from "./request-cache.server";

type Db = ReturnType<typeof getDb>;

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

/**
 * SQL backstop mirroring `filterByBedroomRange` in scrape-portal.ts.
 * OpenRent's `bedrooms_min` URL filter is silently ignored — 1-bed flats,
 * studios, and shared rooms come back regardless. Without this predicate
 * those rows reach the queue.
 */
function listingMatchesBedroomBand() {
  return sql`(
    ${listings.bedrooms} IS NULL
    OR (
      (${searches.minBedrooms} IS NULL OR ${listings.bedrooms} >= ${searches.minBedrooms})
      AND (${searches.maxBedrooms} IS NULL OR ${listings.bedrooms} <= ${searches.maxBedrooms})
    )
  )`;
}

/**
 * SQL backstop for the bathroom band. Bathrooms are intentionally NOT
 * sent to the portal search URLs (a portal `baths_min` treats a missing
 * count as a non-match, which would drop the many valid listings that
 * never state bathrooms — see the note in scrape-portal.ts). So this
 * read-time band is the ONLY place the bathroom filter is enforced. A
 * null count is kept (unknown ≠ disqualified), matching price/beds; only
 * a KNOWN sub-minimum (or over-maximum) count is dropped.
 */
function listingMatchesBathroomBand() {
  return sql`(
    ${listings.bathrooms} IS NULL
    OR (
      (${searches.minBathrooms} IS NULL OR ${listings.bathrooms} >= ${searches.minBathrooms})
      AND (${searches.maxBathrooms} IS NULL OR ${listings.bathrooms} <= ${searches.maxBathrooms})
    )
  )`;
}

/** JS twin of {@link listingWithinSearchBand} for already-fetched rows. */
export function priceWithinBand(
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

/** JS twin of {@link listingMatchesBedroomBand} for already-fetched rows. */
export function bedroomsWithinBand(
  bedrooms: number | null,
  min: number | null,
  max: number | null
): boolean {
  if (bedrooms == null) {
    return true;
  }
  if (min != null && bedrooms < min) {
    return false;
  }
  if (max != null && bedrooms > max) {
    return false;
  }
  return true;
}

/** JS twin of {@link listingMatchesBathroomBand} for already-fetched rows. */
export function bathroomsWithinBand(
  bathrooms: number | null,
  min: number | null,
  max: number | null
): boolean {
  if (bathrooms == null) {
    return true;
  }
  if (min != null && bathrooms < min) {
    return false;
  }
  if (max != null && bathrooms > max) {
    return false;
  }
  return true;
}

/**
 * Category signals for the `exclusions` filter, keyed by the closed-set
 * value stored on `searches.exclusions`. Each value is a regex source
 * shared verbatim by the SQL predicate (Postgres `~*`) and its JS twin
 * (`new RegExp(src, "i")`) so a listing is classified identically at the
 * DB and in-memory. Patterns mirror `scripts/verify/audit-filter-leaks.ts`.
 * Matched against `property_type || ' ' || title` because OpenRent has no
 * URL handle for house-share/retirement — it leaks "Room in a Shared X"
 * (and would leak retirement schemes) into the feed unfiltered.
 */
const EXCLUSION_PATTERNS = {
  house_share: HOUSE_SHARE_PATTERN,
  student: "student",
  retirement: "retirement|over\\s*55|over\\s*60|mccarthy|churchill",
} as const;

/**
 * SQL predicate (requires `searches` joined on `listings.searchId`): the
 * listing is NOT in any category the search asked to exclude. A category
 * only bites when it's present in `searches.exclusions`; otherwise the
 * clause is a no-op. This is the read-time backstop for exclusions — the
 * scrape side enforces them only via portal URL params, which OpenRent
 * ignores, so without this a house_share-excluding search still surfaces
 * shared rooms (today they're caught only incidentally by the bedroom
 * band, since shares list as 1-bed — this stops relying on that).
 */
function listingPassesExclusions() {
  const haystack = sql`(coalesce(${listings.propertyType}, '') || ' ' || ${listings.title})`;
  const notExcluded = (value: string, pattern: string) =>
    sql`NOT (${value}::text = ANY(${searches.exclusions}) AND ${haystack} ~* ${pattern})`;
  return sql`(
    ${notExcluded("house_share", EXCLUSION_PATTERNS.house_share)}
    AND ${notExcluded("student", EXCLUSION_PATTERNS.student)}
    AND ${notExcluded("retirement", EXCLUSION_PATTERNS.retirement)}
  )`;
}

/**
 * Property-type regex sources for the SQL backstop. These are the Postgres
 * twins of the `\b`-bounded regexes in `property-kind.ts`: Postgres ARE
 * uses `\y` for a word boundary (`\b` is backspace in POSIX), so the
 * boundaries are spelled `\y` here. The share pattern is boundary-free and
 * shared verbatim. Precedence (share > studio > flat > house) is applied in
 * {@link listingMatchesPropertyType} below, mirroring `classifyPropertyKind`.
 */
const PROPERTY_TYPE_PATTERNS = {
  studio: "studio",
  flat: "\\y(?:flat|apartment|maisonette)\\y",
  house: "\\y(?:house|bungalow|cottage|terrace[d]?|detached|semi|mews|town\\s*house)\\y",
  bungalow: "\\ybungalow\\y",
} as const;

/**
 * SQL backstop mirroring `filterByPropertyType` in scrape-portal.ts and
 * `listingMatchesPropertyTypes`. Enforces `searches.propertyTypes`
 * at read time — the only place it bites for OpenRent (no URL type filter)
 * and Zoopla's free-text fallback (ignores `property_sub_type`). An empty
 * filter is a no-op; an unclassifiable listing is kept (keep-null). The
 * `kind` precedence (share > studio > flat > house) matches the JS
 * classifier so a listing buckets identically at the DB and in memory;
 * "bungalow" is split out from "house" the way the form's pills imply.
 */
function listingMatchesPropertyType() {
  const h = sql`(coalesce(${listings.propertyType}, '') || ' ' || ${listings.title})`;
  const pt = searches.propertyTypes;
  const isShare = sql`${h} ~* ${HOUSE_SHARE_PATTERN}`;
  const isStudio = sql`${h} ~* ${PROPERTY_TYPE_PATTERNS.studio}`;
  const isFlat = sql`${h} ~* ${PROPERTY_TYPE_PATTERNS.flat}`;
  const isHouse = sql`${h} ~* ${PROPERTY_TYPE_PATTERNS.house}`;
  const isBungalow = sql`${h} ~* ${PROPERTY_TYPE_PATTERNS.bungalow}`;
  return sql`(
    cardinality(${pt}) = 0
    OR NOT (${isShare} OR ${isStudio} OR ${isFlat} OR ${isHouse})
    OR ('flat' = ANY(${pt}) AND NOT ${isShare} AND (${isStudio} OR ${isFlat}))
    OR ('house' = ANY(${pt}) AND ${isHouse} AND NOT ${isShare} AND NOT ${isStudio} AND NOT ${isFlat} AND NOT ${isBungalow})
    OR ('bungalow' = ANY(${pt}) AND ${isBungalow})
  )`;
}

/** JS twin of {@link listingPassesExclusions} for already-fetched rows. */
export function passesExclusions(
  propertyType: string | null,
  title: string,
  exclusions: string[]
): boolean {
  if (exclusions.length === 0) {
    return true;
  }
  const haystack = `${propertyType ?? ""} ${title}`;
  for (const value of exclusions) {
    const pattern =
      EXCLUSION_PATTERNS[value as keyof typeof EXCLUSION_PATTERNS];
    if (pattern && new RegExp(pattern, "i").test(haystack)) {
      return false;
    }
  }
  return true;
}

/**
 * The five read-time filter predicates that define a reviewable listing,
 * as a single SQL `AND` chain. Requires `searches` joined on
 * `listings.searchId`. Exposed so any query that surfaces listings to a
 * user (queue, digest, audits) applies the exact same backstops.
 */
export function reviewableListingFilter() {
  return and(
    listingWithinSearchBand(),
    listingMatchesBedroomBand(),
    listingMatchesBathroomBand(),
    listingPassesExclusions(),
    listingMatchesPropertyType()
  );
}

/**
 * Filter the candidate clusters down to those matching their search's
 * commute/transport criteria. A search with no criteria admits every
 * cluster under it (no filter); a cluster shown under multiple searches
 * survives if it passes ANY of them. Returns the input order untouched
 * when no active search has criteria, so the common case pays nothing.
 */
async function filterCandidatesByTargets(
  db: Db,
  candidates: string[],
  activeSearches: ActiveSearch[]
): Promise<string[]> {
  if (!activeSearches.some(searchHasTargets)) {
    return candidates;
  }
  const activeSearchIds = activeSearches.map((s) => s.id);

  // cluster → the active searches it has listings under.
  const memberRows = await db
    .select({ clusterId: listings.clusterId, searchId: listings.searchId })
    .from(listings)
    .where(
      and(
        inArray(listings.clusterId, candidates),
        inArray(listings.searchId, activeSearchIds)
      )
    );
  const searchesByCluster = new Map<string, Set<string>>();
  for (const r of memberRows) {
    if (!(r.clusterId && r.searchId)) {
      continue;
    }
    const set = searchesByCluster.get(r.clusterId) ?? new Set<string>();
    set.add(r.searchId);
    searchesByCluster.set(r.clusterId, set);
  }

  // cluster → its enrichment's commute/transit data (one per cluster; the
  // values are replicated across every listing in the cluster). Highest
  // promptVersion wins, matching the hydration queries.
  const enrRows = await db
    .select({
      clusterId: listings.clusterId,
      promptVersion: enrichments.promptVersion,
      commuteMinutes: enrichments.commuteMinutes,
      stationRoutes: enrichments.stationRoutes,
      nearbyTransit: enrichments.nearbyTransit,
    })
    .from(enrichments)
    .innerJoin(listings, eq(enrichments.listingId, listings.id))
    .where(inArray(listings.clusterId, candidates))
    .orderBy(desc(enrichments.promptVersion));
  const enrByCluster = new Map<string, ClusterTargetEnrichment>();
  for (const r of enrRows) {
    if (!r.clusterId || enrByCluster.has(r.clusterId)) {
      continue;
    }
    enrByCluster.set(r.clusterId, {
      commuteMinutes: r.commuteMinutes ?? null,
      stationRoutes: r.stationRoutes ?? null,
      nearbyTransit: r.nearbyTransit ?? null,
    });
  }

  const searchById = new Map(activeSearches.map((s) => [s.id, s]));
  return candidates.filter((cid) => {
    const searchIds = searchesByCluster.get(cid);
    if (!searchIds || searchIds.size === 0) {
      return true;
    }
    const enr = enrByCluster.get(cid);
    for (const sid of searchIds) {
      const s = searchById.get(sid);
      if (!s) {
        continue;
      }
      // A no-criteria search admits the cluster unconditionally.
      if (!searchHasTargets(s) || clusterPassesSearch(s, enr)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * The "ranked queue" step of the review pipeline, shared by
 * `getNextReviewCard`, `getReviewQueue`, and the email digest.
 *
 * Returns the cluster ids the caller still has to swipe, ordered by
 * the v1 ranking rules (newest-first listing, cheapest-tiebreak), with
 * the current user's own already-swiped clusters removed. A skip is
 * personal — a partner's skip doesn't drop the cluster from your queue.
 * The caller hydrates whichever positions it needs.
 */
export function loadRankedQueueClusterIds(
  db: Db,
  householdId: string,
  currentUserId: string,
  filterSearchId?: string
): Promise<{
  clusterIds: string[];
  activeSearches: (typeof searches.$inferSelect)[];
}> {
  // Memoized per request: the `/` loader resolves the next card and the
  // queue in parallel and both compute this ranked queue — the heaviest
  // query on the page. The cache collapses that to a single pass.
  return requestMemo(
    `ranked-queue:${householdId}:${currentUserId}:${filterSearchId ?? "all"}`,
    () =>
      loadRankedQueueClusterIdsUncached(
        db,
        householdId,
        currentUserId,
        filterSearchId
      )
  );
}

async function loadRankedQueueClusterIdsUncached(
  db: Db,
  householdId: string,
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
        reviewableListingFilter()
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

  // Commute/transport filter: drop clusters that fall outside the
  // search's configured commute time or nearest-stop distance. No-op
  // (and no extra queries) when no active search has any such criteria.
  const ranked = await filterCandidatesByTargets(
    db,
    candidates,
    activeSearches
  );
  if (ranked.length === 0) {
    return { clusterIds: [], activeSearches };
  }

  // Independent reads — `db.batch` ships both in one HTTP request to Neon
  // (one subrequest), not two.
  const [mySwipes, deferred] = await db.batch([
    // The current user's own swipes — any outcome. A skip here hides the
    // card from *this* user only; a partner's skip is deliberately not
    // consulted, so the cluster stays visible to everyone who hasn't acted
    // on it yet (it just won't shortlist unless they also keep it).
    db
      .select({ clusterId: swipes.clusterId })
      .from(swipes)
      .where(
        and(
          eq(swipes.userId, currentUserId),
          inArray(swipes.clusterId, ranked)
        )
      ),
    // Household-wide defers: hide a cluster while its snooze is live. The
    // sweep deletes rows once deferUntil passes, but gate on time too so a
    // just-expired row never lingers in the queue exclusion.
    db
      .select({ clusterId: clusterDeferrals.clusterId })
      .from(clusterDeferrals)
      .where(
        and(
          eq(clusterDeferrals.householdId, householdId),
          gt(clusterDeferrals.deferUntil, sql`now()`),
          inArray(clusterDeferrals.clusterId, ranked)
        )
      ),
  ]);
  const mySwipedSet = new Set(mySwipes.map((s) => s.clusterId));
  const deferredSet = new Set(deferred.map((s) => s.clusterId));
  const clusterIds = ranked.filter(
    (cid) => !(mySwipedSet.has(cid) || deferredSet.has(cid))
  );

  return { clusterIds, activeSearches };
}
