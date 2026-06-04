/**
 * One-off: re-cache existing Zoopla listing photos at max resolution.
 *
 * The Trigger task `src/trigger/backfill-photo-res.ts` does the same thing for
 * post-merge/automated use, but running THAT requires a `trigger deploy`, which
 * would also ship this branch's other in-flight trigger changes to prod. This
 * script is the deploy-free way to run the backfill now: it talks straight to
 * the prod DB + R2 over the same helpers the Worker/Trigger code uses.
 *
 * What it does, per Zoopla photo (lid.zoocdn.com) currently cached at the old
 * 645×430 size:
 *   1. Rewrite the stored `url` to the 1600×1200 variant (same filename — the
 *      CDN is a resize proxy keyed on the `{w}/{h}` path segment).
 *   2. Download that max-res image.
 *   3. PUT it to R2 under the canonical key and point `listing_photos.r2_key`
 *      at the new object.
 *
 * Run it:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji -- \
 *     bun scripts/backfill-photo-res.ts --dry-run        # preview counts
 *   doppler run ... -- bun scripts/backfill-photo-res.ts # execute
 *
 * Idempotent: rows already at 1600/1200 are skipped, so re-running is safe.
 * The previous (small) R2 objects are orphaned, not deleted.
 */

import { and, eq, ilike, isNotNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { env } from "../src/lib/env";
import { r2Put } from "../src/lib/r2-s3";

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 15_000;

const ZOOPLA_MAX_W = 1600;
const ZOOPLA_MAX_H = 1200;
/** `https://lid.zoocdn.com/[u/]{w}/{h}/{filename}` → base + filename capture. */
const ZOOCDN_SIZE_RE = /^(https:\/\/lid\.zoocdn\.com\/)(?:u\/)?\d+\/\d+\/(.+)$/i;

function zooplaMaxUrl(url: string): string | null {
  const m = url.match(ZOOCDN_SIZE_RE);
  if (!m) {
    return null;
  }
  const next = `${m[1]}${ZOOPLA_MAX_W}/${ZOOPLA_MAX_H}/${m[2]}`;
  return next === url ? null : next;
}

function extFromContentType(contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png")) {
    return "png";
  }
  if (ct.includes("webp")) {
    return "webp";
  }
  if (ct.includes("gif")) {
    return "gif";
  }
  return "jpg";
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type PhotoRow = {
  id: string;
  listingId: string;
  clusterId: string | null;
  url: string;
  position: number;
};

async function recachePhoto(
  row: PhotoRow,
  creds: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }
): Promise<"done" | "skipped" | "failed"> {
  const maxUrl = zooplaMaxUrl(row.url);
  if (!maxUrl) {
    return "skipped";
  }
  const db = getDb();
  try {
    const res = await fetchWithTimeout(maxUrl);
    if (!res.ok) {
      throw new Error(`fetch ${res.status} ${res.statusText}`);
    }
    const body = await res.arrayBuffer();
    const ext = extFromContentType(res.headers.get("content-type"));
    const clusterId = row.clusterId ?? `unclustered-${row.listingId}`;
    const key = `clusters/${clusterId}/listings/${row.listingId}/${row.position}-${nanoid(8)}.${ext}`;
    await r2Put({
      creds,
      key,
      body,
      contentType: res.headers.get("content-type") ?? `image/${ext}`,
    });
    await db
      .update(schema.listingPhotos)
      .set({ url: maxUrl, r2Key: key })
      .where(eq(schema.listingPhotos.id, row.id));
    return "done";
  } catch (err) {
    console.error(
      `  ✗ ${row.id} (${row.url}): ${err instanceof Error ? err.message : String(err)}`
    );
    return "failed";
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
  } = env();

  // Pull every Zoopla photo that's currently cached (r2_key set) — those are
  // the ones frozen at the old size. Join listings for the cluster prefix.
  const rows = (await db
    .select({
      id: schema.listingPhotos.id,
      listingId: schema.listingPhotos.listingId,
      clusterId: schema.listings.clusterId,
      url: schema.listingPhotos.url,
      position: schema.listingPhotos.position,
    })
    .from(schema.listingPhotos)
    .innerJoin(
      schema.listings,
      eq(schema.listingPhotos.listingId, schema.listings.id)
    )
    .where(
      and(
        ilike(schema.listingPhotos.url, "%lid.zoocdn.com%"),
        isNotNull(schema.listingPhotos.r2Key)
      )
    )) as PhotoRow[];

  const upgradeable = rows.filter((r) => zooplaMaxUrl(r.url) !== null);
  const listings = new Set(upgradeable.map((r) => r.listingId));

  console.log(
    `Zoopla cached photos: ${rows.length} | upgradeable (not yet 1600/1200): ${upgradeable.length} across ${listings.size} listings`
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: no changes written. Re-run without it to execute.");
    return;
  }

  if (
    !(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET)
  ) {
    throw new Error("R2_* env vars missing — cannot upload. Check Doppler scope.");
  }
  const creds = {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };

  let done = 0;
  let failed = 0;
  // Simple fixed-size worker pool over the upgradeable rows.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < upgradeable.length) {
      const row = upgradeable[cursor++];
      if (!row) {
        break;
      }
      const result = await recachePhoto(row, creds);
      if (result === "done") {
        done += 1;
      } else if (result === "failed") {
        failed += 1;
      }
      if ((done + failed) % 25 === 0) {
        console.log(`  …${done + failed}/${upgradeable.length}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker())
  );

  console.log(
    `\nDone. re-cached ${done}, failed ${failed}, listings touched ${listings.size}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
