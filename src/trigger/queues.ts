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
 * `enrich` — `cluster` plus the per-cluster geo enrichers (EPC, flood,
 * amenities, …). These hit Neon and gov/OSM APIs, never Zyte, so they
 * don't belong behind the scrape cap. AI enrichment is deliberately NOT
 * on this queue — see `aiQueue`.
 */
export const enrichQueue = queue({
  name: "enrich",
  concurrencyLimit: 15,
});

/**
 * `ai` — `enrich-ai` only. It's the one Anthropic-bound task, and
 * Anthropic rate-limits the org by input-tokens-per-MINUTE (~50k), not by
 * concurrency. Each call averages ~4k input tokens, so ~12 calls/min is
 * the real ceiling. A low concurrency keeps the instantaneous burst small
 * (≤3 × 4k = 12k) so the queue trickles rather than slamming the limit;
 * `enrich-ai`'s own patient retry then rides out any 429 that still lands.
 * Sharing `enrichQueue` (concurrency 15) used to fire 15 LLM calls at once
 * — ~60k tokens instantly — and exhaust the default 3 retries on 429s.
 */
export const aiQueue = queue({
  name: "ai",
  concurrencyLimit: 3,
});

/**
 * `photo` — `cache-photos` + `backfill-photo-res`. Plain image downloads from
 * portal CDNs into R2; a moderate cap keeps us under any per-IP CDN limit.
 */
export const photoQueue = queue({
  name: "photo",
  concurrencyLimit: 10,
});
