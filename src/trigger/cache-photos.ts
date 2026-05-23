/**
 * Per-listing photo download task.
 *
 * For each row in `listing_photos` with `r2_key IS NULL`:
 *
 *   1. Fetch the portal CDN URL (plain `fetch` — these are public assets,
 *      no Zyte needed).
 *   2. Upload the bytes to R2 under
 *      `clusters/{clusterId}/listings/{listingId}/{position}-{nanoid8}.jpg`.
 *   3. UPDATE `listing_photos.r2_key` with the resulting object key.
 *
 * v1 fallback — R2 PUT is gated on R2_* env vars being set. They are
 * marked optional in `src/lib/env.ts` precisely so this task can NO-OP
 * when credentials aren't staged yet, instead of crashing every Trigger
 * worker that boots without them. When `r2_key` stays NULL the listing
 * detail UI falls back to the original portal URL — slightly worse
 * latency, but the user never sees a broken image.
 *
 * Why not just use the Worker's R2 binding? Trigger.dev's workers run on
 * a separate runtime (Node-on-Fly, not workerd), so `env.BUCKET` isn't
 * reachable from here. The S3-compatible HTTP API is the path that works
 * from both sides; the Worker can also fall back to it if needed.
 *
 * Concurrency: this task lives on `scrapeQueue` (concurrencyLimit 5), and
 * within a single run we download photos sequentially. That bounds total
 * outbound bandwidth to ~5 photos in flight across the whole fleet,
 * which keeps us comfortably under any portal CDN's per-IP rate limit.
 */

import { logger, task } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { env } from "../lib/env";
import { scrapeQueue } from "./queues";

export type CachePhotosPayload = {
  listingId: string;
};

export type CachePhotosOutput = {
  listingId: string;
  cached: number;
  skipped: number;
  failed: number;
};

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Pull the file extension off a content-type, defaulting to .jpg.
 * Portal CDNs occasionally return `image/jpeg`, `image/png`, or
 * `image/webp`; we keep the mapping conservative — anything we don't
 * recognise falls back to `.jpg` so the key always ends in something
 * displayable.
 */
function extFromContentType(contentType: string | null): string {
  if (!contentType) {
    return "jpg";
  }
  const ct = contentType.toLowerCase();
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

/**
 * Upload one image's bytes to R2 via the S3-compatible HTTP API.
 *
 * For v1 we use the simplest possible SigV4 signing path — the official
 * `aws4fetch` package would normally do this, but we're already pinned
 * tight on dependencies and AWS4 over plain fetch is a known shape. We
 * deliberately don't import @aws-sdk here; that pulls a 2MB runtime that
 * the Trigger worker doesn't need.
 *
 * Returns the R2 object key so the caller can store it on the
 * listing_photos row.
 */
async function uploadToR2(args: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  body: ArrayBuffer;
  contentType: string;
}): Promise<void> {
  const {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    key,
    body,
    contentType,
  } = args;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${bucket}/${key}`;

  // SigV4 signing — minimal implementation for a single PUT.
  const now = new Date();
  const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, "")}`;
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const bodyBuf = body;
  const payloadHash = await sha256Hex(bodyBuf);

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    `/${bucket}/${key}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = await hmacHex(kSigning, stringToSign);

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Host: host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
      "Content-Type": contentType,
      "Content-Length": bodyBuf.byteLength.toString(),
    },
    body: bodyBuf,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `R2 PUT ${res.status} ${res.statusText}: ${errBody.slice(0, 200)}`
    );
  }
}

/**
 * Hand the raw bytes to crypto.subtle.digest. workerd's WebCrypto types
 * are picky about `Uint8Array<ArrayBufferLike>` vs the spec's
 * `Uint8Array<ArrayBuffer>`, so we route every call through a fresh
 * `ArrayBuffer` copy. Cheap relative to a network upload.
 */
function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(
  key: string | Uint8Array,
  data: string
): Promise<Uint8Array> {
  const keyBytes =
    typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(new TextEncoder().encode(data))
  );
  return new Uint8Array(sig);
}

async function hmacHex(key: Uint8Array, data: string): Promise<string> {
  const sig = await hmac(key, data);
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const cachePhotosTask = task({
  id: "cache-photos",
  queue: scrapeQueue,
  maxDuration: 300,

  run: async (payload: CachePhotosPayload): Promise<CachePhotosOutput> => {
    const db = getDb();
    const { listingId } = payload;
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
      env();

    // v1 short-circuit: no R2 creds → no caching. The listing_photos rows
    // still exist with the original portal URLs; the UI falls back to
    // those. PR 5.1 (or whenever the Doppler secrets land) will flip this
    // path live without any code changes here.
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET
    ) {
      logger.warn(
        "cache-photos: R2 credentials not set — skipping cache (v1.1 polish)",
        { listingId }
      );
      return { listingId, cached: 0, skipped: 0, failed: 0 };
    }

    // We need the listing's clusterId to build the R2 key prefix. Rows
    // whose cluster_id is still NULL got here in error (cluster task
    // should have run first), but we tolerate them by keying off the
    // listing id alone as a fallback path.
    const listing = await db.query.listings.findFirst({
      where: (l, { eq: eqOp }) => eqOp(l.id, listingId),
    });
    if (!listing) {
      throw new Error(`cache-photos: listing ${listingId} not found`);
    }
    const clusterId = listing.clusterId ?? `unclustered-${listingId}`;

    const rows = await db
      .select({
        id: schema.listingPhotos.id,
        url: schema.listingPhotos.url,
        position: schema.listingPhotos.position,
        r2Key: schema.listingPhotos.r2Key,
      })
      .from(schema.listingPhotos)
      .where(
        and(
          eq(schema.listingPhotos.listingId, listingId),
          isNull(schema.listingPhotos.r2Key)
        )
      );

    let cached = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      if (row.r2Key) {
        skipped += 1;
        continue;
      }
      try {
        const res = await fetchWithTimeout(row.url);
        if (!res.ok) {
          throw new Error(`fetch ${res.status} ${res.statusText}`);
        }
        const buf = await res.arrayBuffer();
        const ext = extFromContentType(res.headers.get("content-type"));
        const key = `clusters/${clusterId}/listings/${listingId}/${row.position}-${nanoid(8)}.${ext}`;
        await uploadToR2({
          accountId: R2_ACCOUNT_ID,
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
          bucket: R2_BUCKET,
          key,
          body: buf,
          contentType: res.headers.get("content-type") ?? `image/${ext}`,
        });
        await db
          .update(schema.listingPhotos)
          .set({ r2Key: key })
          .where(eq(schema.listingPhotos.id, row.id));
        cached += 1;
      } catch (err) {
        failed += 1;
        logger.error("cache-photos: photo failed, leaving r2_key NULL", {
          listingId,
          photoId: row.id,
          url: row.url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.log("cache-photos: done", {
      listingId,
      cached,
      skipped,
      failed,
    });

    return { listingId, cached, skipped, failed };
  },
});
