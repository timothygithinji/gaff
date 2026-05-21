/**
 * Git helpers used by the Neon branching scripts.
 *
 * Uses `node:child_process` (rather than Bun shell helpers) so the scripts
 * type-check with the standard @types/node already present in this repo.
 */

import { execFileSync } from "node:child_process";

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function getCurrentBranch(): string {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch) {
    throw new Error("Could not determine current git branch");
  }
  return branch;
}

export function isDetachedHead(): boolean {
  return getCurrentBranch() === "HEAD";
}

export function isMainBranch(branchName: string): boolean {
  const name = branchName.toLowerCase().trim();
  return name === "main" || name === "master";
}

/**
 * Normalises a git branch name into a Neon-safe identifier.
 *
 * Lowercases, replaces any non `[a-z0-9_-]` characters with `-`, collapses
 * repeated dashes, trims leading/trailing dashes, and clamps to Neon's
 * 63-character branch-name limit.
 */
export function branchToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}
