/**
 * Trigger.dev v4 requires queues to be pre-declared as module-level
 * `queue(...)` calls so the indexer can register them at deploy time.
 *
 * Three queues, split by which external dependency the task actually loads,
 * so a backfill of one stage can't starve the others (everything used to
 * share one concurrency-5 queue, so cache-photos + enrichers queued behind
 * scrapes for hours).
 */
import { queue } from "@trigger.dev/sdk";

/**
 * `scrape` — the only Zyte-bound tasks (`scrape-portal`, `scrape-detail`).
 * Zyte rate-limits by requests-per-MINUTE, not concurrency, and `zyteFetch`
 * now retries 429s with backoff, so this is just a sane ceiling on concurrent
 * browser renders rather than the rate-limiter it used to be. ~10 × ~7s per
 * render ≈ 85 req/min, well under standard-plan limits; raise once the Zyte
 * plan's RPM is confirmed.
 */
export const scrapeQueue = queue({
  name: "scrape",
  concurrencyLimit: 10,
});

/**
 * `enrich` — `cluster` plus the per-cluster enrichers. These hit Neon and
 * gov/OSM APIs, never Zyte, so they don't belong behind the scrape cap.
 */
export const enrichQueue = queue({
  name: "enrich",
  concurrencyLimit: 15,
});

/**
 * `photo` — `cache-photos` + `backfill-photo-res`. Plain image downloads from
 * portal CDNs into R2; a moderate cap keeps us under any per-IP CDN limit.
 */
export const photoQueue = queue({
  name: "photo",
  concurrencyLimit: 10,
});
