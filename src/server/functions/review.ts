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
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  clusterDeferrals,
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
import {
  EPC_LETTER_RE,
  parseEnrichmentEpc,
  pickPortalEpcRating,
  resolveEpc,
} from "../../lib/epc";
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

/** Square metres → square feet (EPC floor areas are recorded in m²). */
const SQM_TO_SQFT = 10.7639;

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
   * Move-in date as ISO string, resolved from `available_from` (detail)
   * with a fallback to the "Available from <date>" summary tag; null when
   * unknown or when only "available immediately" is known (see
   * `availableNow`). A past/today date still means "now" — the UI decides.
   */
  availableFrom: string | null;
  /** True when the listing is flagged "available immediately/now". */
  availableNow: boolean;
  /** Furnishing status (detail blob, else summary tags); null = unknown. */
  furnished: FurnishedStatus | null;
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
  /**
   * The building's own EPC band (portal-published or an exact register
   * match), or undefined when neither is known — we never surface a
   * postcode-level estimate. See `src/lib/epc.ts`.
   */
  epcRating?: string;
  /** Soonest commute target, in minutes, when enriched. */
  commuteMinutes: number | null;
  /** Closest scraped station (with derived walk minutes). */
  nearestStation: ReviewCardStation | null;
  broadband: ReviewCardBroadband | null;
  /** Council tax band (A–H) published on the headline listing; null if unknown. */
  councilTaxBand: string | null;
  /** Coarse property kind for the queue's Type facet. */
  propertyKind: PropertyKind;
  /**
   * Total floor area from the EPC certificate, in sq ft — the fallback for the
   * "Size" stat when no portal published `sizeSqFt`. Null when the EPC carries
   * no floor area (or the listing isn't EPC-enriched yet).
   */
  epcFloorAreaSqFt: number | null;
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
  /**
   * Relative-time strings computed ON THE SERVER so SSR and the first
   * client render agree (computing `Date.now()` during render would
   * diverge and trip React's hydration check). The card consumes these
   * directly instead of recomputing.
   *
   *   - `firstSeenLabel`: e.g. "today" / "yesterday" / "2 days ago"
   *     (no "Listed" prefix — caller composes the line). Based on the
   *     portal's `publishedAt` when present, else our `firstSeenAt`.
   *   - `freshnessLabel`: e.g. "New · 4 hr" / "New · 2 d", or null when
   *     the listing is older than the freshness window.
   */
  firstSeenLabel: string;
  freshnessLabel: string | null;
};

/**
 * "today" / "yesterday" / "N days ago" / "Nw ago" / "Nmo ago" from a
 * date, computed server-side. Mirrors the old client `relativeFirstSeen`
 * so the wording is unchanged — just deterministic now.
 */
function relativeFromNow(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * "New · 4 hr" / "New · 2 d" freshness badge, or null once the listing
 * is older than the 2-day window. Server-computed twin of the old
 * client `freshnessLabel` in `review-card.tsx`.
 */
function freshnessFromNow(date: Date): string | null {
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 0) {
    return null;
  }
  if (hours < 24) {
    return `New · ${Math.max(hours, 1)} hr`;
  }
  const days = Math.floor(hours / 24);
  if (days <= 2) {
    return `New · ${days} d`;
  }
  return null;
}

/** Coerce a possibly-string timestamp off the wire into a Date. */
function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

/** Enriched walk/transit minutes per station, from `enrich-station-routes`. */
type StationRouteRow = {
  name: string;
  walkMinutes: number | null;
  transitMinutes: number | null;
};

/** Map of station name → straight-line distance, from raw `nearestStations`. */
function stationDistanceByName(rawJson: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!rawJson || typeof rawJson !== "object") {
    return out;
  }
  const arr = (rawJson as Record<string, unknown>).nearestStations;
  if (!Array.isArray(arr)) {
    return out;
  }
  for (const s of arr) {
    if (!s || typeof s !== "object") {
      continue;
    }
    const name = typeof s.name === "string" ? s.name : "";
    const dist = typeof s.distanceMiles === "number" ? s.distanceMiles : null;
    if (name && dist !== null) {
      out.set(name, dist);
    }
  }
  return out;
}

/**
 * The station with the shortest enriched walk time (fall back to transit
 * when a route has only that leg). Returns null when no usable routes —
 * the caller drops to the scraped-distance heuristic.
 */
