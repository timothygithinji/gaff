/**
 * Scheduled scrape dispatcher.
 *
 * Each `Search` row in our DB has an IMPERATIVE Trigger.dev schedule
 * attached to it; its `externalId` is the `searches.id`. When the
 * schedule fires, `scrape-search` reads the externalId off the payload,
 * loads the search, and fans out per-portal scrapes through
 * `scrapePortalTask.batchTriggerAndWait`.
 *
 * v4 rule: NEVER `Promise.all(triggerAndWait(...))`. Use
 * `batchTriggerAndWait` — the SDK enforces this and the dev server
 * will surface a warning otherwise.
 *
 * The actual per-portal logic (Zyte fetch, parser, upsert, scrape_runs
 * row) lives in `scrape-portal.ts`. This task is intentionally thin:
 * load, fan out, walk the results for logging.
 */

import { logger, schedules } from "@trigger.dev/sdk";
import { getDb } from "../../db";
import type { Portal } from "../lib/parsers/types";
import { scrapePortalTask } from "./scrape-portal";

export const scrapeSearchTask = schedules.task({
  id: "scrape-search",
  maxDuration: 60,
  run: async (payload) => {
    const searchId = payload.externalId;
    if (!searchId) {
      logger.warn("scrape-search: no externalId on schedule payload, skipping");
      return;
    }

    const db = getDb();
    const search = await db.query.searches.findFirst({
      where: (s, { eq }) => eq(s.id, searchId),
    });
    if (!search) {
      logger.warn("scrape-search: search not found", { searchId });
      return;
    }
    if (!search.active) {
      logger.log("scrape-search: search is inactive, skipping", { searchId });
      return;
    }

    // Cast: `portals` is `text[]` in the DB; we trust the create/update
    // server-fn to only have written valid Portal tokens.
    const portals = search.portals as Portal[];
    if (portals.length === 0) {
      logger.warn("scrape-search: search has no portals", { searchId });
      return;
    }

    logger.log("scrape-search: dispatching per-portal runs", {
      searchId,
      portals,
      outcodeCount: search.outcodes.length,
    });

    // v4: batchTriggerAndWait. Returns a BatchResult whose `runs` is a
    // per-run Result that's either { ok: true, output } or
    // { ok: false, error }. Failures are already recorded on the
    // scrape_runs table by scrapePortalTask.onFailure — we just log here.
    const result = await scrapePortalTask.batchTriggerAndWait(
      portals.map((portal) => ({
        payload: { searchId, portal },
      }))
    );

    for (const run of result.runs) {
      if (run.ok) {
        logger.log("scrape-search: child ok", {
          runId: run.id,
          output: run.output,
        });
      } else {
        logger.error("scrape-search: child failed", {
          runId: run.id,
          error: run.error,
        });
      }
    }
  },
});
