#!/usr/bin/env bun
/**
 * Validate a git branch name against Gaff's naming convention.
 *
 * Allowed shapes:
 *   - Reserved long-lived branches: `main`, `master`
 *   - Conventional feature branches: `<prefix>/<slug>` where prefix is one of
 *     feat, feature, fix, bugfix, hotfix, chore, docs, refactor, test, perf,
 *     build, ci, revert, release, wip — and slug is lowercase
 *     `[a-z0-9._-]+`.
 *   - Bot branches: anything starting with `dependabot/` or `renovate/`.
 *
 * Usage:
 *   bun scripts/validation/branch-name.ts             # validates current HEAD
 *   bun scripts/validation/branch-name.ts <branch>    # validates the given name
 *
 * Exit codes:
 *   0 — branch name is acceptable (or we're on detached HEAD, which the
 *       caller — typically the pre-push hook — should handle separately).
 *   1 — branch name is rejected; a human-readable explanation goes to stderr.
 */

import { execFileSync } from "node:child_process";

const RESERVED_BRANCHES = new Set(["main", "master"]);

const CONVENTIONAL_PREFIXES = [
  "feat",
  "feature",
  "fix",
  "bugfix",
  "hotfix",
  "chore",
  "docs",
  "refactor",
  "test",
  "perf",
  "build",
  "ci",
  "revert",
  "release",
  "wip",
] as const;

const BOT_PREFIXES = ["dependabot", "renovate"] as const;

const CONVENTIONAL_RE = new RegExp(
  `^(${CONVENTIONAL_PREFIXES.join("|")})/[a-z0-9._-]+$`
);

const BOT_RE = new RegExp(`^(${BOT_PREFIXES.join("|")})/`);

function getCurrentBranch(): string {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function isValidBranchName(name: string): boolean {
  if (!name || name === "HEAD") {
    return false;
  }
  if (RESERVED_BRANCHES.has(name)) {
    return true;
  }
  if (BOT_RE.test(name)) {
    return true;
  }
  return CONVENTIONAL_RE.test(name);
}

function explainRejection(name: string): string {
  return `Branch name '${name}' does not match Gaff's convention.

  Use one of:
    feat/<slug>        — new feature
    fix/<slug>         — bug fix
    chore/<slug>       — tooling, deps, no behaviour change
    docs/<slug>        — docs only
    refactor/<slug>    — restructure, same behaviour
    test/<slug>        — tests only
    perf/<slug>        — performance work
    build/<slug>       — build / packaging
    ci/<slug>          — CI changes
    revert/<slug>      — reverting a prior change
    release/<slug>     — release branches
    hotfix/<slug>      — production hotfix
    wip/<slug>         — short-lived spike (avoid for shared work)

  feature/, bugfix/ are accepted as aliases for feat/, fix/.

  The slug must be lowercase letters, digits, '.', '_', or '-'.
  Examples:
    feat/listings-shortlist
    fix/auth-cookie-domain
    chore/bump-vite-7
    docs/handoff-update

  To rename your current branch:
    git branch -m <new-name>`;
}

function main(): void {
  let branch: string;

  if (process.argv.length > 2) {
    branch = (process.argv[2] ?? "").trim();
  } else {
    try {
      branch = getCurrentBranch();
    } catch (err) {
      console.error(
        `[branch-name] Could not determine current branch: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      process.exit(1);
    }
  }

  if (branch === "HEAD") {
    console.error(
      "[branch-name] Detached HEAD — no branch to validate. Skipping."
    );
    return;
  }

  if (isValidBranchName(branch)) {
    return;
  }

  console.error(`[branch-name] ✗ ${explainRejection(branch)}`);
  process.exit(1);
}

main();
