/**
 * Typesafe env loader.
 *
 * Single source of truth for every text env var Gaff reads. Doppler
 * injects these (host process.env on the dev side, Worker bindings →
 * process.env via `nodejs_compat_populate_process_env` on the Worker
 * side); we Zod-validate at parse time so missing or malformed values
 * fail at startup with a readable error instead of surfacing as
 * `undefined` deep in the call graph (the Better Auth "Base URL could
 * not be determined" warning was the canonical example — `BETTER_AUTH_URL`
 * was typed `string | undefined` and the runtime cost was just a warning).
 *
 * Worker BINDINGS (KV, BUCKET, etc.) are not in this schema — they're
 * not strings and they only exist inside workerd. Use the `Env` type
 * from `src/server.ts` for the unified shape (it composes `TextEnv`
 * here with the Worker bindings).
 *
 * Usage:
 *
 *   // Once-per-isolate cached parse (most callers):
 *   import { env } from "@/lib/env";
 *   const url = env().BETTER_AUTH_URL;
 *
 *   // Pure parse for a given source (tests, scripts):
 *   import { parseEnv } from "@/lib/env";
 *   const e = parseEnv(process.env);
 */

import { z } from "zod";

// Cloudflare Access AUD tags are 64-char lowercase hex.
const ACCESS_AUD_RE = /^[a-f0-9]{64}$/;

const envSchema = z.object({
  // Database
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid postgres:// connection string"),

  // Better Auth
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z
    .string()
    .url("BETTER_AUTH_URL must be a full origin URL (no trailing slash)"),

  // Cloudflare Access bridge
  CLOUDFLARE_ACCESS_AUD: z
    .string()
    .regex(
      ACCESS_AUD_RE,
      "CLOUDFLARE_ACCESS_AUD must be a 64-char lowercase hex string"
    ),
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: z
    .string()
    .url("CLOUDFLARE_ACCESS_TEAM_DOMAIN must be the full https:// team URL"),

  // External APIs
  ZYTE_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z
    .string()
    .startsWith("sk-ant-", "ANTHROPIC_API_KEY must start with 'sk-ant-'"),
  EPC_OPENDATA_TOKEN: z
    .string()
    .min(1, "EPC_OPENDATA_TOKEN must be the raw 'email:token' value"),
  // Browser-facing Maps key — handed to the client (Maps JS, Places
  // Autocomplete, client Directions). Referrer-restricted in GCP.
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  // Server-side Maps key for the enrichment tasks (Places New + Routes),
  // which run off-browser and so can't satisfy a referrer restriction.
  // OPTIONAL: callers fall back to GOOGLE_MAPS_API_KEY when unset, so a
  // worker without it staged degrades rather than throwing. Must NOT be
  // referrer-restricted (None / IP), and never shipped to the client.
  GOOGLE_MAPS_SERVER_KEY: z.string().min(1).optional(),
  // TfL Unified API key — OPTIONAL (anonymous works at low volume), only
  // lifts the rate limit for the StopPoint line-roundel lookups.
  TFL_APP_KEY: z.string().min(1).optional(),
  // logo.dev publishable token (pk_…) — OPTIONAL. Client-safe; handed to
  // the browser to render brand logos on the nearby-places chips. Without
  // it those chips just show a category dot.
  LOGODEV_TOKEN: z.string().min(1).optional(),

  // Trigger.dev
  TRIGGER_SECRET_KEY: z.string().min(1),

  // Resend (transactional email) — OPTIONAL, same reasoning as R2 below.
  // Only the notification tasks (send-match-email, household-digest) read it,
  // and they run on Trigger.dev workers. Marking it required would make
  // env() throw on any worker that hasn't had the secret staged yet,
  // re-running the secret-drift 500 we've already been bitten by. The
  // email client throws a clear error at send time if it's absent.
  RESEND_API_KEY: z.string().min(1).optional(),

  // R2 (Cloudflare object storage) — OPTIONAL.
  //
  // Used by `src/trigger/cache-photos.ts` (on Trigger.dev workers, which have
  // no Worker bindings) to WRITE over the S3 HTTP API, AND now by the Worker
  // itself (src/server.ts) to PRESIGN a GET URL for `cf.image` to resize from
  // — reads still go through the `BUCKET` binding, only the resize source is
  // presigned. Both land here via the Doppler → secrets sync.
  //
  // Left optional on purpose: until they're populated in Doppler the
  // cache-photos task short-circuits (photos stay un-cached and the UI
  // falls back to the original portal URL). Marking them required would
  // break unrelated Trigger tasks the moment env() runs on a worker
  // that doesn't have credentials staged yet.
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // The R2 bucket name. Defaults to "gaff-photos" but stays overridable
  // so per-branch testing can point at a different bucket without code
  // changes.
  R2_BUCKET: z.string().min(1).optional(),

  // Optional / inferred
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type TextEnv = z.infer<typeof envSchema>;

/**
 * Pure parse. Throws a multi-line `Error` listing every missing /
 * malformed var when the schema fails — easier to act on than Zod's
 * default issue array.
 */
export function parseEnv(
  source: Record<string, string | undefined> = process.env
): TextEnv {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const lines = result.error.issues.map(
    (issue) => `  • ${issue.path.join(".")}: ${issue.message}`
  );
  const detail = lines.join("\n");
  throw new Error(
    `Invalid environment — ${result.error.issues.length} issue(s):
${detail}

Check the appropriate Doppler config:
  doppler secrets --project gaff --config <dev|prd> --scope ~/.t-stack/orgs/timothygithinji --only-names
`
  );
}

// Per-isolate cache. Workerd reuses isolates across requests, so once
// we've validated once we can hand back the same value cheaply.
let cached: TextEnv | undefined;

/**
 * Lazy cached parse. Call at any read site:
 *
 *   const { BETTER_AUTH_URL } = env();
 *
 * The first call validates, subsequent calls return the cached value.
 * If you need to force a re-parse (testing), call `parseEnv(source)`
 * directly.
 */
export function env(): TextEnv {
  if (!cached) {
    cached = parseEnv();
  }
  return cached;
}

/**
 * The Maps API key for server-side calls (enrichment tasks, backfill):
 * the dedicated, non-referrer-restricted server key when present, else
 * the browser key (which only works behind the localhost Referer hack).
 */
export function mapsServerKey(): string {
  const e = env();
  return e.GOOGLE_MAPS_SERVER_KEY ?? e.GOOGLE_MAPS_API_KEY;
}

/**
 * Referer to present on server-side Google Maps calls. The browser
 * `GOOGLE_MAPS_API_KEY` is HTTP-referrer-restricted to the app origin, so
 * a worker call with no Referer 403s (`API_KEY_HTTP_REFERRER_BLOCKED`);
 * sending the app origin satisfies the restriction. Harmless when a
 * dedicated, unrestricted `GOOGLE_MAPS_SERVER_KEY` is configured (the key
 * simply ignores it). Trailing slash matches Google's `domain/*` referrer
 * patterns; `BETTER_AUTH_URL` is the app origin (no trailing slash).
 */
export function mapsServerReferer(): string {
  return `${env().BETTER_AUTH_URL}/`;
}