function pickNearestEnrichedStation(
  stationRoutes: unknown,
  distanceByName: Map<string, number>
): ReviewCardStation | null {
  if (!Array.isArray(stationRoutes)) {
    return null;
  }
  const rows: StationRouteRow[] = [];
  for (const r of stationRoutes) {
    if (!r || typeof r !== "object") {
      continue;
    }
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    if (!name) {
      continue;
    }
    const walk =
      typeof o.walkMinutes === "number" && Number.isFinite(o.walkMinutes)
        ? o.walkMinutes
        : null;
    const transit =
      typeof o.transitMinutes === "number" && Number.isFinite(o.transitMinutes)
        ? o.transitMinutes
        : null;
    if (walk === null && transit === null) {
      continue;
    }
    rows.push({ name, walkMinutes: walk, transitMinutes: transit });
  }
  if (rows.length === 0) {
    return null;
  }
  const effective = (r: StationRouteRow) =>
    r.walkMinutes ?? r.transitMinutes ?? Number.POSITIVE_INFINITY;
  const best = rows.reduce((a, b) => (effective(b) < effective(a) ? b : a));
  return {
    name: best.name,
    distanceMiles: distanceByName.get(best.name) ?? null,
    walkMinutes: best.walkMinutes ?? best.transitMinutes,
  };
}

/**
 * Lift the nearest station for the review-card headline. Prefers the
 * real walk minutes from `enrich-station-routes` (Google Routes) when
 * they've been computed, picking the station with the shortest walk;
 * falls back to the closest scraped station with a ~20 min/mile estimate
 * when the enrichment hasn't run (or the listing carries no station
 * routes). `rawJson.nearestStations` still supplies the distance label.
 */
function pickNearestStation(
  rawJson: unknown,
  stationRoutes?: unknown
): ReviewCardStation | null {
  const distanceByName = stationDistanceByName(rawJson);
  const enriched = pickNearestEnrichedStation(stationRoutes, distanceByName);
  if (enriched) {
    return enriched;
  }
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

function readDeposit(rawJson: unknown): number | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const v = (rawJson as Record<string, unknown>).deposit;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Furnishing status. The detail blob (`rawJson.furnished`, written by
 * `scrape-detail`) is authoritative but sparse — only ~a third of
 * headline listings have been detail-scraped. So we fall back to the
 * summary `tags`, where Zoopla/Rightmove put "Furnished" / "Unfurnished"
 * / "Part furnished" right on the card. Closed set; null = unknown.
 */
type FurnishedStatus = "furnished" | "unfurnished" | "part_furnished";
const PART_FURNISHED_RE = /^part[\s-]?furnished$/i;
const UNFURNISHED_RE = /^un\s*furnished$/i;
const FURNISHED_RE = /^furnished$/i;
function deriveFurnished(
  rawFurnished: unknown,
  tags: string[]
): FurnishedStatus | null {
  const fromDetail = normaliseFurnished(rawFurnished);
  if (fromDetail) {
    return fromDetail;
  }
  for (const tag of tags) {
    // Order matters: "Unfurnished" / "Part furnished" both contain the
    // substring "furnished", so test the qualified forms first.
    if (PART_FURNISHED_RE.test(tag)) {
      return "part_furnished";
    }
    if (UNFURNISHED_RE.test(tag)) {
      return "unfurnished";
    }
    if (FURNISHED_RE.test(tag)) {
      return "furnished";
    }
  }
  return null;
}

/** Coerce an arbitrary value (e.g. a JSONB `->>` extraction) to the closed set. */
function normaliseFurnished(v: unknown): FurnishedStatus | null {
  return v === "furnished" || v === "unfurnished" || v === "part_furnished"
    ? v
    : null;
}

/**
 * Move-in resolution. `available_from` (detail scrape) is authoritative
 * but sparse; the summary `tags` carry "Available immediately" /
 * "Available from <date>" for far more listings, so we parse those as a
 * fallback. Returns `{ iso, now }`: `now` is the "available immediately"
 * case (no date), `iso` an absolute date the UI can format/compare.
 */
const AVAIL_IMMEDIATE_RE = /available\s+(?:immediately|now)/i;
const AVAIL_FROM_TAG_RE = /available\s+from\s+(.+)/i;
function resolveAvailability(
  column: Date | string | null,
  tags: string[]
): { iso: string | null; now: boolean } {
  if (column) {
    const d = column instanceof Date ? column : new Date(column);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString(), now: false };
    }
  }
  for (const tag of tags) {
    if (AVAIL_IMMEDIATE_RE.test(tag)) {
      return { iso: null, now: true };
    }
    const m = tag.match(AVAIL_FROM_TAG_RE);
    if (m?.[1]) {
      const d = new Date(m[1].trim());
      if (!Number.isNaN(d.getTime())) {
        return { iso: d.toISOString(), now: false };
      }
    }
  }
  return { iso: null, now: false };
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

