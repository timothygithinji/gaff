#!/usr/bin/env bun
/**
 * Neon Database Branch Create
 *
 * Creates a Neon branch named after the current git branch (sanitized), waits
 * for its endpoint to become ready, then applies pending Drizzle migrations
 * against it.
 *
 * Idempotent: if a branch with that name already exists, we skip creation and
 * still apply migrations.
 *
 * Usage:
 *   bun run db:branch:create
 */

import { execFileSync, spawnSync } from "node:child_process";
import { getCurrentBranch, isDetachedHead, isMainBranch } from "../lib/git";
import {
  branchExists,
  createBranch,
  getConnectionString,
  readNeonProjectId,
  sanitizeBranchName,
  waitForEndpointReady,
} from "../lib/neon";

const LOG_PREFIX = "[db:branch:create]";
const NEON_DATABASE = "neondb";
const NEON_ROLE = "neondb_owner";
const NEON_CONFLICT_PATTERN = /409|already exists|conflict/i;

const log = {
  info: (msg: string) => console.log(`\x1b[34m${LOG_PREFIX}\x1b[0m ${msg}`),
  success: (msg: string) =>
    console.log(`\x1b[32m${LOG_PREFIX}\x1b[0m ✓ ${msg}`),
  error: (msg: string) =>
    console.error(`\x1b[31m${LOG_PREFIX}\x1b[0m ✗ ${msg}`),
};

async function resolveOrCreateBranch(
  projectId: string,
  neonBranch: string
): Promise<string> {
  const existing = await branchExists(projectId, neonBranch);
  if (existing.exists && existing.branchId) {
    log.info(`Branch already exists (${existing.branchId})`);
    return existing.branchId;
  }
  log.info("Creating branch...");
  try {
    const created = await createBranch(projectId, neonBranch);
    log.success(`Branch created (${created.branchId})`);
    return created.branchId;
  } catch (err) {
    // Lost a race with another invocation — fall back to the existing branch.
    const message = err instanceof Error ? err.message : String(err);
    if (!NEON_CONFLICT_PATTERN.test(message)) {
      throw err;
    }
    const found = await branchExists(projectId, neonBranch);
    if (!(found.exists && found.branchId)) {
      throw err;
    }
    log.info(`Branch was created by a concurrent run (${found.branchId})`);
    return found.branchId;
  }
}

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
    log.error("Detached HEAD — cannot determine branch to create.");
    process.exit(1);
  }

  if (isMainBranch(gitBranch)) {
    log.error(
      "Refusing to create a Neon branch for main. Switch to a feature branch first."
    );
    process.exit(1);
  }

  const projectId = readNeonProjectId();
  const neonBranch = sanitizeBranchName(gitBranch);

  log.info(`Resolving Neon branch: ${neonBranch} (git: ${gitBranch})`);

  const branchId = await resolveOrCreateBranch(projectId, neonBranch);

  log.info("Waiting for endpoint to become ready...");
  await waitForEndpointReady(projectId, branchId);
  log.success("Endpoint ready");

  log.info("Resolving connection string...");
  const databaseUrl = getConnectionString(
    projectId,
    neonBranch,
    NEON_DATABASE,
    NEON_ROLE
  );

  applyMigrations(databaseUrl);

  log.success(`Done! Neon branch '${neonBranch}' provisioned.`);
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  // Surface the underlying tool name so the user can dig further if needed.
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    log.error("git is not on PATH");
  }
  process.exit(1);
});
