/**
 * Build stub for `@better-auth/kysely-adapter`.
 *
 * Gaff configures better-auth with the **Drizzle** adapter (`drizzleAdapter`,
 * provider "pg") and runs schema migrations with drizzle-kit — we never touch
 * better-auth's Kysely path. But better-auth's `db/get-migration.mjs`
 * *statically* imports `createKyselyAdapter` from `@better-auth/kysely-adapter`,
 * which transitively pulls Kysely's sqlite dialects. Those reference Kysely
 * named exports (`DEFAULT_MIGRATION_TABLE`, `DEFAULT_MIGRATION_LOCK_TABLE`)
 * that aren't present in the installed Kysely build, so the Cloudflare Worker
 * production bundle (`vite build`) fails with rollup MISSING_EXPORT errors.
 *
 * Aliasing the package to this no-op (see `vite.config.ts`) keeps that static
 * import resolvable while dropping the broken dialect graph. These functions
 * are never invoked at runtime — they only exist on the dead better-auth
 * migration code path.
 */

export function createKyselyAdapter() {
  return { kysely: null, databaseType: null } as const;
}

export function getKyselyDatabaseType() {
  return null;
}

export function kyselyAdapter() {
  return null;
}
