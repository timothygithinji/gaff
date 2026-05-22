import { env } from "cloudflare:workers";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { Hono } from "hono";
import { createAuth } from "./lib/auth";
import { parseEnv } from "./lib/env";

import type { TextEnv } from "./lib/env";

/**
 * Worker environment bindings. Composes the Zod-validated text env
 * (DATABASE_URL, BETTER_AUTH_*, etc. — see `src/lib/env.ts`) with the
 * non-string Worker bindings (KV, R2). With our `nodejs_compat` +
 * `nodejs_compat_populate_process_env` compat flags, the text values
 * land on BOTH `c.env` and `process.env` — `parseEnv()` validates the
 * latter at request entry so we never read an `undefined` past this
 * boundary.
 */
export type Env = TextEnv & {
  // Bindings (populated by Pulumi via `t-stack provision`).
  KV: KVNamespace;
  BUCKET: R2Bucket;
};

/**
 * Hono app for non-SSR Worker routes. `/health` is a cheap probe; the
 * `/api/auth/*` mount delegates every method to a per-request Better Auth
 * instance so Neon + KV bindings are bound at the right time.
 */
const api = new Hono<{ Bindings: Env }>();

api.get("/health", (c) => c.json({ ok: true }));

api.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw)
);

/**
 * TanStack Start request handler. Built once per isolate; the stream
 * handler emits the SSR HTML and re-hydrates on the client via the virtual
 * client entry. The router factory is resolved by Start's vite plugin from
 * `src/router.tsx` and injected at build time.
 */
const startFetch = createStartHandler(defaultStreamHandler);

/**
 * Custom server entry. `createServerEntry` defines the universal fetch
 * handler shape that both Cloudflare Workers and Node.js adapters consume.
 * Worker bindings come in via `cloudflare:workers`'s `env` import; we hand
 * them to Hono as its `Bindings` so the auth handler can find
 * `DATABASE_URL`/`KV`/etc. without any `process.env` indirection.
 *
 * Routing:
 *   - `/health` and `/api/*` → Hono
 *   - everything else        → TanStack Start SSR
 */
export default createServerEntry({
  fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      // Validate the text env on every API request entry — `parseEnv`
      // is cached after first success, so this is cheap on subsequent
      // calls within the same isolate. The narrowed return type is
      // what Hono routes (c.env) lean on.
      const textEnv = parseEnv(process.env);
      return api.fetch(request, { ...textEnv, ...env } as Env);
    }

    return startFetch(request);
  },
});
