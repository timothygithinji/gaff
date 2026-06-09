/**
 * Per-listing clustering task.
 *
 * Triggered from `scrapePortalTask` (via `batchTriggerAndWait`, part of the
 * true join rooted at scrape-search) after a portal sweep finishes inserting
 * fresh `listings` rows. For every listing in the payload:
 *
 *   1. Read the address fields off the listings row.
 *   2. Run it through `findOrCreateCluster` (normalised-address dedupe
 *      lives in `src/lib/cluster/match.ts`).
 *   3. UPDATE listings.cluster_id with the resolved cluster id.
 *   4. Collect the ids of clusters that were newly created so the
 *      downstream detail-scrape can target them — those are the ones we
 *      haven't yet pulled the rich (photos, description, agent, lat/lng)
 *      page for.
 *
 * Then, in the run body:
 *   • fire-and-forget the per-cluster geo enrichers (EPC, commute, …) for
 *     every NEW cluster — they're on the SAME `enrich` queue, so we can't
 *     wait on them without risking a same-queue deadlock; firing them now
 *     lets them run alongside the detail+AI subtree;
 *   • `batchTriggerAndWait` the per-listing detail scrape for the NEW
 *     listings (it's on the `scrape` queue, so waiting is deadlock-free and
 *     suspends cheaply), which itself waits on AI enrichment — so this task
 *     only returns once the whole sub-chain for these listings is done.
 */

import { logger, task } from "@trigger.dev/sdk";
import { inArray } from "drizzle-orm";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import {
  findOrCreateCluster,
  linkListingToCluster,
} from "../lib/cluster/match";
import { enrichAmenitiesTask } from "./enrich-amenities";
import { enrichBroadbandTask } from "./enrich-broadband";
import { enrichCommuteTask } from "./enrich-commute";
import { enrichCouncilTaxTask } from "./enrich-council-tax";
import { enrichEpcTask } from "./enrich-epc";
import { enrichNearbyTransitTask } from "./enrich-nearby-transit";
import { enrichStationRoutesTask } from "./enrich-station-routes";
import { enrichQueue } from "./queues";
import { scrapeDetailTask } from "./scrape-detail";

export type ClusterPayload = {
  /**
   * The `listings.id` values to cluster. These come from `scrape-portal`
   * after the listings upsert step finishes, scoped to rows that the
   * scrape either inserted brand-new OR observed with a NULL `cluster_id`
   * (re-runs after a schema migration).
   */
  listingIds: string[];
};

export type ClusterOutput = {
  clustered: number;
  newClusters: number;
  newClusterIds: string[];
  /**
   * The subset of `listingIds` whose detail page we want to scrape next.
   * In practice this is everything the cluster task processed — we don't
   * have a portal-side "detail already scraped" flag yet (PR 5 introduces
   * the detail concept), so every newly-clustered listing is eligible.
   */
  detailListingIds: string[];
};

export const clusterTask = task({
  id: "cluster",
  queue: enrichQueue,
  maxDuration: 300,

  run: async (payload: ClusterPayload): Promise<ClusterOutput> => {
    const db = getDb();
    const { listingIds } = payload;

    if (listingIds.length === 0) {
      logger.warn("cluster: empty listingIds, nothing to do");
      return {
        clustered: 0,
        newClusters: 0,
        newClusterIds: [],
        detailListingIds: [],
      };
    }

    // Load just the columns we need to compute the cluster key. We use
    // `inArray` rather than N round-trips so the network cost stays linear
    // in batch count, not listing count.
    const rows = await db
      .select({
        id: schema.listings.id,
        addressRaw: schema.listings.addressRaw,
        postcode: schema.listings.postcode,
        lat: schema.listings.lat,
        lng: schema.listings.lng,
      })
      .from(schema.listings)
      .where(inArray(schema.listings.id, listingIds));

    let clustered = 0;
    const newClusterIds: string[] = [];
    const detailListingIds: string[] = [];

    for (const row of rows) {
      try {
        const { clusterId, created } = await findOrCreateCluster(db, {
          addressRaw: row.addressRaw,
          postcode: row.postcode,
          lat: row.lat,
          lng: row.lng,
        });
        await linkListingToCluster(db, row.id, clusterId);

        clustered += 1;
        detailListingIds.push(row.id);
        if (created) {
          newClusterIds.push(clusterId);
        }
      } catch (err) {
        // One bad address shouldn't kill the whole batch — log and keep
        // going. The listing stays with `cluster_id = NULL`; the next
        // scrape sweep will pick it up again because scrape-portal
        // collects rows where clusterId IS NULL.
        logger.error("cluster: failed to cluster listing", {
          listingId: row.id,
          addressRaw: row.addressRaw,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.log("cluster: done", {
      requested: listingIds.length,
      found: rows.length,
      clustered,
      newClusters: newClusterIds.length,
    });

    // Fan out per-cluster geo enrichment (EPC, commute, amenities, …) for
    // every NEW cluster — one external lookup per unique building, so we
    // skip clusters the listing landed in but that already existed.
    //
    // Fire-and-forget on purpose: these run on the SAME `enrich` queue as
    // this task, so we must NOT wait on them (a same-queue parent→child
    // wait risks a concurrency deadlock). Firing them HERE — before we
    // suspend on the detail scrape below — lets them run in parallel with
    // detail + AI, so they've landed by the time the join returns.
    if (newClusterIds.length > 0) {
      const enrichPayloads = newClusterIds.map((clusterId) => ({
        payload: { clusterId },
      }));
      await Promise.all([
        enrichEpcTask.batchTrigger(enrichPayloads),
        enrichCommuteTask.batchTrigger(enrichPayloads),
        enrichAmenitiesTask.batchTrigger(enrichPayloads),
        enrichBroadbandTask.batchTrigger(enrichPayloads),
        enrichCouncilTaxTask.batchTrigger(enrichPayloads),
        enrichStationRoutesTask.batchTrigger(enrichPayloads),
        enrichNearbyTransitTask.batchTrigger(enrichPayloads),
      ]);
    }

    // Per-listing detail scrape for every clustered listing.
    // batchTriggerAndWait (NOT fire-and-forget): this is part of the true
    // join rooted at scrape-search, which waits on the whole chain before
    // firing the digest. scrape-detail is on a DIFFERENT queue (`scrape`),
    // so we checkpoint and release our `enrich` slot while suspended — no
    // deadlock, no compute spend. A child failure surfaces as a non-ok run,
    // not a throw, so it can't fail clustering.
    if (detailListingIds.length > 0) {
      await scrapeDetailTask.batchTriggerAndWait(
        detailListingIds.map((listingId) => ({
          payload: { listingId },
        }))
      );
    }

    return {
      clustered,
      newClusters: newClusterIds.length,
      newClusterIds,
      detailListingIds,
    };
  },
});
