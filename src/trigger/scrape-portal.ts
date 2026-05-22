/**
 * Per-portal scrape task.
 *
 * Fans out from `scrape-search` (one child run per portal listed on a
 * search). For each outcode on the search:
 *
 *   1. Build the portal-specific search URL via `src/lib/portal-urls.ts`.
 *   2. Pull the page through Zyte (browser tier for Rightmove + Zoopla,
 *      plain HTTP for OpenRent).
 *   3. Parse the page with the matching `parseXSearch` from
 *      `src/lib/parsers/`.
 *   4. Upsert each `ListingSummary` into `listings` keyed on
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

import { neon } from "@neondatabase/serverless";
import { logger, task } from "@trigger.dev/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { nanoid } from "nanoid";
import * as schema from "../../db/schema";
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
import { PORTAL_COST_USD, zyteFetch } from "../lib/zyte";
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
};

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set in the Trigger.dev worker env");
  }
  return drizzle(neon(url), { schema });
}

function getZyteKey(): string {
  const key = process.env.ZYTE_API_KEY;
  if (!key) {
    throw new Error("ZYTE_API_KEY not set in the Trigger.dev worker env");
  }
  return key;
}

function buildSearchUrl(
  portal: Portal,
  outcode: string,
  search: {
    minBedrooms: number | null;
    maxBedrooms: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    propertyTypes: string[];
  }
): string {
  const params = {
    outcode,
    minBedrooms: search.minBedrooms,
    maxBedrooms: search.maxBedrooms,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    propertyTypes: search.propertyTypes,
  };
  if (portal === "rightmove") {
    return rightmoveSearchUrl(params);
  }
  if (portal === "zoopla") {
    return zooplaSearchUrl(params);
  }
  return openrentSearchUrl(params);
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

async function upsertOneListing(
  db: ReturnType<typeof getDb>,
  searchId: string,
  portal: Portal,
  summary: ListingSummary
): Promise<void> {
  const mutable = mutableListingFields(summary);
  // Use ON CONFLICT to refresh mutable fields + bump last_seen_at without
  // touching first_seen_at. The unique index
  // `listings_search_portal_listing_id_uniq` is the conflict target.
  await db
    .insert(schema.listings)
    .values({
      id: nanoid(),
      portal,
      portalListingId: summary.portalListingId,
      searchId,
      ...mutable,
      rawJson: summary as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: [
        schema.listings.searchId,
        schema.listings.portal,
        schema.listings.portalListingId,
      ],
      set: { ...mutable, lastSeenAt: sql`NOW()` },
    });
}

/**
 * Upsert one outcode's worth of listings. Returns the count of rows that
 * were INSERTed (not updated) so the caller can populate
 * `scrape_runs.new_listings`.
 */
async function upsertListings(
  db: ReturnType<typeof getDb>,
  searchId: string,
  portal: Portal,
  summaries: ListingSummary[]
): Promise<{ totalSeen: number; newCount: number }> {
  if (summaries.length === 0) {
    return { totalSeen: 0, newCount: 0 };
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
    await upsertOneListing(db, searchId, portal, summary);
  }
  return { totalSeen: summaries.length, newCount };
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
    const runId = ctx.run.id;
    await db.insert(schema.scrapeRuns).values({
      id: runId,
      searchId,
      portal,
      status: "running",
    });

    let totalCost = 0;
    let totalListingsFound = 0;
    let totalNew = 0;

    // Per-portal cost fallback when Zyte's response header is missing.
    const portalCostFallback = PORTAL_COST_USD[portal];

    for (const outcode of search.outcodes) {
      const url = buildSearchUrl(portal, outcode, {
        minBedrooms: search.minBedrooms,
        maxBedrooms: search.maxBedrooms,
        minPrice: search.minPrice,
        maxPrice: search.maxPrice,
        propertyTypes: search.propertyTypes,
      });

      logger.log("scrape-portal: fetching", { portal, outcode, url });

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

      totalCost += res.cost ?? portalCostFallback;

      const summaries = parsePortalHtml(portal, res.html);
      const { totalSeen, newCount } = await upsertListings(
        db,
        searchId,
        portal,
        summaries
      );
      totalListingsFound += totalSeen;
      totalNew += newCount;

      logger.log("scrape-portal: outcode done", {
        portal,
        outcode,
        listingsFound: totalSeen,
        newCount,
      });
    }

    return {
      runId,
      costUsd: totalCost,
      listingsFound: totalListingsFound,
      newListings: totalNew,
    };
  },
});
