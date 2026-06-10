/**
 * Per-portal scrape task.
 *
 * Fans out from `scrape-search` (one child run per portal listed on a
 * search). For the search's `location`:
 *
 *   1. Read the cached portal ref from `search.location.portalRefs[portal]`
 *      (resolved at save time in `src/server/functions/searches.ts`).
 *      If the ref is missing — degenerate-backfill row from migration
 *      0010 or a stale row whose resolver failed — log and return zero
 *      listings cleanly.
 *   2. Build the portal-specific search URL via `src/lib/portal-urls.ts`.
 *   3. Pull the page through Zyte (browser tier for Rightmove + Zoopla,
 *      plain HTTP for OpenRent).
 *   4. Parse the page with the matching `parseXSearch` from
 *      `src/lib/parsers/`.
 *   5. Drop any listing matched by an entry in `search.excludeLocations`
 *      — postcode-prefix for postal_code excludes, lat/lng-in-bounds
 *      for other types. See `filterByExcludeLocations`.
 *   6. Upsert each `ListingSummary` into `listings` keyed on
 *      `(search_id, portal, portal_listing_id)`. New rows get
 *      `first_seen_at = NOW()`; existing rows just bump `last_seen_at`.
 *
 * A `scrape_runs` row tracks the entire portal run. We INSERT it with
 * `status='running'` at the top of `run`, then `onSuccess` / `onFailure`
 * finalise it with the totals (or the error message). The run ID is
 * passed through the task output so the lifecycle hooks can find it
 * without needing extra state on `ctx`.
 *
 * Detail-page scraping is deliberately NOT done here — PR 5 (clustering)
 * dispatches per-listing detail fetches for the IDs we mark as new. PR 4
 * is search-page-only.
 */

import { logger, task } from "@trigger.dev/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { findCadenceByCron } from "../lib/cron-presets";
import {
  parseOpenrentDetail,
  parseOpenrentPropertyIds,
  parseRightmoveSearch,
  parseZooplaSearch,
} from "../lib/parsers";
import type { ListingSummary, Portal } from "../lib/parsers/types";
import {
  type Exclusion,
  type MustHave,
  RIGHTMOVE_MAX_PAGES,
  RIGHTMOVE_RESULTS_PER_PAGE,
  ZOOPLA_MAX_PAGES,
  ZOOPLA_RESULTS_PER_PAGE,
  openrentSearchUrl,
  rightmoveSearchUrl,
  zooplaAddedFromDays,
  zooplaSearchUrl,
} from "../lib/portal-urls";
import { listingMatchesPropertyTypes } from "../lib/property-kind";
import { storeRawHtml } from "../lib/raw-html";
import { findScheduleByExternalId } from "../lib/schedule-lookup.server";
import {
  type SearchLocation,
  asPortalRefArray,
  deselectedOutcodes,
} from "../lib/search-location";
import { PORTAL_COST_USD, zyteFetch } from "../lib/zyte";
import { clusterTask } from "./cluster";
import { scrapeQueue } from "./queues";

/**
 * Scrape mode:
 *   - `incremental` (default): the daily/scheduled sweep — applies the
 *     cadence recency window (Rightmove `maxDaysSinceAdded`, Zoopla
 *     `added`) and caps OpenRent to the newest unseen IDs, then paginates
 *     within that small window. Cheap, runs every cadence tick.
 *   - `backfill`: the on-demand "Backfill now" run — drops the recency
 *     window and paginates to each portal's hard cap, and ingests every
 *     unseen OpenRent ID. Expensive; run deliberately.
 */
export type ScrapeMode = "incremental" | "backfill";

export type ScrapePortalPayload = {
  searchId: string;
  portal: Portal;
  /** Defaults to `incremental` when omitted. */
  mode?: ScrapeMode;
};

export type ScrapePortalOutput = {
  runId: string;
  costUsd: number;
  listingsFound: number;
  newListings: number;
  /** R2 key for the gzipped raw HTML; `null` when uploads were skipped or all failed. */
  rawKey: string | null;
};

function getZyteKey(): string {
  const key = process.env.ZYTE_API_KEY;
  if (!key) {
    throw new Error("ZYTE_API_KEY not set in the Trigger.dev worker env");
  }
  return key;
}

type SearchFilters = {
  minBedrooms: number | null;
  maxBedrooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  propertyTypes: string[];
  /** "furnished" | "unfurnished" | null — the two-valued search filter. */
  furnished: "furnished" | "unfurnished" | null;
  mustHaves: MustHave[];
  exclusions: Exclusion[];
  /** User-picked radius in miles. `0` = "this area only". */
  radiusMiles: number;
};

// NOTE on bathrooms: deliberately NOT threaded into the search URLs.
// Bathroom counts are missing on a large fraction of listings (~10% null
// + portals' "0" sentinel), and a portal `baths_min` treats a *missing*
// count as a non-match — so sending it would drop valid 3-bed flats that
// simply don't state bathrooms. We enforce the bathroom band at read time
// instead (queue-targets / review.ts), where the keep-null convention
// passes unknowns and only drops listings with a KNOWN sub-minimum count.

/**
 * One per-outcode scrape target. `makeUrl(page)` builds the URL for a
 * given page — `page` is a 0-based page index that each portal maps to
 * its own scheme (Rightmove `index = page * 24`, Zoopla `pn = page + 1`,
 * OpenRent ignores it: the single search page already lists every ID).
 * `recencyWindowDays` is the cadence window the URL was built with
 * (undefined in backfill mode) — surfaced for logging only.
 */
