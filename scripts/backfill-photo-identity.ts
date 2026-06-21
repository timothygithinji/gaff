/**
 * Backfill photo identity signals onto existing `listing_photos` rows.
 *
 *   content_key — derived from the URL, no download. One bulk UPDATE.
 *   phash       — perceptual dHash, needs the bytes. Downloaded from the
 *                 original portal URL (Zoopla/Rightmove CDNs are stable),
 *                 hashed with sharp, written in batches. Concurrency-limited
 *                 to stay polite to the CDNs.
 *
 * Idempotent: only touches rows where the target column is NULL, so it can be
 * re-run to pick up failures. Best-effort on phash — an undecodable or 404'd
 * image is left NULL and logged in the tally.
 *
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/<org> \
 *     -- bun scripts/backfill-photo-identity.ts [--limit N] [--concurrency K]
 */
import { Pool } from "@neondatabase/serverless";
import { perceptualHash } from "../src/lib/cluster/dhash";
import { photoContentKey } from "../src/lib/cluster/photo-identity";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set (run via doppler prd)");
}
function numArg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) {
    return fallback;
  }
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const argLimit = numArg("--limit", 0);
const concurrency = numArg("--concurrency", 8);

const pool = new Pool({ connectionString: url });

// ---- 1. content_key (free, bulk) ----
{
  const { rows } = await pool.query<{ id: string; url: string }>(
    "SELECT id, url FROM listing_photos WHERE content_key IS NULL"
  );
  if (rows.length > 0) {
    const ids: string[] = [];
    const keys: string[] = [];
    for (const r of rows) {
      const k = photoContentKey(r.url);
      if (k) {
        ids.push(r.id);
        keys.push(k);
      }
    }
    await pool.query(
      `UPDATE listing_photos AS lp SET content_key = v.ck
       FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS ck) v
       WHERE lp.id = v.id`,
      [ids, keys]
    );
    console.log(`content_key: set ${ids.length} (of ${rows.length} NULL rows)`);
  } else {
    console.log("content_key: nothing to backfill");
  }
}

// ---- 2. phash (download + hash) ----
const { rows: todo } = await pool.query<{ id: string; url: string }>(
  `SELECT id, url FROM listing_photos WHERE phash IS NULL
   ${argLimit ? `LIMIT ${argLimit}` : ""}`
);
console.log(`phash: ${todo.length} rows to hash (concurrency ${concurrency})`);

let done = 0;
let ok = 0;
let failed = 0;
const FETCH_TIMEOUT_MS = 10_000;

async function hashOne(row: { id: string; url: string }): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let buf: ArrayBuffer;
    try {
      const res = await fetch(row.url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`fetch ${res.status}`);
      }
      buf = await res.arrayBuffer();
    } finally {
      clearTimeout(timer);
    }
    const phash = await perceptualHash(Buffer.from(buf));
    if (phash) {
      await pool.query("UPDATE listing_photos SET phash = $1 WHERE id = $2", [
        phash,
        row.id,
      ]);
      ok++;
    } else {
      failed++;
    }
  } catch {
    failed++;
  } finally {
    done++;
    if (done % 200 === 0) {
      console.log(`  ${done}/${todo.length} (ok ${ok}, failed ${failed})`);
    }
  }
}

// Simple fixed-size worker pool over the queue.
let cursor = 0;
async function worker(): Promise<void> {
  while (cursor < todo.length) {
    const row = todo[cursor++];
    if (row) {
      await hashOne(row);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));

console.log(`\nphash done: ok ${ok}, failed ${failed}, total ${todo.length}`);
await pool.end();
process.exit(0);
