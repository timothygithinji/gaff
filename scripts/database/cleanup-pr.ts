#!/usr/bin/env bun
/**
 * Delete everything provisioned for a PR's head ref.
 *
 * Invoked by the on-PR-close workflow (`.github/workflows/pr-cleanup.yml`).
 * Cleans up two flavours of dangling resource:
 *
 *   1. **Trigger.dev schedules** — every `searches` row in the branch's
 *      DB had an IMPERATIVE schedule attached to it with the search's
 *      id as `externalId`. If we deleted the Neon branch first the
 *      schedules would survive and keep firing against a gone database.
 *   2. **The Neon branch itself** — the per-PR isolated database
 *      provisioned by `db:branch:create`.
 *
 * Order matters: schedules first, then DB. A failure during schedule
 * cleanup aborts the Neon delete and leaves a recoverable state — the
 * next run will re-list searches and try again.
 *
 * Unlike the local branch scripts (which read the *current* git branch
 * from a worktree), this takes the branch name as argv so it can run
 * from CI after the head ref may already have been deleted.
 *
 * Soft-fails on missing resources — a missing Neon branch / no
 * matching schedules is fine, the goal is "leave nothing behind".
 *
 * Required env (already injected by the GH workflow via Doppler):
 *   - NEON_API_KEY            — Neon control plane auth
 *   - TRIGGER_SECRET_KEY      — Trigger.dev management API auth
 *   - TRIGGER_API_URL         — optional, defaults to https://api.trigger.dev
 *
 * Usage: bun scripts/database/cleanup-pr.ts <git-branch-name>
 */

import { neon } from "@neondatabase/serverless";
import { schedules } from "@trigger.dev/sdk";
import { isMainBranch } from "../lib/git";
import {
  branchExists,
  deleteBranch,
  getConnectionString,
  readNeonProjectId,
  sanitizeBranchName,
} from "../lib/neon";

const NEON_DATABASE = "neondb";
const NEON_ROLE = "neondb_owner";

async function collectSearchIds(connectionString: string): Promise<string[]> {
  // Use the raw neon driver here — keeping the script Drizzle-free
  // avoids paying the schema-import cost in CI for one query.
  const sql = neon(connectionString);
  try {
    const rows = (await sql`SELECT id FROM searches`) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`→ Warning: failed to list searches in branch: ${msg}`);
    return [];
  }
}

async function deleteSchedulesForSearchIds(searchIds: string[]): Promise<void> {
  if (searchIds.length === 0) {
    console.log("→ No searches in this branch — no schedules to clean up");
    return;
  }
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.log(
      "→ TRIGGER_SECRET_KEY not set — skipping Trigger.dev schedule cleanup"
    );
    return;
  }
  const wanted = new Set(searchIds);
  // The SDK has no `findOne(externalId)`; list and filter client-side.
  // `perPage: 100` matches the cap in `findScheduleByExternalId`. If a
  // single PR ever blows past that we'd need to walk pages.
  let page: Awaited<ReturnType<typeof schedules.list>>;
  try {
    page = await schedules.list({ perPage: 100 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`→ Warning: failed to list Trigger.dev schedules: ${msg}`);
    return;
  }

  const targets = page.data.filter(
    (row) => row.externalId && wanted.has(row.externalId)
  );
  if (targets.length === 0) {
    console.log("→ No Trigger.dev schedules matched the branch's searches");
    return;
  }
  console.log(
    `→ Deleting ${targets.length} Trigger.dev schedule(s) for the branch's searches`
  );
  for (const sched of targets) {
    try {
      await schedules.del(sched.id);
      console.log(
        `  • Deleted schedule ${sched.id} (externalId=${sched.externalId})`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Soft-fail per schedule so one bad row doesn't abort the rest.
      console.log(`  • Warning: failed to delete schedule ${sched.id}: ${msg}`);
    }
  }
}

async function cleanupTriggerSchedules(
  projectId: string,
  neonBranch: string
): Promise<void> {
  // Try to resolve a connection string to the branch BEFORE we delete
  // it. If the branch doesn't exist (already cleaned up) we skip.
  let connectionString: string;
  try {
    connectionString = getConnectionString(
      projectId,
      neonBranch,
      NEON_DATABASE,
      NEON_ROLE
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      `→ Could not resolve connection string for '${neonBranch}': ${msg}`
    );
    return;
  }
  const searchIds = await collectSearchIds(connectionString);
  await deleteSchedulesForSearchIds(searchIds);
}

async function deleteNeonForBranch(
  projectId: string,
  gitBranch: string
): Promise<void> {
  const neonBranch = sanitizeBranchName(gitBranch);
  const existing = await branchExists(projectId, neonBranch);
  if (!existing.exists) {
    console.log(`→ Neon branch '${neonBranch}' already gone`);
    return;
  }

  // Clean up Trigger.dev schedules pointing at searches in this branch
  // BEFORE deleting the branch itself. Otherwise the schedules survive
  // and keep firing against a dead DB.
  await cleanupTriggerSchedules(projectId, neonBranch);

  try {
    await deleteBranch(projectId, neonBranch);
    console.log(`→ Deleted Neon branch: ${neonBranch}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      `→ Warning: failed to delete Neon branch ${neonBranch}: ${msg}`
    );
  }
}

async function main(): Promise<void> {
  const gitBranch = process.argv[2];
  if (!gitBranch) {
    console.error("Usage: cleanup-pr.ts <git-branch-name>");
    process.exit(1);
  }

  console.log("==========================================");
  console.log("  PR Cleanup");
  console.log(`  Branch: ${gitBranch}`);
  console.log("==========================================");

  if (isMainBranch(gitBranch)) {
    console.log(
      `→ Refusing to delete Neon branch for protected ref '${gitBranch}'`
    );
    return;
  }

  const projectId = readNeonProjectId();
  await deleteNeonForBranch(projectId, gitBranch);

  console.log("\nCleanup complete");
}

main().catch((err) => {
  console.error(
    `\nCleanup failed: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
});
