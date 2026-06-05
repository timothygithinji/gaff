/**
 * Recurring AI-enrichment backstop.
 *
 * `enrich-ai` is fired exactly once, fire-and-forget, from
 * `scrapeDetailTask.onSuccess`. Anything that makes that one shot fail —
 * a transient Anthropic rate-limit that outlives Trigger's retries, a
 * detail scrape that landed before its rawJson description, a deploy
 * mid-flight — used to strand the listing permanently un-enriched (there
 * was no second attempt). This schedule is that second attempt: every
 * few hours it re-fires `enrich-ai` for every listing still missing its
 * read, so the backlog drains itself instead of needing a manual
 * backfill.
 *
 * Pacing: `enrich-ai` runs on its own low-concurrency `aiQueue` and
 * retries 429s patiently, so a big batch trickles through under
 * Anthropic's per-minute token limit rather than slamming it. We still
 * cap each sweep at SWEEP_BATCH so a run never enqueues an unbounded
 * pile; any overflow is picked up on the next tick — no deadline, just
 * steady drain.
 */
import { logger, schedules } from "@trigger.dev/sdk";
import { getDb } from "../../db";
import { enrichAiTask } from "./enrich-ai";
import { findEnrichmentBacklog } from "./enrich-ai-backlog";

/** Max listings to re-fire per tick. Comfortably drains a few-hundred-
 * listing dataset within a tick or two while staying under the org's
 * per-minute token ceiling once the queue spreads them out. */
const SWEEP_BATCH = 100;

export const enrichAiSweepTask = schedules.task({
  id: "enrich-ai-sweep",
  // Every 3 hours. Enrichment isn't time-critical; this only needs to be
  // frequent enough that a transient failure self-heals the same day.
  cron: "0 */3 * * *",
  run: async () => {
    const db = getDb();
    const listingIds = await findEnrichmentBacklog(db, SWEEP_BATCH);

    if (listingIds.length === 0) {
      logger.log("enrich-ai-sweep: nothing to do");
      return { refired: 0 };
    }

    await enrichAiTask.batchTrigger(
      listingIds.map((listingId) => ({ payload: { listingId } }))
    );

    logger.log("enrich-ai-sweep: re-fired enrich-ai", {
      refired: listingIds.length,
      capped: listingIds.length === SWEEP_BATCH,
    });
    return { refired: listingIds.length };
  },
});
