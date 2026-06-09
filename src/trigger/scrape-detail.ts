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

import { logger, task } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { env } from "../lib/env";
import {
  parseOpenrentDetail,
  parseRightmoveDetail,
  parseZooplaDetail,
} from "../lib/parsers";
import type { ListingDetail, Portal } from "../lib/parsers/types";
import { storeRawHtml } from "../lib/raw-html";
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

/**
 * Promote a listing's coords onto its cluster when the cluster has none
 * yet. Clusters are created from search-tier listings (no coordinates)
 * BEFORE this detail scrape lands the real lat/lng, so a fresh cluster is
 * born with NULL coords — and every lat/lng-gated enricher (amenities,
 * nearby-transit, station-routes, council-tax) reads the
 * *cluster's* coords and silently no-ops without them. A cluster is one
 * building, so any located listing locates it; the `IS NULL` guard makes
 * this idempotent and never clobbers an already-located cluster.
 * `enrich-geo-sweep` is the backstop for anything this misses.
 */
async function locateClusterFromListing(
  db: ReturnType<typeof getDb>,
  listing: typeof schema.listings.$inferSelect,
  patch: Partial<typeof schema.listings.$inferInsert>
): Promise<void> {
  const lat = patch.lat ?? listing.lat;
  const lng = patch.lng ?? listing.lng;
  if (!listing.clusterId || lat == null || lng == null) {
    return;
  }
  await db
    .update(schema.propertyClusters)
    .set({ lat, lng })
    .where(
      and(
        eq(schema.propertyClusters.id, listing.clusterId),
        isNull(schema.propertyClusters.lat)
      )
    );
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

  // Filter-tier fields promoted to dedicated columns (queryable + indexable).
  // fillIfMissing keeps the search-tier value authoritative when both
  // tiers populate the same column.
  fillIfMissing(patch, "sizeSqFt", existing.sizeSqFt, detail.sizeSqFt);
  fillIfMissing(
    patch,
    "councilTaxBand",
    existing.councilTaxBand,
    detail.councilTaxBand
  );
  if (detail.publishedAt) {
    const parsed = new Date(detail.publishedAt);
    if (!Number.isNaN(parsed.getTime()) && existing.publishedAt == null) {
      patch.publishedAt = parsed;
    }
  }
  fillIfMissing(
    patch,
    "petsAccepted",
    existing.petsAccepted,
    detail.tenantPreferences?.petsAccepted
  );

  // Always refresh raw_json with the richer detail blob so the admin UI
  // and downstream enrichment can read whatever's there without re-fetching.
  patch.rawJson = detail as unknown as Record<string, unknown>;

  return patch;
}

/**
 * Fan out the work that follows a successful detail scrape. Kept off the
 * run body so neither dispatch can fail the (already-recorded) scrape, and
 * to keep the run's branching low.
 *
 *  • Photo cache — fire-and-forget on the separate `photo` queue. A caching
 *    failure (R2 creds, a 404'd URL) must not fail the scrape, and it isn't
 *    on the digest's critical path.
 *  • AI enrichment — batchTriggerAndWait, part of the true join rooted at
 *    scrape-search: the AI summary/pros-cons is the richness the digest
 *    promises, so the chain waits for it before emailing. enrich-ai is on a
 *    DIFFERENT queue (`ai`), so we checkpoint and release our `scrape` slot
 *    while it runs (no deadlock, no compute spend). A failed enrichment
 *    comes back as a non-ok run; if the wait itself errors we swallow it —
 *    the 3-hourly enrich-ai-sweep retries, and the listing is already
 *    reviewable without the AI summary.
 */
async function dispatchDownstream(
  listingId: string,
  photoCount: number
): Promise<void> {
  if (photoCount > 0) {
    try {
      await cachePhotosTask.batchTrigger([{ payload: { listingId } }]);
    } catch (err) {
      logger.warn("scrape-detail: cache-photos dispatch failed", {
        listingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  try {
    await enrichAiTask.batchTriggerAndWait([{ payload: { listingId } }]);
  } catch (err) {
    logger.warn("scrape-detail: enrich-ai wait errored; sweep will retry", {
      listingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const scrapeDetailTask = task({
  id: "scrape-detail",
  queue: scrapeQueue,
  maxDuration: 120,

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
    // Manually-added listings (added by URL) have no search, and their
    // detail is already captured at add-time; `scrape_runs.search_id` is
    // NOT NULL so there's nothing to attribute a run to here. Skip.
    if (!listing.searchId) {
      logger.warn("scrape-detail: listing has no searchId; skipping", {
        listingId,
      });
      return { runId: ctx.run.id, listingId, photoCount: 0, costUsd: 0 };
    }
    const portal = listing.portal as Portal;

    // INSERT the scrape_runs row up front, keyed on ctx.run.id so the
    // lifecycle hooks can find it. We pass searchId from the listing
    // because scrape_runs.search_id is NOT NULL — every detail scrape is
    // attributable to whichever search surfaced the listing.
    //
    // `onConflictDoNothing` mirrors scrape-portal.ts:359 — when Trigger
    // retries a failed run (same ctx.run.id, new attempt), attempts 2+
    // would otherwise collide with the row attempt 1 inserted. Letting
    // the INSERT no-op preserves the original `onFailure` error_message
    // instead of overwriting it with the pkey-collision text.
    const runId = ctx.run.id;
    await db
      .insert(schema.scrapeRuns)
      .values({
        id: runId,
        searchId: listing.searchId,
        portal,
        status: "running",
      })
      .onConflictDoNothing({ target: schema.scrapeRuns.id });

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
      onRetry: ({ status, attempt, waitMs }) =>
        logger.warn("scrape-detail: Zyte rate-limited, backing off", {
          url: listing.url,
          status,
          attempt,
          waitMs,
        }),
    });
    const cost = res.cost ?? portalCostFallback;

    // Best-effort raw archive (gzipped HTML to R2). Skipped silently
    // when R2 creds aren't staged; logged but non-fatal on transport error.
    let rawKey: string | null = null;
    try {
      const stored = await storeRawHtml({
        portal,
        scope: listingId,
        runId,
        html: res.html,
      });
      if (stored) {
        rawKey = stored.key;
      }
    } catch (err) {
      logger.warn("scrape-detail: raw-html upload failed", {
        portal,
        listingId,
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

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

    // Locate the cluster from this listing's coords (see helper).
    await locateClusterFromListing(db, listing, patch);

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
        rawKey,
      })
      .where(eq(schema.scrapeRuns.id, runId));

    logger.log("scrape-detail: done", {
      listingId,
      photoCount,
      costUsd: cost,
    });

    // The scrape is already recorded as a success above; fan out the
    // downstream work (photo cache + AI enrichment) without letting a
    // trigger hiccup flip this successful scrape into a failure.
    await dispatchDownstream(listingId, photoCount);

    return {
      runId,
      listingId,
      photoCount,
      costUsd: cost,
    };
  },
});
