#!/usr/bin/env bun
/**
 * Resolves DATABASE_URL for the current git branch's Neon branch, then execs
 * the remaining args with it in the environment.
 *
 * Used by Drizzle / the dev server so every git branch (and every worktree)
 * automatically points at its own Neon branch. This is the *dev* path —
 * the Neon `main` branch belongs to production and is reached only via
 * `bun run dev:prod` (which bypasses this script entirely and uses the
 * `gaff/prd` Doppler config).
 *
 * Behaviour:
 *   - On a feature branch: look up the Neon branch named after the current
 *     git branch; create it if missing, then resolve its connection string.
 *   - On git main / master / detached HEAD: refuse to run. There is no
 *     "dev DATABASE_URL" — switch to a feature branch (gets you an isolated
 *     Neon branch) or use `bun run dev:prod` (which points at prod data).
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

function refuseMain(reason: string): never {
  console.error(
    `[neon-env] Refusing to resolve a dev DATABASE_URL: ${reason}
  The Neon main branch is production-only and must not be hit
  during \`bun run dev\`. Switch to a feature branch (a fresh Neon
  branch will be provisioned for you), or use \`bun run dev:prod\`
  to deliberately target prod data via the gaff/prd Doppler config.`
  );
  process.exit(1);
}

async function resolveDatabaseUrl(): Promise<string> {
  let branch: string;
  try {
    branch = getCurrentBranch();
  } catch (err) {
    refuseMain(
      `cannot determine current git branch (${err instanceof Error ? err.message : String(err)})`
    );
  }
  if (isDetachedHead()) {
    refuseMain("HEAD is detached");
  }
  if (isMainBranch(branch)) {
    refuseMain(`on git ${branch}`);
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
    process.stdout.write(`${url}\n`);
    return;
  }

  const databaseUrl = await resolveDatabaseUrl();

  const [command, ...commandArgs] = args as [string, ...string[]];
  const child = spawn(command, commandArgs, {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
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
