/**
 * Daily sweep that services review-queue deferrals (see
 * `db/schema.ts` → `clusterDeferrals` and
 * `src/server/functions/deferrals.ts`).
 *
 * Two jobs per tick:
 *
 *   1. Re-scrape due defers. For every still-snoozed deferral coming due
 *      within the next 24h that hasn't been re-scraped yet, re-fire
 *      `scrape-detail` for each listing in the cluster — the detail scrape
 *      COALESCE-fills the nulls that made the listing un-judgeable (EPC,
 *      photos, beds, description) without clobbering good data. We stamp
 *      `rescrapedAt` so a given defer window re-scrapes at most once, and
 *      the ~24h lead means the fresh data + its enrichment have landed by
 *      the time the cluster re-surfaces in the queue.
 *
 *   2. Housekeeping. Delete deferrals whose `deferUntil` has passed — the
 *      cluster is already back in the queue (the queue filter gates on
 *      time), so the row has served its purpose.
 *
 * Detail scrapes cost Zyte, but defers are human-initiated and bounded, so
 * there's no batch cap here — a day's worth of deferrals is tiny.
 */
import { logger, schedules, tasks } from "@trigger.dev/sdk";
import { and, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { clusterDeferrals, listings } from "../../db/schema";

export const processDeferralsTask = schedules.task({
  id: "process-deferrals",
  // Daily at 03:00 UTC — well clear of the overnight scrape schedules.
  cron: "0 3 * * *",
  run: async () => {
    const db = getDb();

    // 1) Re-scrape defers coming due within 24h that haven't fired yet.
    const due = await db
      .select({
        id: clusterDeferrals.id,
        clusterId: clusterDeferrals.clusterId,
      })
      .from(clusterDeferrals)
      .where(
        and(
          isNull(clusterDeferrals.rescrapedAt),
          lte(clusterDeferrals.deferUntil, sql`now() + interval '24 hours'`)
        )
      );

    let refired = 0;
    if (due.length > 0) {
      const clusterIds = due.map((d) => d.clusterId);
      const dueListings = await db
        .select({ id: listings.id })
        .from(listings)
        .where(inArray(listings.clusterId, clusterIds));
      if (dueListings.length > 0) {
        await tasks.batchTrigger(
          "scrape-detail",
          dueListings.map((l) => ({ payload: { listingId: l.id } }))
        );
        refired = dueListings.length;
      }
      await db
        .update(clusterDeferrals)
        .set({ rescrapedAt: sql`now()` })
        .where(
          inArray(
            clusterDeferrals.id,
            due.map((d) => d.id)
          )
        );
    }

    // 2) Housekeeping — drop resurfaced defers.
    await db
      .delete(clusterDeferrals)
      .where(lte(clusterDeferrals.deferUntil, sql`now()`));

    logger.log("process-deferrals", { dueClusters: due.length, refired });
    return { dueClusters: due.length, refired };
  },
});
