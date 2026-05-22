/**
 * Per-listing detail-page scrape.
 *
 * Search-page parsers (PR 4) give us the cheap summary: portal id, price,
 * address, bedrooms, photos thumbnail. The detail page is where the rich
 * fields live — full description, every photo URL, agent name/phone,
 * accurate lat/lng, EPC graph, key features.
 *
 * Flow per listing:
 *
 *   1. SELECT the listing row to pick up its url + portal.
 *   2. Fetch via Zyte (browserHtml for Rightmove + Zoopla, plain HTTP
 *      body for OpenRent — same pattern as scrape-portal).
 *   3. Run the matching `parse{Portal}Detail` parser.
 *   4. UPDATE listings with any newly-discovered fields, preserving
 *      what's already there (the detail might be missing a bathroom
 *      count the summary already had).
 *   5. INSERT all photo URLs into listing_photos with `r2Key = NULL`.
 *      The cache-photos task is what eventually populates r2Key by
 *      downloading the originals and uploading to R2.
 *   6. INSERT a scrape_runs row tagged with the portal (the schema has
 *      no `purpose` column; the existing `portal` field is enough to
 *      distinguish search-tier vs detail-tier when the admin UI groups by
 *      run age).
 *
 * Photo de-dup strategy: the `listing_photos` table doesn't have a
 * (listing_id, url) unique index, so we pre-load the set of URLs already
 * known for this listing and skip those before INSERTing. Re-running the
 * task therefore inserts ZERO duplicates without depending on a database
 * constraint that doesn't exist.
 *
 * After scrape, batchTrigger the cache-photos task for the listing — the
 * R2 upload can run independently of any further detail logic.
 */

import { neon } from "@neondatabase/serverless";
import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { nanoid } from "nanoid";
import * as schema from "../../db/schema";
import { env } from "../lib/env";
import {
  parseOpenrentDetail,
  parseRightmoveDetail,
  parseZooplaDetail,
} from "../lib/parsers";
import type { ListingDetail, Portal } from "../lib/parsers/types";
import { PORTAL_COST_USD, zyteFetch } from "../lib/zyte";
import { cachePhotosTask } from "./cache-photos";
import { enrichAiTask } from "./enrich-ai";
import { scrapeQueue } from "./queues";

export type ScrapeDetailPayload = {
  listingId: string;
};

export type ScrapeDetailOutput = {
  runId: string;
  listingId: string;
  photoCount: number;
  costUsd: number;
};

function getDb() {
  const { DATABASE_URL } = env();
  return drizzle(neon(DATABASE_URL), { schema });
}

function getZyteKey(): string {
  return env().ZYTE_API_KEY;
}

function parsePortalDetail(portal: Portal, html: string): ListingDetail {
  if (portal === "rightmove") {
    return parseRightmoveDetail(html);
  }
  if (portal === "zoopla") {
    return parseZooplaDetail(html);
  }
  return parseOpenrentDetail(html);
}

/**
 * The fields we'll write back to `listings` based on the detail parse.
 * We never OVERWRITE a value the search-tier already populated with one
 * the detail-tier parsed — `bedrooms` from the search summary is treated
 * as authoritative once it's set. We do fill IN values that are still
 * NULL on the listing row (most commonly `lat` / `lng` from OpenRent).
 */
/** Set `patch[key]` only if existing is nullish AND value isn't. */
function fillIfMissing<K extends keyof typeof schema.listings.$inferInsert>(
  patch: Partial<typeof schema.listings.$inferInsert>,
  key: K,
  existing: unknown,
  value: (typeof schema.listings.$inferInsert)[K] | null | undefined
): void {
  if (existing == null && value != null) {
    patch[key] = value;
  }
}

function buildListingPatch(
  existing: typeof schema.listings.$inferSelect,
  detail: ListingDetail
): Partial<typeof schema.listings.$inferInsert> {
  const patch: Partial<typeof schema.listings.$inferInsert> = {};

  fillIfMissing(patch, "bedrooms", existing.bedrooms, detail.bedrooms);
  fillIfMissing(patch, "bathrooms", existing.bathrooms, detail.bathrooms);
  fillIfMissing(
    patch,
    "priceMonthly",
    existing.priceMonthly,
    detail.priceMonthly
  );
  fillIfMissing(patch, "postcode", existing.postcode, detail.postcode);
  fillIfMissing(
    patch,
    "propertyType",
    existing.propertyType,
    detail.propertyType
  );
  fillIfMissing(
    patch,
    "lat",
    existing.lat,
    detail.lat != null ? detail.lat.toString() : undefined
  );
  fillIfMissing(
    patch,
    "lng",
    existing.lng,
    detail.lng != null ? detail.lng.toString() : undefined
  );

  if (detail.availableFrom) {
    const parsed = new Date(detail.availableFrom);
    if (!Number.isNaN(parsed.getTime())) {
      patch.availableFrom = parsed;
    }
  }

  // Always refresh raw_json with the richer detail blob so the admin UI
  // and downstream enrichment can read whatever's there without re-fetching.
  patch.rawJson = detail as unknown as Record<string, unknown>;

  return patch;
}