/** JS twin of {@link listingMatchesBedroomBand} for already-fetched rows. */
function bedroomsWithinBand(
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
  house_share: "house\\s*share|room\\s+in\\s+a?\\s*shared",
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

/** JS twin of {@link listingPassesExclusions} for already-fetched rows. */
function passesExclusions(
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

/** Coarse property kind for the review-queue Type facet. */
export type PropertyKind = "flat" | "house" | "studio" | "share" | "other";

const HOUSE_SHARE_RE = new RegExp(EXCLUSION_PATTERNS.house_share, "i");
const STUDIO_RE = /studio/i;
const FLAT_RE = /\b(?:flat|apartment|maisonette)\b/i;
const HOUSE_RE =
  /\b(?:house|bungalow|cottage|terrace[d]?|detached|semi|mews|town\s*house)\b/i;

/**
 * Bucket a listing into a coarse kind for the queue's Type filter. Shares
 * are detected with the same pattern the exclusions backstop uses (see
 * {@link EXCLUSION_PATTERNS}) so an ad-hoc "hide shares" toggle and the
 * search-level `house_share` exclusion classify identically. Tested
 * share → studio → flat → house so the specific labels win over a generic
 * "house" hiding in the title.
 */
export function classifyPropertyKind(
  propertyType: string | null,
  title: string
): PropertyKind {
  const hay = `${propertyType ?? ""} ${title}`;
  if (HOUSE_SHARE_RE.test(hay)) {
    return "share";
  }
  if (STUDIO_RE.test(hay)) {
    return "studio";
  }
  if (FLAT_RE.test(hay)) {
    return "flat";
  }
  if (HOUSE_RE.test(hay)) {
    return "house";
  }
  return "other";
}

/**
 * Approximate minutes-per-mile by travel mode, used to turn a transport
 * target's `maxMinutes` into a reachable straight-line distance. The
 * commute filter has real Google Routes times (`commuteMinutes`) so it's
 * exact; transport targets have only the stop's distance, so this is the
 * honest best-effort — documented as a heuristic, not a routed time.
 */
const MIN_PER_MILE: Record<string, number> = {
  walk: 20,
  cycle: 5,
  transit: 6,
  drive: 4,
};

/** Map a transport target's amenity onto a `nearbyTransit` kind. */
const AMENITY_KIND: Record<string, "tube" | "rail" | "tram" | "bus"> = {
  tube_station: "tube",
  train_station: "rail",
  bus_stop: "bus",
  tram_stop: "tram",
};

type ClusterTargetEnrichment = {
  commuteMinutes: Record<string, number> | null;
  nearbyTransit: Array<{
    kind: string | null;
    distanceMiles: number;
    /** Real routed walk minutes (Google), when computed for this stop. */
    walkMinutes?: number | null;
  }> | null;
};

type ActiveSearch = typeof searches.$inferSelect;

/**
 * Smallest reachable minutes to a `nearbyTransit` stop of `kind` — the
 * real routed walk time (`walkMinutes`, Google) when present, else the
 * straight-line {@link MIN_PER_MILE} heuristic. `Infinity` when the
 * cluster carries no stop of that kind.
 */
function bestStopMinutes(
  stops: NonNullable<ClusterTargetEnrichment["nearbyTransit"]>,
  kind: string,
  mode: string
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const s of stops) {
    if (s.kind !== kind) {
      continue;
    }
    const minutes =
      typeof s.walkMinutes === "number"
        ? s.walkMinutes
        : s.distanceMiles * (MIN_PER_MILE[mode] ?? 20);
    if (minutes < best) {
      best = minutes;
    }
  }
  return best;
}

/** True when a search carries any commute/transport criteria to filter on. */
function searchHasTargets(s: ActiveSearch): boolean {
  return (
    (Array.isArray(s.commuteTargets) && s.commuteTargets.length > 0) ||
    (Array.isArray(s.transportTargets) && s.transportTargets.length > 0)
  );
}

/**
 * Does a cluster satisfy one search's commute + transport criteria?
 *
 *   - Commute: every target whose Google-Routes time is known must be
 *     within `maxMinutes`. A target with no computed time yet is treated
 *     as passing (enrichment pending — we don't drop a place for not yet
 *     being measured), mirroring the null-edge convention elsewhere.
 *   - Transport: targets are OR-ed — the cluster passes if at least one
 *     requested stop kind is within `maxMinutes`, using the stop's real
 *     routed walk time (`walkMinutes`, Google) when present and the
 *     straight-line {@link MIN_PER_MILE} heuristic only as a fallback. A
 *     swept cluster within reach of none of the kinds fails; one not yet
 *     swept (`nearbyTransit` absent) passes (pending).
 */
function clusterPassesSearch(
  search: ActiveSearch,
  enr: ClusterTargetEnrichment | undefined
): boolean {
  for (const t of search.commuteTargets ?? []) {
    const max = typeof t.maxMinutes === "number" ? t.maxMinutes : null;
    if (max === null) {
      continue;
    }
    const minutes = enr?.commuteMinutes?.[t.label];
    if (typeof minutes === "number" && minutes > max) {
      return false;
    }
  }
  // Transport targets are OR-ed: the cluster passes if it's within reach
  // of AT LEAST ONE requested stop kind (e.g. "tube OR train"). Pending
  // until swept — an absent `nearbyTransit` doesn't drop the cluster.
  const transportTargets = (search.transportTargets ?? []).filter(
    (t) => Boolean(AMENITY_KIND[t.amenity]) && typeof t.maxMinutes === "number"
  );
  const stops = enr?.nearbyTransit;
  if (transportTargets.length > 0 && stops) {
    const anyWithinReach = transportTargets.some((t) => {
      const kind = AMENITY_KIND[t.amenity];
      return kind
        ? bestStopMinutes(stops, kind, t.mode) <= (t.maxMinutes as number)
        : false;
    });
    if (!anyWithinReach) {
      return false;
    }
  }
  return true;
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
        listingWithinSearchBand(),
        listingMatchesBedroomBand(),
        listingPassesExclusions()
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

  const [mySwipes, householdSkips, deferred] = await Promise.all([
    db
      .select({ clusterId: swipes.clusterId })
      .from(swipes)
      .where(
        and(
          eq(swipes.userId, currentUserId),
          inArray(swipes.clusterId, ranked)
        )
      ),
    db
      .select({ clusterId: swipes.clusterId })
      .from(swipes)
      .where(
        and(
          inArray(swipes.userId, memberUserIds),
          eq(swipes.outcome, "skip"),
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
  const skipSet = new Set(householdSkips.map((s) => s.clusterId));
  const deferredSet = new Set(deferred.map((s) => s.clusterId));
  const clusterIds = ranked.filter(
    (cid) => !(mySwipedSet.has(cid) || skipSet.has(cid) || deferredSet.has(cid))
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

    // Read-time guard: only consider listings within their own search's
    // band on price, beds, and category exclusions — so the headline (and
    // "ALSO ON" set derived from it) can't be an out-of-band listing even
    // when the cluster qualified via a sibling that IS in band. Mirrors
    // the scrape-side filters in `scrape-portal.ts`.
    const bandBySearchId = new Map(
      activeSearches.map(
        (s) =>
          [
            s.id,
            {
              minPrice: s.minPrice,
              maxPrice: s.maxPrice,
              minBedrooms: s.minBedrooms,
              maxBedrooms: s.maxBedrooms,
              exclusions: s.exclusions,
            },
          ] as const
      )
    );
    const inBandListings = clusterListings.filter((l) => {
      const band = l.searchId ? bandBySearchId.get(l.searchId) : undefined;
      if (!band) {
        return true;
      }
      return (
        priceWithinBand(l.priceMonthly, band.minPrice, band.maxPrice) &&
        bedroomsWithinBand(l.bedrooms, band.minBedrooms, band.maxBedrooms) &&
        passesExclusions(l.propertyType, l.title, band.exclusions)
      );
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

    const headlineTags = readTags(headline.rawJson);
    const headlineAvailability = resolveAvailability(
      headline.availableFrom,
      headlineTags
    );

    // EPC: prefer the building's own band published on any listing in the
    // cluster over the postcode-level estimate, via the shared resolver —
    // the listing-detail page resolves it identically (see `src/lib/epc.ts`).
    const enrichmentEpc = parseEnrichmentEpc(enrichment?.epc);
    const epc = resolveEpc(pickPortalEpcRating(sortedListings), enrichmentEpc);
    // EPC floor area (m²) → sq ft, used when the portal didn't publish a size.
    const epcFloorAreaSqFt =
      enrichmentEpc?.floorAreaSqM != null
        ? Math.round(enrichmentEpc.floorAreaSqM * SQM_TO_SQFT)
        : null;

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
        availableFrom: headlineAvailability.iso,
        availableNow: headlineAvailability.now,
        furnished: deriveFurnished(
          (headline.rawJson as Record<string, unknown> | null)?.furnished,
          headlineTags
        ),
        tags: headlineTags,
        sizeSqFt: headline.sizeSqFt,
        floorplanUrl: readFloorplanUrl(headline.rawJson),
        listedBuilding: readBool(headline.rawJson, "listedBuilding"),
        floodDisclosure: readFloodDisclosureForBadges(headline.rawJson),
      },
      portalsAlsoOn,
      // Strip generic-noise highlights/watchouts via the shared filter
      // (`src/lib/ai/feature-filter.ts`). The persisted v2.0.0 rows
      // are still full of bills-not-included, restated specs, etc.;
      // this drops them at read time without re-running AI. Pass the
      // deposit + monthly rent so the filter can also drop hallucinated
      // "deposit above legal cap" watchouts that contradict the actual
      // arithmetic.
      features: filterFeatures(asFeatures(enrichment?.features), {
        deposit: readDeposit(headline.rawJson),
        priceMonthly: headline.priceMonthly,
      }),
      // EPC comes from the shared resolver above (`resolveEpc`), which prefers
      // a listing's published band over the postcode-level estimate — this
      // supersedes main's `asEpcRating`/`isEpcEstimate` helpers.
      epcRating: epc?.rating,
      commuteMinutes: pickSoonestCommute(enrichment?.commuteMinutes),
      nearestStation: pickNearestStation(
        headline.rawJson,
        enrichment?.stationRoutes
      ),
      broadband: asBroadband(enrichment?.broadband),
      councilTaxBand: headline.councilTaxBand ?? null,
      propertyKind: classifyPropertyKind(headline.propertyType, headline.title),
      epcFloorAreaSqFt,
      leftToday: clusterIds.length,
      searchId: headline.searchId ?? "",
      searchPill,
      firstSeenLabel: relativeFromNow(
        asDate(headline.publishedAt) ?? asDate(headline.firstSeenAt) ?? new Date()
      ),
      freshnessLabel: freshnessFromNow(
        asDate(headline.publishedAt) ?? asDate(headline.firstSeenAt) ?? new Date()
      ),
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
  addressRaw: string;
  outcode: string;
  bedrooms: number | null;
  bathrooms: number | null;
  priceMonthly: number | null;
  /** Move-in date as ISO string; null = unknown or "available immediately". */
  availableFrom: string | null;
  /** True when the listing is flagged "available immediately/now". */
  availableNow: boolean;
  /** Furnishing status; null = unknown. */
  furnished: FurnishedStatus | null;
  /** Coarse property kind for the queue's Type facet. */
  propertyKind: PropertyKind;
  /** Council tax band letter (typically A–H); null = unknown. */
  councilTaxBand: string | null;
  /** Resolved EPC band letter (A–G), building-specific; null = unknown. */
  epcBand: string | null;
  /** Best-case commute minutes across the search's targets; null = no enrichment yet. */
  commuteMinutes: number | null;
  /** Gigabit/FTTP available at the postcode; null = unknown (no enrichment). */
  fttp: boolean | null;
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
      addressRaw: listings.addressRaw,
      postcode: listings.postcode,
      bedrooms: listings.bedrooms,
      bathrooms: listings.bathrooms,
      priceMonthly: listings.priceMonthly,
      propertyType: listings.propertyType,
      councilTaxBand: listings.councilTaxBand,
      availableFrom: listings.availableFrom,
      // Furnishing + availability live in the detail blob / summary tags,
      // not columns — pull just those bits out of JSONB rather than
      // hauling the whole rawJson per queue row. `tags` backstops the
      // sparse detail-scrape fields (see `deriveFurnished`/`resolveAvailability`).
      // `epcRating` is the portal-published band, scanned across the cluster
      // (OpenRent never publishes one) for the EPC facet.
      furnished: sql<string | null>`${listings.rawJson}->>'furnished'`,
      tags: sql<string[] | null>`${listings.rawJson}->'tags'`,
      epcRating: sql<string | null>`${listings.rawJson}->>'epcRating'`,
    })
    .from(listings)
    .innerJoin(searches, eq(listings.searchId, searches.id))
    .where(
      and(
        inArray(listings.clusterId, upcomingClusterIds),
        inArray(listings.searchId, activeSearchIds),
        listingWithinSearchBand(),
        listingMatchesBedroomBand(),
        listingPassesExclusions()
      )
    );

  // Portal-published EPC band — first usable A–G letter on any listing in
  // the cluster (mirrors `pickPortalEpcRating`; OpenRent never publishes one).
  const portalEpcOf = (raw: string | null): string | null => {
    const letter = (raw ?? "").trim().toUpperCase();
    return EPC_LETTER_RE.test(letter) ? letter : null;
  };

  type GroupedCluster = {
    headline: (typeof rows)[number];
    portals: Set<string>;
    portalEpc: string | null;
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
        portalEpc: portalEpcOf(row.epcRating),
      });
      continue;
    }
    existing.portals.add(row.portal);
    existing.portalEpc = existing.portalEpc ?? portalEpcOf(row.epcRating);
    if (isCheaper(row.priceMonthly, existing.headline.priceMonthly)) {
      existing.headline = row;
    }
  }

  const headlineListingIds = Array.from(grouped.values()).map(
    (g) => g.headline.id
  );
  const [photoByListingId, enrichmentByListingId] = await Promise.all([
    loadFirstPhotoByListing(db, headlineListingIds),
    loadHeadlineEnrichments(db, headlineListingIds),
  ]);

  return upcomingClusterIds
    .map((clusterId): ReviewQueueItem | null => {
      const g = grouped.get(clusterId);
      if (!g) {
        return null;
      }
      const headlineTags = Array.isArray(g.headline.tags)
        ? g.headline.tags.filter((t): t is string => typeof t === "string")
        : [];
      const headlineAvail = resolveAvailability(
        g.headline.availableFrom,
        headlineTags
      );
      const enr = enrichmentByListingId.get(g.headline.id);
      const epc = resolveEpc(g.portalEpc, parseEnrichmentEpc(enr?.epc));
      return {
        clusterId,
        searchId: g.headline.searchId ?? "",
        headlineListingId: g.headline.id,
        title: g.headline.title,
        addressRaw: g.headline.addressRaw,
        outcode: outcodeOf(g.headline.postcode),
        bedrooms: g.headline.bedrooms,
        bathrooms: g.headline.bathrooms,
        priceMonthly: g.headline.priceMonthly,
        availableFrom: headlineAvail.iso,
        availableNow: headlineAvail.now,
        furnished: deriveFurnished(g.headline.furnished, headlineTags),
        propertyKind: classifyPropertyKind(
          g.headline.propertyType,
          g.headline.title
        ),
        councilTaxBand: g.headline.councilTaxBand ?? null,
        epcBand: epc?.rating ?? null,
        commuteMinutes: pickSoonestCommute(enr?.commuteMinutes),
        fttp: enr?.broadband ? enr.broadband.fttpAvailable === true : null,
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
 * The latest enrichment per headline listing — just the bits the queue
 * facets need (EPC / commute / broadband). Mirrors the card's "greatest
 * prompt_version wins" rule (see `getNextReviewCard`) by ordering desc and
 * keeping the first row seen per listing. Second round-trip, same pattern
 * as {@link loadFirstPhotoByListing}, so the main grouped query stays lean.
 */
async function loadHeadlineEnrichments(
  db: Db,
  listingIds: string[]
): Promise<
  Map<
    string,
    {
      epc: typeof enrichments.$inferSelect.epc;
      commuteMinutes: typeof enrichments.$inferSelect.commuteMinutes;
      broadband: typeof enrichments.$inferSelect.broadband;
    }
  >
> {
  const out = new Map<
    string,
    {
      epc: typeof enrichments.$inferSelect.epc;
      commuteMinutes: typeof enrichments.$inferSelect.commuteMinutes;
      broadband: typeof enrichments.$inferSelect.broadband;
    }
  >();
  if (listingIds.length === 0) {
    return out;
  }
  const rows = await db
    .select({
      listingId: enrichments.listingId,
      epc: enrichments.epc,
      commuteMinutes: enrichments.commuteMinutes,
      broadband: enrichments.broadband,
    })
    .from(enrichments)
    .where(inArray(enrichments.listingId, listingIds))
    .orderBy(desc(enrichments.promptVersion));
  for (const r of rows) {
    if (!out.has(r.listingId)) {
      out.set(r.listingId, {
        epc: r.epc,
        commuteMinutes: r.commuteMinutes,
        broadband: r.broadband,
      });
    }
  }
  return out;
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
