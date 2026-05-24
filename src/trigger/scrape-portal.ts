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
  parseOpenrentSearch,
  parseRightmoveSearch,
  parseZooplaSearch,
} from "../lib/parsers";
import type { ListingSummary, Portal } from "../lib/parsers/types";
import {
  openrentSearchUrl,
  rightmoveSearchUrl,
  zooplaSearchUrl,
} from "../lib/portal-urls";
import { storeRawHtml } from "../lib/raw-html";
import { findScheduleByExternalId } from "../lib/schedule-lookup";
import type { SearchLocation } from "../lib/search-location";
import { PORTAL_COST_USD, zyteFetch } from "../lib/zyte";
import { clusterTask } from "./cluster";
import { scrapeQueue } from "./queues";

export type ScrapePortalPayload = {
  searchId: string;
  portal: Portal;
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
};

/**
 * Build the portal-specific search URL from the row's cached
 * `location.portalRefs`. Returns `null` if the portal's ref is missing
 * — that only happens for the degenerate-backfill row from migration
 * 0010, or if a previous resolver failure left the ref unset. Caller
 * logs a warning and skips the portal scrape in that case.
 */
function buildSearchUrl(
  portal: Portal,
  location: SearchLocation,
  search: SearchFilters,
  maxDaysSinceAdded: number | undefined
): string | null {
  const filters = {
    minBedrooms: search.minBedrooms,
    maxBedrooms: search.maxBedrooms,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    propertyTypes: search.propertyTypes,
  };
  if (portal === "rightmove") {
    const ref = location.portalRefs.rightmove;
    if (!ref) return null;
    return rightmoveSearchUrl({
      locationIdentifier: ref.locationIdentifier,
      ...filters,
      maxDaysSinceAdded,
    });
  }
  if (portal === "zoopla") {
    const ref = location.portalRefs.zoopla;
    if (!ref) return null;
    return zooplaSearchUrl({ q: ref.q, ...filters });
  }
  const ref = location.portalRefs.openrent;
  if (!ref) return null;
  return openrentSearchUrl({
    term: ref.term,
    withinMiles: ref.withinMiles,
    ...filters,
  });
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

function parsePortalHtml(portal: Portal, html: string): ListingSummary[] {
  if (portal === "rightmove") {
    return parseRightmoveSearch(html);
  }
  if (portal === "zoopla") {
    return parseZooplaSearch(html);
  }
  return parseOpenrentSearch(html);
}

/**
 * UK postcodes are `<outcode> <incode>` (e.g. "NW3 1AB"). The outcode is
 * everything before the first space, uppercased.
 */
function outcodeOf(postcode: string | undefined): string | null {
  if (!postcode) return null;
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
function filterByExcludeLocations(
  summaries: ListingSummary[],
  excludes: readonly SearchLocation[]
): ListingSummary[] {
  if (excludes.length === 0) {
    return summaries;
  }
  const excludeOutcodes = new Set(
    excludes
      .filter((e) => e.type === "postal_code")
      .map((e) => e.name.trim().toUpperCase())
  );
  const boundsList = excludes
    .filter((e) => e.type !== "postal_code" && e.bounds !== null)
    .map((e) => e.bounds as NonNullable<SearchLocation["bounds"]>);

  return summaries.filter((s) => {
    const outcode = outcodeOf(s.postcode);
    if (outcode && excludeOutcodes.has(outcode)) return false;
    if (typeof s.lat === "number" && typeof s.lng === "number") {
      for (const b of boundsList) {
        if (pointInBounds(s.lat, s.lng, b)) return false;
      }
    }
    return true;
  });
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
        url: sql`excluded.url`,
        title: sql`excluded.title`,
        addressRaw: sql`excluded.address_raw`,
        postcode: sql`excluded.postcode`,
        bedrooms: sql`excluded.bedrooms`,
        bathrooms: sql`excluded.bathrooms`,
        priceMonthly: sql`excluded.price_monthly`,
        propertyType: sql`excluded.property_type`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
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

    const location = search.location;
    const url = buildSearchUrl(
      portal,
      location,
      {
        minBedrooms: search.minBedrooms,
        maxBedrooms: search.maxBedrooms,
        minPrice: search.minPrice,
        maxPrice: search.maxPrice,
        propertyTypes: search.propertyTypes,
      },
      maxDaysSinceAdded
    );

    if (!url) {
      // portalRefs missing — degenerate-backfill row or a save-time
      // resolver failure. Skip the portal cleanly; the run finishes
      // with zero listings and a clear warning, and the user can
      // re-save the search via the form to repair.
      logger.warn(
        "scrape-portal: no portalRef for this portal; skipping",
        { portal, searchId, locationName: location.name }
      );
      return {
        runId,
        costUsd: 0,
        listingsFound: 0,
        newListings: 0,
        rawKey: null,
      };
    }

    logger.log("scrape-portal: fetching", {
      portal,
      location: location.name,
      url,
    });

    // Rightmove + Zoopla need the browser tier to get past CF and
    // hydrate __NEXT_DATA__. OpenRent is plain server-side HTML.
    const useBrowser = portal === "rightmove" || portal === "zoopla";
    const res = await zyteFetch({
      apiKey: zyteKey,
      url,
      geolocation: "GB",
      browserHtml: useBrowser ? true : undefined,
      httpResponseBody: useBrowser ? undefined : true,
    });

    const totalCost = res.cost ?? portalCostFallback;

    // Archive the raw HTML to R2 (best-effort). Failures don't
    // propagate — the scrape succeeds either way; the run row just
    // won't carry a raw_key.
    // R2 archive scope: kebabbed place name (e.g. "camden-town") so the
    // key is human-scannable. Falls back to placeId for unusually long
    // / non-ASCII names; both are stable per-search-per-portal.
    const scope = rawKeyScope(location);

    let rawKey: string | null = null;
    try {
      const stored = await storeRawHtml({
        portal,
        scope,
        runId,
        html: res.html,
      });
      if (stored) {
        rawKey = stored.key;
      }
    } catch (err) {
      logger.warn("scrape-portal: raw-html upload failed", {
        portal,
        scope,
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const parsed = parsePortalHtml(portal, res.html);
    const summaries = filterByExcludeLocations(parsed, search.excludeLocations);
    const excludedCount = parsed.length - summaries.length;
    const { totalSeen, newCount, touchedPortalListingIds } =
      await upsertListings(db, searchId, portal, summaries);
    const totalListingsFound = totalSeen;
    const totalNew = newCount;
    const allTouchedPortalListingIds = touchedPortalListingIds;

    logger.log("scrape-portal: location done", {
      portal,
      location: location.name,
      listingsFound: totalSeen,
      newCount,
      excludedByLocation: excludedCount,
    });

    // Resolve the touched portal ids to `listings.id` for rows whose
    // cluster is still NULL, then fan out to the cluster task. This
    // catches both:
    //
    //   • freshly INSERTed rows (always clusterId IS NULL),
    //   • old rows the previous cluster task missed.
    //
    // `batchTrigger` (NOT `batchTriggerAndWait`): clustering is downstream
    // work that doesn't need to gate this task's success. If we waited
    // here, a single search with 50 new listings across 3 portals would
    // pin scrape-portal alive for tens of seconds. Trigger's tracing
    // links the runs anyway.
    const listingIdsToCluster = await loadListingIdsToCluster(
      db,
      searchId,
      portal,
      allTouchedPortalListingIds
    );
    if (listingIdsToCluster.length > 0) {
      await clusterTask.batchTrigger([
        { payload: { listingIds: listingIdsToCluster } },
      ]);
      logger.log("scrape-portal: dispatched cluster task", {
        portal,
        searchId,
        clusterListingCount: listingIdsToCluster.length,
      });
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