export const scrapeDetailTask = task({
  id: "scrape-detail",
  queue: scrapeQueue,
  maxDuration: 120,

  /**
   * onSuccess fires after the run body returns. We use it to fire-and-forget
   * the photo-cache task — same pattern as scrape-portal → cluster (the
   * child runs on the same `scrapeQueue` so its concurrency is bounded).
   *
   * Splitting this off from the run body matters because cache-photos can
   * fail (R2 creds missing, photo URL 404s) WITHOUT failing the detail
   * scrape — the parsed-and-stored listing data is still a valid output
   * regardless of whether the photos cached.
   */
  onSuccess: async ({ output }: { output: ScrapeDetailOutput }) => {
    if (output.photoCount > 0) {
      await cachePhotosTask.batchTrigger([
        { payload: { listingId: output.listingId } },
      ]);
    }
    // PR 6 wiring: fire-and-forget the AI enrichment now that
    // `listings.rawJson` is populated with the rich ListingDetail. The
    // enrich-ai task runs on the same scrapeQueue (concurrencyLimit 5),
    // which doubles as a bound on Anthropic spend rate without an extra
    // queue declaration. EPC enrichment fires from cluster.onSuccess
    // instead — it's per-cluster, not per-listing.
    await enrichAiTask.batchTrigger([
      { payload: { listingId: output.listingId } },
    ]);
  },

  /**
   * Mirrors the scrape-portal pattern: we INSERT the scrape_runs row
   * before doing any work and key it on `ctx.run.id`, so onFailure can
   * find and finalise it without needing data from the run output.
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
    payload: ScrapeDetailPayload,
    { ctx }
  ): Promise<ScrapeDetailOutput> => {
    const db = getDb();
    const zyteKey = getZyteKey();
    const { listingId } = payload;

    // Load the listing up front so we know the URL + portal, AND so we
    // have the existing fields available for the merge step below.
    const listing = await db.query.listings.findFirst({
      where: (l, { eq: eqOp }) => eqOp(l.id, listingId),
    });
    if (!listing) {
      throw new Error(`scrape-detail: listing ${listingId} not found`);
    }
    const portal = listing.portal as Portal;

    // INSERT the scrape_runs row up front, keyed on ctx.run.id so the
    // lifecycle hooks can find it. We pass searchId from the listing
    // because scrape_runs.search_id is NOT NULL — every detail scrape is
    // attributable to whichever search surfaced the listing.
    const runId = ctx.run.id;
    await db.insert(schema.scrapeRuns).values({
      id: runId,
      searchId: listing.searchId,
      portal,
      status: "running",
    });

    const useBrowser = portal === "rightmove" || portal === "zoopla";
    const portalCostFallback = PORTAL_COST_USD[portal];

    logger.log("scrape-detail: fetching", {
      portal,
      listingId,
      url: listing.url,
    });

    const res = await zyteFetch({
      apiKey: zyteKey,
      url: listing.url,
      geolocation: "GB",
      browserHtml: useBrowser ? true : undefined,
      httpResponseBody: useBrowser ? undefined : true,
    });
    const cost = res.cost ?? portalCostFallback;

    const detail = parsePortalDetail(portal, res.html);

    // Apply only fields the search-tier didn't already populate. See
    // `buildListingPatch` for the merge semantics.
    const patch = buildListingPatch(listing, detail);
    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.listings)
        .set(patch)
        .where(eq(schema.listings.id, listingId));
    }

    // Photo INSERT. Schema has no (listing_id, url) unique index, so we
    // pre-fetch the URLs already known for this listing and skip those.
    // Idempotent re-runs ➜ zero duplicates without depending on a DB
    // constraint that doesn't exist. The cost is one extra SELECT per
    // detail scrape; the alternative (adding the index now) would
    // require a migration, which PR 5 deliberately avoids.
    let photoCount = 0;
    if (detail.photos.length > 0) {
      const existingForListing = await db
        .select({ url: schema.listingPhotos.url })
        .from(schema.listingPhotos)
        .where(eq(schema.listingPhotos.listingId, listingId));
      const knownUrls = new Set(existingForListing.map((r) => r.url));

      const toInsert = detail.photos
        .map((url, idx) => ({ url, position: idx }))
        .filter((p) => !knownUrls.has(p.url));

      if (toInsert.length > 0) {
        await db.insert(schema.listingPhotos).values(
          toInsert.map((p) => ({
            id: nanoid(),
            listingId,
            url: p.url,
            r2Key: null,
            position: p.position,
          }))
        );
      }
      photoCount = toInsert.length;
    }

    // Finalise the scrape_runs row. Mirrors scrape-portal's onSuccess
    // behaviour but inlined here because the detail task has a single
    // request, not a per-outcode loop — onSuccess would only have to do
    // exactly this same UPDATE.
    await db
      .update(schema.scrapeRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        costUsd: cost.toFixed(6),
        listingsFound: 1,
        newListings: 0,
      })
      .where(eq(schema.scrapeRuns.id, runId));

    logger.log("scrape-detail: done", {
      listingId,
      photoCount,
      costUsd: cost,
    });

    return {
      runId,
      listingId,
      photoCount,
      costUsd: cost,
    };
  },
});