type ScrapeTarget = {
  label: string;
  makeUrl: (page: number) => string;
};

/**
 * Build the per-outcode scrape targets for this portal. One target for
 * postal_code locations (the historical single-ref path) and N for area
 * locations (one per covering outcode). Empty array means the portal has
 * no usable refs — the caller logs and skips the scrape.
 *
 * `windowDays` is the recency cap (cadence-derived) applied to the URL —
 * Rightmove `maxDaysSinceAdded`, Zoopla `added`. `undefined` (backfill)
 * omits the filter so pagination reaches the portal's full depth.
 */
function buildSearchTargets(
  portal: Portal,
  location: SearchLocation,
  search: SearchFilters,
  windowDays: number | undefined
): ScrapeTarget[] {
  const filters = {
    minBedrooms: search.minBedrooms,
    maxBedrooms: search.maxBedrooms,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    propertyTypes: search.propertyTypes,
    furnished: search.furnished,
    mustHaves: search.mustHaves,
    exclusions: search.exclusions,
    radiusMiles: search.radiusMiles,
  };
  if (portal === "rightmove") {
    const refs = asPortalRefArray(location.portalRefs.rightmove);
    return refs.map((ref) => ({
      label: extractOutcodeLabel(ref.locationIdentifier) ?? location.name,
      makeUrl: (page: number) =>
        rightmoveSearchUrl({
          locationIdentifier: ref.locationIdentifier,
          ...filters,
          maxDaysSinceAdded: windowDays,
          index: page * RIGHTMOVE_RESULTS_PER_PAGE,
        }),
    }));
  }
  if (portal === "zoopla") {
    const refs = asPortalRefArray(location.portalRefs.zoopla);
    const added = zooplaAddedFromDays(windowDays);
    return refs.map((ref) => ({
      label: ref.q,
      makeUrl: (page: number) =>
        zooplaSearchUrl({ q: ref.q, ...filters, pn: page + 1, added }),
    }));
  }
  const refs = asPortalRefArray(location.portalRefs.openrent);
  return refs.map((ref) => ({
    label: ref.term,
    // OpenRent ignores `page` — the single search page embeds every ID.
    makeUrl: () => openrentSearchUrl({ term: ref.term, ...filters }),
  }));
}

/**
 * Pull the bare outcode out of a Rightmove `OUTCODE^…` ref so the R2
 * scope and log lines name the actual outcode instead of "Camden-1"
 * style indices. Returns null for `REGION^…` refs (the legacy
 * single-ref non-postcode path) or anything else unparseable.
 */
const OUTCODE_REF_RE = /^OUTCODE\^(.+)$/;

function extractOutcodeLabel(locationIdentifier: string): string | null {
  const m = locationIdentifier.match(OUTCODE_REF_RE);
  return m?.[1] ?? null;
}

/**
 * Mirror the sanitisation `storeRawHtml` applies to the scope segment
 * — used here to keep the per-outcode log label and the on-disk key
 * fragment in lock-step.
 */
function sanitiseScopeFragment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Stable, human-scannable scope string for the R2 raw-html key.
 * Slugifies the place name; falls back to the Google placeId when the
 * slug ends up empty (non-ASCII names, exotic punctuation, etc.).
 */
function rawKeyScope(location: SearchLocation): string {
  const slug = location.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || location.placeId || "unknown";
}

/**
 * Parse a Rightmove/Zoopla search-results page to summaries. OpenRent is
 * NOT handled here — it uses the ID-diff path (`parseOpenrentPropertyIds`
 * + per-ID detail fetch) rather than parsing search cards, because its
 * page renders only ~20 cards and exposes the full set as `PROPERTYIDS`.
 */
function parseSearchPage(portal: "rightmove" | "zoopla", html: string): ListingSummary[] {
  return portal === "rightmove"
    ? parseRightmoveSearch(html)
    : parseZooplaSearch(html);
}

/**
 * Per-run cap on OpenRent detail fetches. Incremental stays cheap and
 * within `maxDuration` by only taking the newest unseen IDs; backfill
 * goes deeper but is still bounded so one run can't run away — a huge
 * area may need the backfill re-run, which continues where it left off
 * (already-fetched IDs are now stored and skipped).
 *
 * The cap counts every detail page we FETCH, not just the ones that parse.
 * Backfill deliberately reaches old IDs, many of which are dead listings
 * that return an unparseable "listing gone" page — if those didn't consume
 * the budget the loop would walk the entire candidate set and blow past
 * `maxDuration`.
 */
const OPENRENT_DETAIL_CAP: Record<ScrapeMode, number> = {
  incremental: 40,
  backfill: 200,
};

/**
 * Wall-clock stop for the OpenRent detail loop. Each detail page is a full
 * Zyte browser render (seconds each), so even under the fetch cap a slow or
 * heavily-dead-listing backfill can approach the 600s `maxDuration`. We stop
 * cleanly well short of it — backfill resumes where it left off next run
 * (stored IDs are skipped), so an early stop loses no data.
 */
const OPENRENT_TIME_BUDGET_MS = 8 * 60 * 1000;

/**
 * How many OpenRent detail pages to fetch concurrently within a run. Zyte
 * rate-limits by requests-per-MINUTE rather than concurrency (and `fetchPage`
 * retries 429s with backoff), so a small fan-out multiplies how far one
 * backfill reaches inside {@link OPENRENT_TIME_BUDGET_MS} without raising the
 * caps, `maxDuration`, or the Zyte plan. Kept modest because the whole task
 * already shares the `scrape` queue's concurrency-10 ceiling — a bigger
 * fan-out here would just starve other scrapes.
 */
