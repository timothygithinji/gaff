/**
 * Trigger.dev v4 requires queues to be pre-declared as module-level
 * `queue(...)` calls so the indexer can register them at deploy time.
 *
 * `scrape` bounds concurrent Zyte calls across every search × every
 * portal. The free tier is rate-limited and a single `scrape-search`
 * dispatch that fans out three portals across N searches could
 * otherwise burst past the per-second cap. Five concurrent requests
 * tracks the live verification runs without overshooting.
 */
import { queue } from "@trigger.dev/sdk";

export const scrapeQueue = queue({
  name: "scrape",
  concurrencyLimit: 5,
});
