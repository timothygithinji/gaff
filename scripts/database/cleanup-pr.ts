#!/usr/bin/env bun
/**
 * Delete the Neon branch that belongs to a PR's head ref. Invoked by the
 * on-PR-close workflow (.github/workflows/pr-cleanup.yml).
 *
 * Unlike the local branch scripts (which read the *current* git branch from a
 * worktree), this takes the branch name as argv so it can run from CI after
 * the head ref may already have been deleted.
 *
 * Soft-fails on missing resources: a missing Neon branch is fine, since the
 * goal is "leave nothing behind".
 *
 * Usage: bun scripts/database/cleanup-pr.ts <git-branch-name>
 */

import { isMainBranch } from "../lib/git";
import {
  branchExists,
  deleteBranch,
  readNeonProjectId,
  sanitizeBranchName,
} from "../lib/neon";

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
