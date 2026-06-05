/**
 * Recurring backstop for the lat/lng-gated geo enrichments — the geo
 * analogue of `enrich-ai-sweep`.
 *
 * Each tick: (1) promote listing coords onto any cluster still missing
 * them, then (2) re-fire the coord-gated enrichers for every located
 * cluster that hasn't got the amenities/nearby-transit pair yet.
 * This heals two failure modes that otherwise strand a cluster forever,
 * both of which complete *green* (the enrichers no-op silently on a
 * coordinate-less cluster, so nothing surfaces as failed):
 *   - a cluster born without coords (created from a search-tier listing
 *     before its detail scrape landed lat/lng), and
 *   - enrichers that fired once, before the coords arrived, and were
 *     never fired again.
 *
 * See `enrich-geo-backlog.ts` for the shared promotion + backlog query
 * (also used by `scripts/backfill-geo-enrich.ts` for a manual drain).
 */
import { logger, schedules, tasks } from "@trigger.dev/sdk";
import { getDb } from "../../db";
import {
  GEO_SWEEP_TASK_IDS,
  findGeoBacklogClusterIds,
  promoteClusterCoords,
} from "./enrich-geo-backlog";

/** Clusters to re-fire per tick. Each enricher is cheap (gov/OSM/Google
 * lookups on `enrichQueue`, concurrency 15); a few hundred clusters drain
 * within a tick or two. */
const SWEEP_BATCH = 150;

export const enrichGeoSweepTask = schedules.task({
  id: "enrich-geo-sweep",
  // Every 3 hours, matching enrich-ai-sweep. Geo data isn't time-critical;
  // this only needs to be frequent enough that a cluster located by a
  // detail scrape gets its geo enrichment the same day.
  cron: "30 */3 * * *",
  run: async () => {
    const db = getDb();

    const located = await promoteClusterCoords(db);
    if (located > 0) {
      logger.log("enrich-geo-sweep: promoted coords onto clusters", { located });
    }

    const clusterIds = await findGeoBacklogClusterIds(db, SWEEP_BATCH);
    if (clusterIds.length === 0) {
      logger.log("enrich-geo-sweep: nothing to do", { located });
      return { located, refiredClusters: 0 };
    }

    for (const taskId of GEO_SWEEP_TASK_IDS) {
      await tasks.batchTrigger(
        taskId,
        clusterIds.map((clusterId) => ({ payload: { clusterId } }))
      );
    }

    logger.log("enrich-geo-sweep: re-fired geo enrichment", {
      located,
      refiredClusters: clusterIds.length,
      tasks: GEO_SWEEP_TASK_IDS.length,
      capped: clusterIds.length === SWEEP_BATCH,
    });
    return { located, refiredClusters: clusterIds.length };
  },
});
