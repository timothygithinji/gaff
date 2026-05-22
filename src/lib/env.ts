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
  GOOGLE_MAPS_API_KEY: z.string().min(1),

  // Trigger.dev
  TRIGGER_SECRET_KEY: z.string().min(1),

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
