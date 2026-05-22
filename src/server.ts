import { env } from "cloudflare:workers";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { Hono } from "hono";
import { createAuth } from "./lib/auth";

/**
 * Worker environment bindings. Mirrors `wrangler.jsonc` and the secrets
 * fed in via Doppler. Better Auth + the Cloudflare Access bridge both read
 * `KV`, `CLOUDFLARE_ACCESS_AUD`, and `CLOUDFLARE_ACCESS_TEAM_DOMAIN` at
 * request time — never at module load — because the Cloudflare Vite plugin
 * does not populate `process.env` until inside `fetch`.
 */
export type Env = {
  // Secrets
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  TRIGGER_SECRET_KEY: string;
  CLOUDFLARE_ACCESS_AUD: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: string;

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
      return api.fetch(request, env as Env);
    }

    return startFetch(request);
  },
});
