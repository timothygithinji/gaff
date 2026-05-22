/**
 * Per-listing clustering task.
 *
 * Triggered from `scrapePortalTask` (fire-and-forget `batchTrigger`, NOT
 * `batchTriggerAndWait`) after a portal sweep finishes inserting fresh
 * `listings` rows. For every listing in the payload:
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
 * After clustering, batchTrigger the per-listing detail scrape for the
 * NEW listings (whether or not their cluster is new — we still want the
 * detail row even if the building was already known from another portal).
 *
 * PR 6 wiring: this task's `onSuccess` fans out `enrichEpcTask` for
 * every cluster in `newClusterIds` (one EPC lookup per unique
 * building). AI enrichment fires from `scrapeDetailTask.onSuccess`
 * because its inputs are listing-scoped — see `enrich-ai.ts`.
 */

import { neon } from "@neondatabase/serverless";
import { logger, task } from "@trigger.dev/sdk";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";
import {
  findOrCreateCluster,
  linkListingToCluster,
} from "../lib/cluster/match";
import { env } from "../lib/env";
import { enrichEpcTask } from "./enrich-epc";
import { scrapeQueue } from "./queues";
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

function getDb() {
  const { DATABASE_URL } = env();
  return drizzle(neon(DATABASE_URL), { schema });
}

export const clusterTask = task({
  id: "cluster",
  queue: scrapeQueue,
  maxDuration: 300,

  /**
   * PR 6 wiring: fan out EPC enrichment for every cluster that was
   * newly created during this batch. EPC is per-cluster (one external
   * lookup per unique building's postcode), so we deliberately don't
   * re-trigger for clusters the listing landed in but that already
   * existed — those would already have had their EPC pulled when they
   * were first created. AI enrichment is fired separately from
   * `scrapeDetailTask.onSuccess` because its inputs (description +
   * key features) are listing-scoped, not building-scoped.
   *
   * fire-and-forget batchTrigger (NOT batchTriggerAndWait): clustering
   * already returned by the time onSuccess runs, and enrichment can
   * take its own sweet time without holding up the next sweep.
   */
  onSuccess: async ({ output }: { output: ClusterOutput }) => {
    if (output.newClusterIds.length === 0) {
      return;
    }
    await enrichEpcTask.batchTrigger(
      output.newClusterIds.map((clusterId) => ({ payload: { clusterId } }))
    );
  },

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

    // Fire-and-forget the per-listing detail scrape for every successfully
    // clustered listing. batchTrigger (NOT batchTriggerAndWait) so the
    // cluster task doesn't block on detail-scrape duration — clustering
    // is cheap, detail-scrape involves another Zyte round trip per
    // listing and routes through the scrapeQueue's concurrency cap.
    if (detailListingIds.length > 0) {
      await scrapeDetailTask.batchTrigger(
        detailListingIds.map((listingId) => ({
          payload: { listingId },
        }))
      );
    }

    // `newClusterIds` is read by this task's onSuccess to fan out
    // `enrichEpcTask` per new cluster (PR 6). AI enrichment is fired
    // from `scrapeDetailTask.onSuccess` instead — listing-scoped, not
    // cluster-scoped.
    return {
      clustered,
      newClusters: newClusterIds.length,
      newClusterIds,
      detailListingIds,
    };
  },
});
