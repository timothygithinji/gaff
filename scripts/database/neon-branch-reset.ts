#!/usr/bin/env bun
/**
 * Neon Database Branch Reset
 *
 * Deletes the current git branch's Neon branch and recreates it from main,
 * waits for the endpoint to become ready, and applies pending Drizzle
 * migrations.
 *
 * This is the "blow it away and start fresh" path. For an in-place reset that
 * preserves the branch ID, Neon offers `neonctl branches reset --parent`, but
 * we prefer delete+create for symmetry with `db:branch:create`.
 *
 * Usage:
 *   bun run db:branch:reset
 */

import { spawnSync } from "node:child_process";
import { getCurrentBranch, isDetachedHead, isMainBranch } from "../lib/git";
import {
  branchExists,
  createBranch,
  deleteBranch,
  getConnectionString,
  readNeonProjectId,
  sanitizeBranchName,
  waitForEndpointReady,
} from "../lib/neon";

const LOG_PREFIX = "[db:branch:reset]";
const NEON_DATABASE = "neondb";
const NEON_ROLE = "neondb_owner";

const log = {
  info: (msg: string) => console.log(`\x1b[34m${LOG_PREFIX}\x1b[0m ${msg}`),
  success: (msg: string) =>
    console.log(`\x1b[32m${LOG_PREFIX}\x1b[0m ✓ ${msg}`),
  error: (msg: string) =>
    console.error(`\x1b[31m${LOG_PREFIX}\x1b[0m ✗ ${msg}`),
};

function applyMigrations(databaseUrl: string): void {
  log.info("Applying Drizzle migrations...");
  const result = spawnSync("bunx", ["drizzle-kit", "migrate"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (result.status !== 0) {
    throw new Error("drizzle-kit migrate failed (see output above)");
  }
  log.success("Migrations applied");
}

async function main(): Promise<void> {
  const gitBranch = getCurrentBranch();

  if (isDetachedHead()) {
    log.error("Detached HEAD — cannot determine branch to reset.");
    process.exit(1);
  }

  if (isMainBranch(gitBranch)) {
    log.error(
      "Cannot reset the main branch database. Switch to a feature branch first."
    );
    process.exit(1);
  }

  const projectId = readNeonProjectId();
  const neonBranch = sanitizeBranchName(gitBranch);
  log.info(`Resetting Neon branch: ${neonBranch} (git: ${gitBranch})`);

  const existing = await branchExists(projectId, neonBranch);
  if (existing.exists) {
    log.info("Deleting existing branch...");
    await deleteBranch(projectId, neonBranch);
    log.success("Existing branch deleted");
  } else {
    log.info("No existing branch to delete");
  }

  log.info("Creating fresh branch from main...");
  const created = await createBranch(projectId, neonBranch);
  log.success(`Branch created (${created.branchId})`);

  log.info("Waiting for endpoint to become ready...");
  await waitForEndpointReady(projectId, created.branchId);
  log.success("Endpoint ready");

  log.info("Resolving connection string...");
  const databaseUrl = getConnectionString(
    projectId,
    neonBranch,
    NEON_DATABASE,
    NEON_ROLE
  );

  applyMigrations(databaseUrl);

  log.success(
    "Done! Database is fresh from main with feature migrations applied."
  );
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  log.error(
    "If the existing branch was deleted before this failed, run 'bun run db:branch:create' to recreate it."
  );
  process.exit(1);
});
