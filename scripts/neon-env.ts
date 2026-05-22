#!/usr/bin/env bun
/**
 * Resolves DATABASE_URL for the current git branch's Neon branch, then execs
 * the remaining args with it in the environment.
 *
 * Used by Drizzle / the dev server so every git branch (and every worktree)
 * automatically points at its own Neon branch. On main/master or detached
 * HEAD, falls through to whatever DATABASE_URL is already in the environment
 * (e.g. from Doppler).
 *
 * Behaviour:
 *   - If DATABASE_URL is already set and we're on main/master, just use it.
 *   - Otherwise look up the Neon branch named after the current git branch;
 *     create it if missing, then resolve its connection string.
 *
 * Usage: bun scripts/neon-env.ts <command> [args...]
 */

import { spawn } from "node:child_process";
import { getCurrentBranch, isDetachedHead, isMainBranch } from "./lib/git";
import {
  branchExists,
  createBranch,
  getConnectionString,
  readNeonProjectId,
  sanitizeBranchName,
  waitForEndpointReady,
} from "./lib/neon";

const NEON_DATABASE = "neondb";
const NEON_ROLE = "neondb_owner";
const NEON_CONFLICT_PATTERN = /409|already exists|conflict/i;

async function resolveDatabaseUrl(): Promise<string | undefined> {
  let branch: string;
  try {
    branch = getCurrentBranch();
  } catch {
    return process.env.DATABASE_URL;
  }
  if (isDetachedHead() || isMainBranch(branch)) {
    return process.env.DATABASE_URL;
  }

  const projectId = readNeonProjectId();
  const neonBranch = sanitizeBranchName(branch);

  const existing = await branchExists(projectId, neonBranch);
  let branchId: string | undefined = existing.branchId;
  if (!(existing.exists && existing.branchId)) {
    try {
      const created = await createBranch(projectId, neonBranch);
      branchId = created.branchId;
    } catch (err) {
      // Another concurrent invocation may have raced us to create the branch;
      // re-lookup and continue.
      const message = err instanceof Error ? err.message : String(err);
      const conflict = NEON_CONFLICT_PATTERN.test(message);
      if (!conflict) {
        throw err;
      }
      const found = await branchExists(projectId, neonBranch);
      branchId = found.branchId;
    }
  }
  if (branchId) {
    // Wait whether we just created it or are reusing an in-progress one.
    await waitForEndpointReady(projectId, branchId);
  }

  return getConnectionString(projectId, neonBranch, NEON_DATABASE, NEON_ROLE);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // Standalone invocation: print the resolved URL and exit. Useful for
    // shell substitution (DATABASE_URL=$(bun run db:env)).
    const url = await resolveDatabaseUrl();
    if (url) {
      process.stdout.write(`${url}\n`);
    }
    return;
  }

  let databaseUrl: string | undefined;
  try {
    databaseUrl = await resolveDatabaseUrl();
  } catch {
    // No neonctl / API access — fall through to existing DATABASE_URL.
    databaseUrl = process.env.DATABASE_URL;
  }

  const [command, ...commandArgs] = args as [string, ...string[]];
  const child = spawn(command, commandArgs, {
    env: {
      ...process.env,
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
    stdio: "inherit",
  });

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
