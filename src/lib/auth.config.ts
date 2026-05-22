/**
 * Static Better Auth configuration used only by the Better Auth CLI to
 * introspect required tables (`@better-auth/cli generate`). It mirrors
 * the plugin set wired in `createAuth(env)` but without any runtime
 * dependencies (no Worker bindings, no DB connection) — the CLI only
 * inspects shapes, it never queries.
 *
 * Adding a Better Auth plugin that adds tables (e.g. organization,
 * passkey, two-factor)?  Add it both here AND in `createAuth(env)`,
 * then run `bun run auth:generate` to refresh `db/auth-schema.ts`.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// The CLI inspects the adapter's `provider` to pick the right SQL dialect
// but never actually queries — pass an empty schema object so we don't
// need a Neon URL at config-load time.
const stubDb = {} as Parameters<typeof drizzleAdapter>[0];

export const auth = betterAuth({
  database: drizzleAdapter(stubDb, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  // Plugins that add tables (organization, passkey, two-factor, ...) go
  // here AND in src/lib/auth.ts. `cloudflareAccess` adds no tables, so
  // it's omitted to keep the CLI invocation hermetic.
});
