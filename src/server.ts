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
import { bucketForWidth, variantKey } from "./lib/photo-size";

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
      // `?w={bucket}` for the width a component renders at. `cache-photos`
      // PRE-GENERATES that ladder of widths and stores each beside the original
      // in R2 (`{file%ext}_w{bucket}{ext}`), so we serve a static, right-sized
      // object straight off the binding — no `cf.image` transform, so we stay
      // inside Cloudflare's free Image-Transformations tier (it bills per
      // unique transform and capped us out in one browse). A bucket at/above
      // the source width was never generated, so the lookup misses and we fall
      // through to the full-size original below — the old "scale-down" promise.
      const key = decodeURIComponent(url.pathname.slice(1));
      const widthParam = Number(url.searchParams.get("w"));
      if (Number.isInteger(widthParam) && widthParam > 0) {
        const variant = await (env as unknown as Env).BUCKET.get(
          variantKey(key, bucketForWidth(widthParam))
        );
        if (variant) {
          const headers = new Headers();
          variant.writeHttpMetadata(headers);
          headers.set("etag", variant.httpEtag);
          headers.set("cache-control", "public, max-age=31536000, immutable");
          return new Response(variant.body, { headers });
        }
        // No pre-generated variant (source narrower than the requested bucket,
        // or not yet backfilled) → serve the full-size original below.
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
