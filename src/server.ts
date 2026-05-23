import { env } from "cloudflare:workers";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { createAuth } from "./lib/auth";
import { parseEnv } from "./lib/env";

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
  fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
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
