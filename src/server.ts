import { env } from "cloudflare:workers";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { and, eq } from "drizzle-orm";
import { getDb, listingPhotos } from "../db";
import { createAuth } from "./lib/auth";
import { parseEnv } from "./lib/env";
import { presignR2GetUrl } from "./lib/r2-presign";

import type { TextEnv } from "./lib/env";

/**
 * Worker environment bindings. Composes the Zod-validated text env
 * (DATABASE_URL, BETTER_AUTH_*, etc. — see `src/lib/env.ts`) with the
 * non-string Worker bindings (KV, R2). With our `nodejs_compat` +
 * `nodejs_compat_populate_process_env` compat flags, the text values
 * land on `process.env`; `parseEnv()` validates at request entry so we
 * never read an `undefined` past this boundary.
 */
export type Env = TextEnv & {
  // Bindings (populated by Pulumi via `t-stack provision`).
  KV: KVNamespace;
  BUCKET: R2Bucket;
};

/**
 * TanStack Start request handler. Built once per isolate; the stream
 * handler emits the SSR HTML and re-hydrates on the client via the virtual
 * client entry. The router factory is resolved by Start's vite plugin from
 * `src/router.tsx` and injected at build time.
 */
const startFetch = createStartHandler(defaultStreamHandler);

/**
 * Presign the R2 GET URL `cf.image` resizes from, or null when this Worker has
 * no R2 credentials staged (then the caller serves full-size from the binding
 * instead of failing). The Trigger workers write R2 over the same creds; they
 * land on the Worker's `process.env` via the Doppler → secrets sync.
 */
function presignResizeSource(key: string): Promise<string> | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!(accountId && accessKeyId && secretAccessKey && bucket)) {
    return null;
  }
  return presignR2GetUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    key,
  });
}

/**
 * Listing-photo object paths. `cache-photos.ts` stores R2 objects under
 * keys shaped exactly like the request path minus the leading slash:
 *   clusters/{clusterId}/listings/{listingId}/{position}-{hash}.{ext}
 * so the pathname IS the R2 key. Keys embed a content hash, so responses
 * are immutable and safe to cache hard.
 */
const PHOTO_PATH_RE =
  /^\/clusters\/[^/]+\/listings\/[^/]+\/[^/]+\.(?:jpe?g|png|webp|gif|avif)$/i;

/**
 * Custom server entry. `createServerEntry` defines the universal fetch
 * handler shape that both Cloudflare Workers and Node.js adapters consume.
 * Worker bindings come in via `cloudflare:workers`'s `env` import.
 *
 * Routing:
 *   - `/health`         → liveness probe
 *   - `/api/auth/*`     → Better Auth (built per-request so Neon + KV bind
 *                         against the current isolate's env)
 *   - everything else   → TanStack Start SSR
 */
export default createServerEntry({
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    // Serve cached listing photos straight off the R2 bucket. Without this
    // branch these paths fall through to SSR and 404, so any listing whose
    // photos were cached (r2Key set) shows broken images.
    if (PHOTO_PATH_RE.test(url.pathname)) {
      // Render-time downscale. `sizedPhoto()` (src/lib/photo-size.ts) appends
      // `?w=` for the width a component renders at. Re-fetch the un-sized
      // object through Cloudflare's image transform so the edge serves a
      // right-sized, format-negotiated (webp/avif) variant from the single
      // max-res R2 source — that's how a full-width hero stays sharp without
      // upscaling. The subrequest re-enters this Worker WITHOUT `?w`, which
      // serves the raw bytes below; `cf.image` then resizes that response.
      // If Transformations aren't enabled on the zone (or in local workerd),
      // `cf.image` is ignored and the original is served, so this is safe.
      const key = decodeURIComponent(url.pathname.slice(1));
      const widthParam = Number(url.searchParams.get("w"));
      if (Number.isInteger(widthParam) && widthParam > 0 && widthParam <= 4096) {
        // Resize from the object's PRESIGNED R2 URL rather than re-fetching
        // our own `/clusters/*` path. That path is behind Cloudflare Access,
        // and `cf.image` fetches the source without forwarding auth headers —
        // so it would get the Access login page and fail with `9412 (origin
        // returned a non-image)`. R2's S3 host isn't behind Access and the
        // presigned URL carries auth in the query string, which the resizer
        // preserves. `/clusters/*` stays gated; only the resize source is R2.
        const presignedUrl = await presignResizeSource(key);
        if (presignedUrl) {
          // Cache the transformed variant keyed on the (stable) request URL.
          // Without this every load re-fetches R2 and re-runs the transform —
          // `cf.image`'s own cache can't help because the presigned source URL
          // changes each request. Keys are content-hashed, so immutable.
          // `caches.default` is a Cloudflare extension absent from the DOM
          // `CacheStorage` type; structurally type just what we use.
          const cache = (
            caches as unknown as {
              default: {
                match(req: Request): Promise<Response | undefined>;
                put(req: Request, res: Response): Promise<void>;
              };
            }
          ).default;
          const hit = await cache.match(request);
          if (hit) {
            return hit;
          }
          const resized = await fetch(presignedUrl, {
            cf: {
              image: {
                width: widthParam,
                fit: "scale-down",
                quality: 82,
              },
            },
          });
          const response = new Response(resized.body, resized);
          response.headers.set(
            "cache-control",
            "public, max-age=31536000, immutable"
          );
          if (response.ok) {
            await cache.put(request, response.clone());
          }
          return response;
        }
        // No R2 creds staged on this Worker → fall through and serve the
        // full-size bytes from the binding rather than failing.
      }
      const object = await (env as unknown as Env).BUCKET.get(key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("cache-control", "public, max-age=31536000, immutable");
        return new Response(object.body, { headers });
      }
      // Object isn't in the bound bucket. This is the normal case in local
      // dev: `cache-photos` uploads to the real remote bucket over the S3
      // API, so the miniflare bucket `vite dev` binds stays empty — yet the
      // DB (especially under `dev:prod`) still hands back `clusters/…` keys.
      // Fall back to the portal URL stored alongside the key so images
      // render instead of 404ing. In prod the object normally exists so we
      // never reach here, but an evicted object now degrades gracefully too.
      // The key is `clusters/{cluster}/listings/{listingId}/{file}`; pull the
      // listingId out so the lookup rides the listing_id index.
      const listingId = key.split("/")[3];
      if (listingId) {
        const [row] = await getDb()
          .select({ url: listingPhotos.url })
          .from(listingPhotos)
          .where(
            and(
              eq(listingPhotos.listingId, listingId),
              eq(listingPhotos.r2Key, key)
            )
          )
          .limit(1);
        if (row?.url) {
          return Response.redirect(row.url, 302);
        }
      }
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname.startsWith("/api/auth/")) {
      // Validate the text env on entry — `parseEnv` is cached after first
      // success, so this is cheap on subsequent calls within the same
      // isolate.
      const textEnv = parseEnv(process.env);
      return createAuth({ ...textEnv, ...env } as Env).handler(request);
    }

    return startFetch(request);
  },
});
