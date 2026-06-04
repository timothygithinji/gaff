/**
 * One-off backfill: re-cache existing listing photos at the bumped resolution.
 *
 * Photos cached before the Zoopla `645/430 → 1600/1200` bump (see
 * `ZOOPLA_IMG_BASE` in src/lib/parsers/zoopla.ts) are frozen in R2 at the old
 * small size — `cache-photos` only ever fetches rows with `r2_key IS NULL`, so
 * nothing re-pulls them, and the Worker's render-time resize can only scale a
 * source DOWN (`fit: scale-down`), never sharpen it. Result: old listings stay
 * pixelated on full-width heroes no matter what we change going forward.
 *
 * This task fixes that for the photos already on disk:
 *
 *   1. Rewrite each Zoopla photo's stored `url` to the max-res size. The
 *      lid.zoocdn.com CDN is a resize proxy keyed on the `{w}/{h}` path
 *      segment, so the SAME filename re-pulls at 1600×1200 — `/645/430/`,
 *      `/u/480/360/`, `/1024/768/` etc. all rewrite to `/1600/1200/`.
 *   2. Null `r2_key` on those rows so `cache-photos` picks them up again.
 *   3. `batchTrigger` `cache-photos` per affected listing to re-download +
 *      re-upload at the larger size.
 *
 * While `r2_key` is null the UI falls back to the (now max-res) portal URL, so
 * there's no broken-image window — photos only get sharper, never disappear.
 *
 * Run it from the Trigger dashboard (or `trigger.dev` MCP) with `{}` to execute,
 * or `{ "dryRun": true }` first to see how many rows/listings it would touch.
 * `scope: "all"` additionally re-caches non-Zoopla photos, but Rightmove /
 * OpenRent are already stored at native resolution so that gains nothing and
 * just re-uploads them — leave it on the default "zoopla" unless you have a
 * specific reason.
 *
 * Note: the previous (small) R2 objects are orphaned, not deleted — re-caching
 * writes a fresh key. Storage cost is negligible; a bucket lifecycle rule can
 * sweep them later if it ever matters.
 */

import { logger, task } from "@trigger.dev/sdk";
import { eq, ilike } from "drizzle-orm";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { cachePhotosTask } from "./cache-photos";
import { scrapeQueue } from "./queues";

/**
 * Largest size lid.zoocdn.com's resize proxy serves (kept in step with
 * `ZOOPLA_IMG_BASE`). Anything above this 404s on the CDN's size allowlist.
 */
const ZOOPLA_MAX_W = 1600;
const ZOOPLA_MAX_H = 1200;

/** `https://lid.zoocdn.com/[u/]{w}/{h}/{filename}` → capture base + filename. */
const ZOOCDN_SIZE_RE = /^(https:\/\/lid\.zoocdn\.com\/)(?:u\/)?\d+\/\d+\/(.+)$/i;

/**
 * Rewrite a Zoopla CDN URL to the max render size, preserving the filename.
 * Returns null when the URL isn't a sized zoocdn URL or is already at max
 * (so the caller can skip it — keeps the backfill idempotent).
 */
function zooplaMaxUrl(url: string): string | null {
  const m = url.match(ZOOCDN_SIZE_RE);
  if (!m) {
    return null;
  }
  const next = `${m[1]}${ZOOPLA_MAX_W}/${ZOOPLA_MAX_H}/${m[2]}`;
  return next === url ? null : next;
}

export type BackfillPhotoResPayload = {
  /**
   * "zoopla" (default) re-pulls only the downsampled Zoopla photos. "all"
   * also resets every other portal's cached photos — rarely useful since
   * they're already native res.
   */
  scope?: "zoopla" | "all";
  /** Report what would change without writing or re-caching. */
  dryRun?: boolean;
};

export type BackfillPhotoResOutput = {
  scope: "zoopla" | "all";
  dryRun: boolean;
  /** Zoopla rows whose URL was upgraded to max size. */
  zooplaRewritten: number;
  /** Total rows whose `r2_key` was reset to NULL. */
  rowsReset: number;
  /** Listings handed to `cache-photos` for re-download. */
  listingsQueued: number;
};

/** Trigger.dev batchTrigger caps at 500 items/call; stay well under it. */
const BATCH_CHUNK = 100;

export const backfillPhotoResTask = task({
  id: "backfill-photo-res",
  queue: scrapeQueue,
  maxDuration: 600,

  run: async (
    payload: BackfillPhotoResPayload = {}
  ): Promise<BackfillPhotoResOutput> => {
    const db = getDb();
    const scope = payload.scope ?? "zoopla";
    const dryRun = payload.dryRun ?? false;

    // "zoopla" narrows to the downsampled CDN; "all" scans every photo.
    const rows = await db
      .select({
        id: schema.listingPhotos.id,
        listingId: schema.listingPhotos.listingId,
        url: schema.listingPhotos.url,
        r2Key: schema.listingPhotos.r2Key,
      })
      .from(schema.listingPhotos)
      .where(
        scope === "all"
          ? undefined
          : ilike(schema.listingPhotos.url, "%lid.zoocdn.com%")
      );

    let zooplaRewritten = 0;
    let rowsReset = 0;
    const listingIds = new Set<string>();

    for (const row of rows) {
      const maxUrl = zooplaMaxUrl(row.url);
      // Reset when we can upgrade a Zoopla URL, or (scope "all") when a
      // non-Zoopla row is currently cached and would be re-pulled as-is.
      const needsReset = maxUrl !== null || (scope === "all" && row.r2Key);
      if (!needsReset) {
        continue;
      }

      listingIds.add(row.listingId);
      rowsReset += 1;
      if (maxUrl) {
        zooplaRewritten += 1;
      }

      if (!dryRun) {
        await db
          .update(schema.listingPhotos)
          .set({ url: maxUrl ?? row.url, r2Key: null })
          .where(eq(schema.listingPhotos.id, row.id));
      }
    }

    const listingIdList = [...listingIds];
    if (!dryRun) {
      for (let i = 0; i < listingIdList.length; i += BATCH_CHUNK) {
        await cachePhotosTask.batchTrigger(
          listingIdList
            .slice(i, i + BATCH_CHUNK)
            .map((listingId) => ({ payload: { listingId } }))
        );
      }
    }

    logger.log("backfill-photo-res: done", {
      scope,
      dryRun,
      zooplaRewritten,
      rowsReset,
      listingsQueued: listingIdList.length,
    });

    return {
      scope,
      dryRun,
      zooplaRewritten,
      rowsReset,
      listingsQueued: listingIdList.length,
    };
  },
});