const OPENRENT_DETAIL_CONCURRENCY = 6;

/**
 * Fetch + parse a single OpenRent detail page into a summary, returning null
 * on a fetch or parse failure (a dead listing's "gone" page). Pulled out of
 * {@link scrapeOpenrentByIdDiff} so the batch loop stays readable — callers
 * count every call against the detail budget regardless of the outcome.
 */
async function fetchOpenrentDetailSummary(
  id: number,
  fetchPage: (url: string, storeScope: string | null) => Promise<string>
): Promise<ListingSummary | null> {
  const detailUrl = `https://www.openrent.co.uk/${id}`;
  let detailHtml: string;
  try {
    detailHtml = await fetchPage(detailUrl, null);
  } catch (err) {
    logger.warn("scrape-portal: OpenRent detail fetch failed", {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  try {
    const detail = parseOpenrentDetail(detailHtml);
    return {
      ...detail,
      portal: "openrent",
      portalListingId: String(id),
      url: detailUrl,
    };
  } catch (err) {
    logger.warn("scrape-portal: OpenRent detail parse failed", {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * OpenRent ingest by ID-diff. OpenRent has no recency filter and a
 * non-chronological page order, so we can't window it like RM/ZP. Instead
 * each outcode's search page embeds the COMPLETE set of matching IDs
 * (`PROPERTYIDS`); we diff that against the IDs already stored for this
 * search and fetch a DETAIL page only for genuinely new ones (newest
 * first — IDs are ~monotonic), bounded by {@link OPENRENT_DETAIL_CAP}.
 * Detail pages carry the title/address the summary needs (the search page
 * only renders ~20 cards), so new rows are created complete.
 */
async function scrapeOpenrentByIdDiff(deps: {
  db: ReturnType<typeof getDb>;
  searchId: string;
  mode: ScrapeMode;
  targets: ScrapeTarget[];
  fetchPage: (url: string, storeScope: string | null) => Promise<string>;
  ingest: (
    summaries: ListingSummary[],
    label: string,
    rawCount: number
  ) => Promise<{ keptPortalListingIds: Set<string> }>;
  scopeFor: (label: string) => string;
}): Promise<void> {
  const { db, searchId, mode, targets, fetchPage, ingest, scopeFor } = deps;

  // Skip an ID if we've already FETCHED a detail page for it — whether it
  // became a listing (`listings`) or was classified and rejected by the
  // filters (`openrent_seen_ids`). Both must be excluded or rejected IDs
  // (wrong beds/price/a share) would be re-fetched newest-first every run and
  // starve the detail budget before it reaches genuine matches deeper in the
  // unfiltered `PROPERTYIDS` list. The `listings` half also gracefully covers
  // matches stored before `openrent_seen_ids` existed (empty on first run).
  const [storedRows, seenRows] = await Promise.all([
    db
      .select({ pid: schema.listings.portalListingId })
      .from(schema.listings)
      .where(
        and(
          eq(schema.listings.searchId, searchId),
          eq(schema.listings.portal, "openrent")
        )
      ),
    db
      .select({ pid: schema.openrentSeenIds.portalListingId })
      .from(schema.openrentSeenIds)
      .where(eq(schema.openrentSeenIds.searchId, searchId)),
  ]);
  const storedIds = new Set<string>([
    ...storedRows.map((r) => r.pid),
    ...seenRows.map((r) => r.pid),
  ]);
  const processed = new Set<string>();
  let detailBudget = OPENRENT_DETAIL_CAP[mode];
  const startedAt = Date.now();
  let timedOut = false;

  for (const target of targets) {
    // A previous outcode hit the wall-clock stop — its summaries were
    // already ingested below, so just bail out of the remaining outcodes.
    if (timedOut) {
      break;
    }
    const html = await fetchPage(target.makeUrl(0), scopeFor(target.label));
    const ids = parseOpenrentPropertyIds(html);
    // New = not already stored and not handled earlier this run (outcode
    // radii overlap). Newest first.
    const candidates = ids
      .filter((id) => {
        const key = String(id);
        return !(storedIds.has(key) || processed.has(key));
      })
      .sort((a, b) => b - a);

    const summaries: ListingSummary[] = [];
    // Fetch detail pages in bounded-concurrency batches rather than one at a
    // time, so a backfill reaches far deeper inside the time budget. The
    // budget/clock are re-checked between batches, not mid-batch, so a run can
    // overshoot the wall-clock stop by at most one batch's render time — still
    // well short of `maxDuration`.
    for (let i = 0; i < candidates.length; i += OPENRENT_DETAIL_CONCURRENCY) {
      if (detailBudget <= 0) {
        logger.warn("scrape-portal: OpenRent detail budget exhausted", {
          searchId,
          outcode: target.label,
          mode,
        });
        break;
      }
      // Stop well short of `maxDuration`. Backfill resumes next run, so the
      // listings we haven't reached yet aren't lost — they're just deferred.
      if (Date.now() - startedAt > OPENRENT_TIME_BUDGET_MS) {
        logger.warn("scrape-portal: OpenRent time budget reached, stopping", {
          searchId,
          outcode: target.label,
          mode,
          elapsedMs: Date.now() - startedAt,
        });
        timedOut = true;
        break;
      }
      // Take a full batch, but never more than the remaining budget — every
      // fetch attempt consumes the budget (a dead listing's "gone" page is
      // just as slow as a success), so the slice size is what we spend.
      const batch = candidates.slice(
        i,
        i + Math.min(OPENRENT_DETAIL_CONCURRENCY, detailBudget)
      );
      detailBudget -= batch.length;
      for (const id of batch) {
        processed.add(String(id));
      }
      const batchSummaries = await Promise.all(
        batch.map((id) => fetchOpenrentDetailSummary(id, fetchPage))
      );
      for (const s of batchSummaries) {
        if (s) {
          summaries.push(s);
        }
      }
    }
    // Ingest whatever this outcode collected — including a partial batch
    // when we broke early on the time budget, so that work isn't wasted.
    const { keptPortalListingIds } = await ingest(
      summaries,
      target.label,
      ids.length
    );
    // Record every ID we fetched AND parsed this outcode so the next run skips
    // it — matched ones (now a `listings` row) and rejected ones alike. Fetch
    // /parse failures never reach `summaries`, so a transient block retries.
    await recordOpenrentSeen(db, searchId, summaries, keptPortalListingIds);
  }
}

/**
 * Persist the OpenRent IDs we fetched + parsed this run so a later run skips
 * them. `matched` records whether the ID survived the search filters (became a
 * `listings` row) — kept for observability only; both values are skipped.
 * Idempotent: re-seeing an ID is a no-op (the run already excludes stored IDs,
 * but a concurrent run or a re-list could race).
 */
async function recordOpenrentSeen(
  db: ReturnType<typeof getDb>,
  searchId: string,
  summaries: ListingSummary[],
  keptPortalListingIds: Set<string>
): Promise<void> {
  if (summaries.length === 0) {
    return;
  }
  await db
    .insert(schema.openrentSeenIds)
    .values(
      summaries.map((s) => ({
        searchId,
        portalListingId: s.portalListingId,
        matched: keptPortalListingIds.has(s.portalListingId),
      }))
    )
    .onConflictDoNothing({
      target: [
        schema.openrentSeenIds.searchId,
        schema.openrentSeenIds.portalListingId,
      ],
    });
}

/**
 * UK postcodes are `<outcode> <incode>` (e.g. "NW3 1AB"). The outcode is
 * everything before the first space, uppercased.
 */
function outcodeOf(postcode: string | undefined): string | null {
  if (!postcode) {
    return null;
  }
  const trimmed = postcode.trim().toUpperCase();
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function pointInBounds(
  lat: number,
  lng: number,
  bounds: NonNullable<SearchLocation["bounds"]>
): boolean {
  return (
    lat >= bounds.sw.lat &&
    lat <= bounds.ne.lat &&
    lng >= bounds.sw.lng &&
    lng <= bounds.ne.lng
  );
}

/**
 * Drop summaries that fall inside any excluded location:
 *
 *   - For postal_code excludes, match by postcode-prefix (works even
 *     when the listing has no lat/lng).
 *   - For other types, test the listing's lat/lng against the
 *     exclude's viewport bounds. Listings without coords AND without
 *     a matchable postcode survive — we'd rather show an unverifiable
 *     listing than silently drop it.
 *
 * Excludes without bounds (degenerate-backfill rows) only contribute
 * via the postcode-prefix path; if such an exclude isn't postal_code
 * typed there's nothing we can match on, so we skip it.
 */
export function filterByExcludeLocations(
  summaries: ListingSummary[],
  excludes: readonly SearchLocation[],
  include: SearchLocation
): ListingSummary[] {
  // Outcodes the user switched off on the include area count as excludes:
  // OpenRent's radius search pulls listings from them even though we never
  // query them directly (see `deselectedOutcodes`).
  const deselected = deselectedOutcodes(include);
  if (excludes.length === 0 && deselected.length === 0) {
    return summaries;
  }
  const excludeOutcodes = new Set([
    ...excludes
      .filter((e) => e.type === "postal_code")
      .map((e) => e.name.trim().toUpperCase()),
    ...deselected,
  ]);
  const boundsList = excludes
    .filter((e) => e.type !== "postal_code" && e.bounds !== null)
    .map((e) => e.bounds as NonNullable<SearchLocation["bounds"]>);

  return summaries.filter((s) => {
    const outcode = outcodeOf(s.postcode);
    if (outcode && excludeOutcodes.has(outcode)) {
      return false;
    }
    if (typeof s.lat === "number" && typeof s.lng === "number") {
      for (const b of boundsList) {
        if (pointInBounds(s.lat, s.lng, b)) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * Drop listings whose monthly price falls outside the search's band.
 *
 * Every portal accepts price params in its search URL, but they don't all
 * honour them — OpenRent in particular returns its full result set
 * regardless of `prices_min`/`prices_max` (a tight band and a wide band come
 * back identical). So we re-check server-side rather than trust the portal,
 * comparing against the same `price_monthly` we store and the user sees.
 *
 * Listings with an unknown price (the parser couldn't read one) are kept: we
 * can't prove they breach the band, and dropping them would lose valid
 * listings to a parse miss. `minPrice`/`maxPrice` are inclusive bounds.
 */
export function filterByPriceRange(
  summaries: ListingSummary[],
  minPrice: number | null,
  maxPrice: number | null
): ListingSummary[] {
  if (minPrice == null && maxPrice == null) {
    return summaries;
  }
  return summaries.filter((s) => {
    if (typeof s.priceMonthly !== "number") {
      return true;
    }
    if (minPrice != null && s.priceMonthly < minPrice) {
      return false;
    }
    if (maxPrice != null && s.priceMonthly > maxPrice) {
      return false;
    }
    return true;
  });
}

/**
 * Drop listings whose bedroom count falls outside the search's band.
 *
 * Same trust model as {@link filterByPriceRange}: portals advertise
 * `bedrooms_min`/`_max` (RM/ZP/OR all accept them) but OpenRent ignores
 * them in practice — N14 with `bedrooms_min=2` still returns 1-bed
 * flats, studios, and `Room in a Shared Flat`. We re-check against the
 * `bedrooms` we store; unknown bedrooms are kept so a parse miss doesn't
 * drop a real listing. Bounds are inclusive.
 */
export function filterByBedroomRange(
  summaries: ListingSummary[],
  minBedrooms: number | null,
  maxBedrooms: number | null
): ListingSummary[] {
  if (minBedrooms == null && maxBedrooms == null) {
    return summaries;
  }
  return summaries.filter((s) => {
    if (typeof s.bedrooms !== "number") {
      return true;
    }
    if (minBedrooms != null && s.bedrooms < minBedrooms) {
      return false;
    }
    if (maxBedrooms != null && s.bedrooms > maxBedrooms) {
      return false;
    }
    return true;
  });
}

/**
 * Title- and propertyType-based detector for "room in a shared X"
 * listings. OpenRent's parser writes `propertyType = "Room in a Shared
 * Flat"` / `"Room in a Shared House"`; Rightmove and Zoopla don't surface
 * a comparable string but their URL filter (`dontShow=houseShare` /
 * `is_shared_accommodation=false`) drops shares before we ever see them,
 * so a propertyType/title check is enough for defense-in-depth across
 * all three portals.
 */
const ROOM_TYPE_RE = /^room\b/i;
const SHARED_TYPE_RE = /\bshared\b/i;
const ROOM_IN_SHARED_RE = /^room in a shared\b/i;
const HOUSE_FLAT_SHARE_RE = /\b(?:house|flat)\s*share\b/i;
const SHARED_X_RE =
  /\bshared\s+(?:accommodation|flat|house|room|living|apartment)\b/i;
const HMO_RE = /\bhmo\b/i;

function looksLikeRoomShare(summary: ListingSummary): boolean {
  const propertyType = summary.propertyType ?? "";
  const title = summary.title ?? "";
  return (
    ROOM_TYPE_RE.test(propertyType) ||
    SHARED_TYPE_RE.test(propertyType) ||
    ROOM_IN_SHARED_RE.test(title) ||
    HOUSE_FLAT_SHARE_RE.test(title) ||
    SHARED_X_RE.test(title) ||
    HMO_RE.test(title)
  );
}

/**
 * Drop listings that fall into any category the user has excluded.
 *
 * Today this covers `house_share` only — `student` and `retirement` have
 * dedicated URL switches on every portal that does host those categories
 * (RM/ZP) and OpenRent doesn't host them at all, so the URL layer
 * already handles those two. Shares are the gap: OpenRent has no URL
 * switch (the platform comment in `portal-urls.ts` calling it a "no-op"
 * is wrong — OR DOES list rooms in shared houses, it just doesn't expose
 * a filter for them), and prod data shows ~18 such listings leaking into
 * the queue. This is the backstop.
 */
export function filterByExclusions(
  summaries: ListingSummary[],
  exclusions: readonly string[]
): ListingSummary[] {
  if (!exclusions.includes("house_share")) {
    return summaries;
  }
  return summaries.filter((s) => !looksLikeRoomShare(s));
}

/**
 * Drop listings whose type isn't in the search's `propertyTypes` filter.
 *
 * The portal URLs only partially enforce this: Rightmove honours
 * `propertyTypes`, Zoopla only on the path route (London outcodes),
 * OpenRent not at all. So a "house" search leaks flats from OpenRent and
 * from Zoopla's free-text fallback. This is the backstop — empty filter is
 * a no-op, and unclassifiable listings are kept (see
 * {@link listingMatchesPropertyTypes}).
 */
export function filterByPropertyType(
  summaries: ListingSummary[],
  propertyTypes: readonly string[]
): ListingSummary[] {
  if (propertyTypes.length === 0) {
    return summaries;
  }
  return summaries.filter((s) =>
    listingMatchesPropertyTypes(s.propertyType ?? null, s.title ?? "", propertyTypes)
  );
}

/**
 * The "mutable" subset of `listings` — every column we want refreshed
 * each time the same portal listing reappears in a search sweep.
 * `first_seen_at`, `id`, and the key columns (search/portal/portalListingId)
 * deliberately stay out of this and never get touched on conflict.
 */
function mutableListingFields(summary: ListingSummary) {
  return {
    url: summary.url,
    title: summary.title,
    addressRaw: summary.addressRaw,
    postcode: summary.postcode ?? null,
    bedrooms: summary.bedrooms ?? null,
    bathrooms: summary.bathrooms ?? null,
    priceMonthly: summary.priceMonthly ?? null,
    propertyType: summary.propertyType ?? null,
    lat: summary.lat?.toString() ?? null,
    lng: summary.lng?.toString() ?? null,
  };
}

async function findExistingIds(
  db: ReturnType<typeof getDb>,
  searchId: string,
  portal: Portal,
  portalListingIds: string[]
): Promise<Set<string>> {
  const rows = await db
    .select({ portalListingId: schema.listings.portalListingId })
    .from(schema.listings)
    .where(
      and(
        eq(schema.listings.searchId, searchId),
        eq(schema.listings.portal, portal),
        inArray(schema.listings.portalListingId, portalListingIds)
      )
    );
  return new Set(rows.map((r) => r.portalListingId));
}

/**
 * Upsert one outcode's worth of listings. Returns the count of rows that
 * were INSERTed (not updated) so the caller can populate
 * `scrape_runs.new_listings`.
 *
 * Also returns the set of (search, portal, portalListingId) tuples that
 * existed before this upsert, so the caller can re-query the listings
 * rows for the upsert-touched portal IDs and pick up `listings.id` +
 * `cluster_id` in one pass. We need the IDs (not just counts) to fan out
 * to the clustering task downstream.
 */
async function upsertListings(
  db: ReturnType<typeof getDb>,
  searchId: string,
  portal: Portal,
  summaries: ListingSummary[]
): Promise<{
  totalSeen: number;
  newCount: number;
  /** All portal listing IDs from this batch — used by the caller to fetch ids/clusterIds. */
  touchedPortalListingIds: string[];
}> {
  if (summaries.length === 0) {
    return { totalSeen: 0, newCount: 0, touchedPortalListingIds: [] };
  }

  // Find which (search, portal, portalListingId) tuples already exist —
  // that tells us which inserts are "new" vs "already seen".
  const existingIds = await findExistingIds(
    db,
    searchId,
    portal,
    summaries.map((s) => s.portalListingId)
  );

  let newCount = 0;
  for (const summary of summaries) {
    if (!existingIds.has(summary.portalListingId)) {
      newCount += 1;
    }
  }

  // Single bulk upsert. ON CONFLICT refreshes mutable fields + bumps
  // last_seen_at without touching first_seen_at. The unique index
  // `listings_search_portal_listing_id_uniq` is the conflict target.
  const rows = summaries.map((summary) => ({
    id: nanoid(),
    portal,
    portalListingId: summary.portalListingId,
    searchId,
    ...mutableListingFields(summary),
    rawJson: summary as unknown as Record<string, unknown>,
  }));
  await db
    .insert(schema.listings)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        schema.listings.searchId,
        schema.listings.portal,
        schema.listings.portalListingId,
      ],
      set: {
        // url/title/addressRaw/price legitimately mutate between scrapes
        // (price drops, agent re-titles) — overwrite outright.
        url: sql`excluded.url`,
        title: sql`excluded.title`,
        addressRaw: sql`excluded.address_raw`,
        priceMonthly: sql`excluded.price_monthly`,
        // Fields that don't change for a given listing but that some portal
        // search summaries omit (OpenRent never has lat/lng at search-tier,
        // Zoopla often misses lat/lng/bedrooms). Coalesce so a null in the
        // search summary can't wipe a value scrape-detail filled in.
        postcode: sql`COALESCE(excluded.postcode, listings.postcode)`,
        bedrooms: sql`COALESCE(excluded.bedrooms, listings.bedrooms)`,
        bathrooms: sql`COALESCE(excluded.bathrooms, listings.bathrooms)`,
        propertyType: sql`COALESCE(excluded.property_type, listings.property_type)`,
        lat: sql`COALESCE(excluded.lat, listings.lat)`,
        lng: sql`COALESCE(excluded.lng, listings.lng)`,
        lastSeenAt: sql`NOW()`,
      },
    });

  return {
    totalSeen: summaries.length,
    newCount,
    touchedPortalListingIds: summaries.map((s) => s.portalListingId),
  };
}

/**
 * Pull the `listings.id` values for every (search, portal, portalListingId)
 * that this run upserted whose `cluster_id` is still NULL. These are the
 * listings the clustering task needs to process — either freshly inserted
 * by this run, or rows from a previous run that for whatever reason never
 * got clustered (failed cluster task, normalisation rule changed, etc.).
 *
 * We deliberately scope the search-id filter as well: a single physical
 * listing can appear under two searches and each gets its own
 * `listings.id`. Both need clustering, and both should fan out
 * independently — they don't share cluster_id rows automatically, only
 * after `findOrCreateCluster` resolves them to the same `property_clusters`
 * row by normalised address.
 */
async function loadListingIdsToCluster(
  db: ReturnType<typeof getDb>,
  searchId: string,
  portal: Portal,
  portalListingIds: string[]
): Promise<string[]> {
  if (portalListingIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: schema.listings.id,
      clusterId: schema.listings.clusterId,
    })
    .from(schema.listings)
    .where(
      and(
        eq(schema.listings.searchId, searchId),
        eq(schema.listings.portal, portal),
        inArray(schema.listings.portalListingId, portalListingIds)
      )
    );
  return rows.filter((r) => r.clusterId == null).map((r) => r.id);
}

export const scrapePortalTask = task({
  id: "scrape-portal",
  queue: scrapeQueue,
  maxDuration: 600,

  /**
   * v4 lifecycle hooks take a single object — never the (payload, output, ctx)
   * tuple shape from v2. The payload + output / error come through the
   * same params object alongside `ctx`. We annotate the destructured
   * params explicitly so TypeScript narrows `output` to `ScrapePortalOutput`
   * rather than `unknown` (otherwise the overload that requires
   * `jsonSchema` is picked).
   */
  onSuccess: async ({ output }: { output: ScrapePortalOutput }) => {
    const db = getDb();
    await db
      .update(schema.scrapeRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        costUsd: output.costUsd.toFixed(6),
        listingsFound: output.listingsFound,
        newListings: output.newListings,
        rawKey: output.rawKey,
      })
      .where(eq(schema.scrapeRuns.id, output.runId));
  },

  /**
   * Failure path. The `run` body INSERTs the `scrape_runs` row before
   * doing any work AND tags it with `ctx.run.id` as its primary key so
   * we can find it here without having a return value to read.
   */
  onFailure: async ({
    error,
    ctx,
  }: {
    error: unknown;
    ctx: { run: { id: string } };
  }) => {
    const db = getDb();
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.scrapeRuns)
      .set({
        status: "failure",
        finishedAt: new Date(),
        errorMessage: message.slice(0, 1000),
      })
      .where(eq(schema.scrapeRuns.id, ctx.run.id));
  },

  run: async (
    payload: ScrapePortalPayload,
    { ctx }
  ): Promise<ScrapePortalOutput> => {
    const db = getDb();
    const zyteKey = getZyteKey();
    const { searchId, portal } = payload;

    // Load the search row up front. Bailing here would mean the run
    // dies before scrape_runs is INSERTed — onFailure wouldn't have a
    // row to update — so the load happens first and the insert second.
    const search = await db.query.searches.findFirst({
      where: (s, { eq: eqOp }) => eqOp(s.id, searchId),
    });
    if (!search) {
      throw new Error(`search ${searchId} not found`);
    }

    // Use ctx.run.id as the scrape_runs primary key so onFailure / onSuccess
    // can find this row purely from the lifecycle hook's `ctx` arg.
    // `onConflictDoNothing` keeps the INSERT retry-safe: if attempt 1
    // inserted the row and then threw, attempts 2/3 are no-ops here, and
    // the original error written by onFailure survives.
    const runId = ctx.run.id;
    await db
      .insert(schema.scrapeRuns)
      .values({
        id: runId,
        searchId,
        portal,
        status: "running",
      })
      .onConflictDoNothing({ target: schema.scrapeRuns.id });

    // Per-portal cost fallback when Zyte's response header is missing.
    const portalCostFallback = PORTAL_COST_USD[portal];

    // Cadence-derived listing-age cap for portals that honour it
    // (currently Rightmove only). Failure is swallowed and logged —
    // we'd rather scrape without the cost optimisation than fail the
    // whole run if the Trigger API is briefly down.
    let maxDaysSinceAdded: number | undefined;
    try {
      const schedule = await findScheduleByExternalId(searchId);
      const cron = schedule?.generator?.expression ?? null;
      maxDaysSinceAdded = findCadenceByCron(cron).maxDaysSinceAdded;
    } catch (err) {
      logger.warn(
        "scrape-portal: schedule lookup failed; proceeding without maxDaysSinceAdded",
        {
          searchId,
          error: err instanceof Error ? err.message : String(err),
        }
      );
      maxDaysSinceAdded = undefined;
    }

    const mode: ScrapeMode = payload.mode ?? "incremental";
    // Backfill drops the recency window so pagination reaches each portal's
    // full depth; incremental keeps the cadence window so every run stays
    // to roughly one page of genuinely new listings.
    const windowDays = mode === "backfill" ? undefined : maxDaysSinceAdded;

    const location = search.location;
    const targets = buildSearchTargets(
      portal,
      location,
      {
        minBedrooms: search.minBedrooms,
        maxBedrooms: search.maxBedrooms,
        minPrice: search.minPrice,
        maxPrice: search.maxPrice,
        propertyTypes: search.propertyTypes,
        // `text[]` / `text` columns — the create/update server-fn validates
        // these against the closed sets, so the casts are safe.
        furnished: search.furnished as "furnished" | "unfurnished" | null,
        mustHaves: search.mustHaves as MustHave[],
        exclusions: search.exclusions as Exclusion[],
        // Drizzle `numeric` round-trips as string; parse here so the
        // URL builders can format it numerically.
        radiusMiles: Number(search.radiusMiles),
      },
      windowDays
    );

    if (targets.length === 0) {
      // portalRefs missing — degenerate-backfill row or a save-time
      // resolver failure. Skip the portal cleanly; the run finishes
      // with zero listings and a clear warning, and the user can
      // re-save the search via the form to repair.
      logger.warn("scrape-portal: no portalRef for this portal; skipping", {
        portal,
        searchId,
        locationName: location.name,
      });
      return {
        runId,
        costUsd: 0,
        listingsFound: 0,
        newListings: 0,
        rawKey: null,
      };
    }

    const baseScope = rawKeyScope(location);

    let totalCost = 0;
    let totalListingsFound = 0;
    let totalNew = 0;
    const allTouchedPortalListingIds: string[] = [];
    let primaryRawKey: string | null = null;

    // Fetch a URL on the browser tier. Rightmove + Zoopla need it to clear
    // CF and hydrate __NEXT_DATA__; OpenRent because its filters apply
    // CLIENT-SIDE in JS (a raw fetch returns the unfiltered set). Archives
    // the HTML to R2 only when `storeScope` is set (page 0 / search page) —
    // best-effort, failures don't propagate. Returns the HTML.
    const fetchPage = async (
      url: string,
      storeScope: string | null
    ): Promise<string> => {
      const res = await zyteFetch({
        apiKey: zyteKey,
        url,
        geolocation: "GB",
        browserHtml: true,
        onRetry: ({ status, attempt, waitMs }) =>
          logger.warn("scrape-portal: Zyte rate-limited, backing off", {
            url,
            status,
            attempt,
            waitMs,
          }),
      });
      totalCost += res.cost ?? portalCostFallback;
      if (storeScope) {
        try {
          const stored = await storeRawHtml({
            portal,
            scope: storeScope,
            runId,
            html: res.html,
          });
          if (stored && !primaryRawKey) {
            primaryRawKey = stored.key;
          }
        } catch (err) {
          logger.warn("scrape-portal: raw-html upload failed", {
            portal,
            scope: storeScope,
            runId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return res.html;
    };

    // Run one outcode's summaries through the server-side re-filters
    // (portal URL filters can't be trusted — OpenRent ignores them and RM
    // /ZP day-windows still let edge cases through) and upsert. Updates the
    // run accumulators.
    const ingest = async (
      summaries: ListingSummary[],
      label: string,
      rawCount: number
    ): Promise<{ keptPortalListingIds: Set<string> }> => {
      const locationFiltered = filterByExcludeLocations(
        summaries,
        search.excludeLocations,
        search.location
      );
      const priceFiltered = filterByPriceRange(
        locationFiltered,
        search.minPrice,
        search.maxPrice
      );
      const bedFiltered = filterByBedroomRange(
        priceFiltered,
        search.minBedrooms,
        search.maxBedrooms
      );
      const exclusionFiltered = filterByExclusions(bedFiltered, search.exclusions);
      const kept = filterByPropertyType(exclusionFiltered, search.propertyTypes);
      const { totalSeen, newCount, touchedPortalListingIds } =
        await upsertListings(db, searchId, portal, kept);
      totalListingsFound += totalSeen;
      totalNew += newCount;
      allTouchedPortalListingIds.push(...touchedPortalListingIds);
      logger.log("scrape-portal: outcode done", {
        portal,
        location: location.name,
        outcode: label,
        mode,
        rawCount,
        kept: kept.length,
        totalSeen,
        newCount,
      });
      return { keptPortalListingIds: new Set(touchedPortalListingIds) };
    };

    // R2 scope per outcode: bare place name when there's a single target,
    // else suffixed with the outcode label so writes don't collide.
    const scopeFor = (label: string) =>
      targets.length === 1
        ? baseScope
        : `${baseScope}-${sanitiseScopeFragment(label)}`;

    if (portal === "openrent") {
      await scrapeOpenrentByIdDiff({
        db,
        searchId,
        mode,
        targets,
        fetchPage,
        ingest,
        scopeFor,
      });
    } else {
      // Rightmove / Zoopla: paginate newest-first, deduping across pages,
      // until a page adds no new listings or is short (the last page), or
      // we hit the portal's hard page cap. With the recency window applied
      // (incremental) this is normally one page; backfill walks to the cap.
      const perPage =
        portal === "rightmove"
          ? RIGHTMOVE_RESULTS_PER_PAGE
          : ZOOPLA_RESULTS_PER_PAGE;
      const maxPages =
        portal === "rightmove" ? RIGHTMOVE_MAX_PAGES : ZOOPLA_MAX_PAGES;
      // Sequential across outcodes: Zyte throttles aggressive parallelism.
      for (const target of targets) {
        const seen = new Set<string>();
        const summaries: ListingSummary[] = [];
        for (let page = 0; page < maxPages; page++) {
          const url = target.makeUrl(page);
          logger.log("scrape-portal: fetching", {
            portal,
            outcode: target.label,
            page,
            url,
          });
          const html = await fetchPage(
            url,
            page === 0 ? scopeFor(target.label) : null
          );
          const parsed = parseSearchPage(portal, html);
          let added = 0;
          for (const s of parsed) {
            if (!seen.has(s.portalListingId)) {
              seen.add(s.portalListingId);
              summaries.push(s);
              added++;
            }
          }
          // Stop: empty page, all-duplicates (overlap past the end), or a
          // short page (fewer than a full page → the last one).
          if (parsed.length === 0 || added === 0 || parsed.length < perPage) {
            break;
          }
        }
        await ingest(summaries, target.label, summaries.length);
      }
    }

    const rawKey = primaryRawKey;

    // Resolve the touched portal ids to `listings.id` for rows whose
    // cluster is still NULL, then fan out to the cluster task. This
    // catches both:
    //
    //   • freshly INSERTed rows (always clusterId IS NULL),
    //   • old rows the previous cluster task missed.
    //
    // `batchTriggerAndWait` (NOT fire-and-forget `batchTrigger`): the
    // scheduled run is a TRUE JOIN — scrape-search waits on us so it can
    // fire the digest only once the whole scrape→cluster→detail→enrich
    // chain has finished and the rows are rich. Waiting is cheap: cluster
    // is on a DIFFERENT queue (`enrich`), so we checkpoint and release our
    // `scrape` concurrency slot here (no deadlock) and burn no compute
    // while suspended. A child failure surfaces as a non-ok run, not a
    // throw, so it can't fail this scrape.
    const listingIdsToCluster = await loadListingIdsToCluster(
      db,
      searchId,
      portal,
      allTouchedPortalListingIds
    );
    if (listingIdsToCluster.length > 0) {
      logger.log("scrape-portal: dispatching cluster task", {
        portal,
        searchId,
        clusterListingCount: listingIdsToCluster.length,
      });
      await clusterTask.batchTriggerAndWait([
        { payload: { listingIds: listingIdsToCluster } },
      ]);
    }

    return {
      runId,
      costUsd: totalCost,
      listingsFound: totalListingsFound,
      newListings: totalNew,
      rawKey,
    };
  },
});
