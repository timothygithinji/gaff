#!/usr/bin/env bun
/**
 * Pre-commit migration validation.
 *
 *   1. Validates the drizzle-kit journal timestamp ordering. drizzle-kit
 *      silently skips migrations where `folderMillis <= lastDbMigration.created_at`
 *      — on Neon preview branches (forked from production), the DB stores
 *      the max applied created_at and any newer-on-disk-but-older-by-ts
 *      migration is skipped. We catch that before it bites.
 *
 *   2. Validates the snapshot prevId chain. drizzle-kit requires a strict
 *      linear chain; two branches generating migrations from the same base
 *      then merging without reconciliation produces a fork.
 *
 *   3. When schema files are staged without corresponding migration files,
 *      auto-runs `bun run db:generate` and stages whatever it produces.
 *
 * Adapted from fanya-labs/playt's scripts/validation/migrations.ts.
 *
 * Usage:
 *   bun scripts/validation/migrations.ts            # run from husky pre-commit
 *   bun scripts/validation/migrations.ts --check-only  # validate only, no codegen
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_DIR = "db";
const MIGRATIONS_DIR = "drizzle";
const JOURNAL_PATH = join(MIGRATIONS_DIR, "meta/_journal.json");

const LOG_PREFIX = "[migrations]";
const TAG_PREFIX_RE = /_.*$/;
const RECENT_WINDOW_MS = 60_000;

const log = {
  info: (msg: string) => console.log(`\x1b[34m${LOG_PREFIX}\x1b[0m ${msg}`),
  success: (msg: string) =>
    console.log(`\x1b[32m${LOG_PREFIX}\x1b[0m ✓ ${msg}`),
  error: (msg: string) =>
    console.error(`\x1b[31m${LOG_PREFIX}\x1b[0m ✗ ${msg}`),
};

function getStagedFiles(): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return out
      .trim()
      .split("\n")
      .filter((f: string) => f.length > 0);
  } catch {
    return [];
  }
}

function stageFiles(paths: string[]): void {
  if (paths.length === 0) {
    return;
  }
  spawnSync("git", ["add", ...paths], { stdio: "ignore" });
}

function getRecentMigrations(dir: string): string[] {
  const recent: string[] = [];
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  try {
    for (const file of readdirSync(dir, { recursive: true })) {
      const path = join(dir, String(file));
      if (path.endsWith(".sql") && statSync(path).mtimeMs > cutoff) {
        recent.push(path);
      }
    }
  } catch {
    // directory may not exist
  }
  return recent;
}

function validateSnapshotChain(): void {
  if (!existsSync(JOURNAL_PATH)) {
    return;
  }

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8")) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
  };

  if (journal.entries.length < 2) {
    return;
  }

  const snapshots: Array<{
    tag: string;
    idx: number;
    id: string;
    prevId: string;
  }> = [];

  for (const entry of journal.entries) {
    const prefix = entry.tag.replace(TAG_PREFIX_RE, "");
    const snapshotFile = join(MIGRATIONS_DIR, `meta/${prefix}_snapshot.json`);
    if (!existsSync(snapshotFile)) {
      continue;
    }
    try {
      const snap = JSON.parse(readFileSync(snapshotFile, "utf-8")) as {
        id: string;
        prevId: string;
      };
      snapshots.push({ tag: entry.tag, idx: entry.idx, ...snap });
    } catch {
      // skip unparseable
    }
  }

  if (snapshots.length < 2) {
    return;
  }

  const prevIdUsers = new Map<string, string[]>();
  for (const snap of snapshots) {
    const list = prevIdUsers.get(snap.prevId) ?? [];
    list.push(`idx ${snap.idx} (${snap.tag})`);
    prevIdUsers.set(snap.prevId, list);
  }

  for (const [prevId, users] of prevIdUsers) {
    if (users.length > 1) {
      const parent = snapshots.find((s) => s.id === prevId);
      const parentLabel = parent ? `idx ${parent.idx} (${parent.tag})` : prevId;
      const forkedList = users.map((u) => `    - ${u}`).join("\n");
      log.error(
        `Snapshot chain fork detected!
  Multiple snapshots point to the same parent: ${parentLabel}
  Forked snapshots:
${forkedList}

  drizzle-kit generate requires a strict linear chain.
  This happens when two branches generate migrations from the same base
  and are merged without reconciling the prevId chain.

  Fix: update the later snapshot's "prevId" to point to the preceding
  snapshot's id (following journal idx order).`
      );
      process.exit(1);
    }
  }
}

function validateJournalTimestampOrder(): void {
  if (!existsSync(JOURNAL_PATH)) {
    return;
  }

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8")) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
  };

  if (journal.entries.length < 2) {
    return;
  }

  const lastEntry = journal.entries.at(-1) as (typeof journal.entries)[number];
  const maxPrior = Math.max(...journal.entries.slice(0, -1).map((e) => e.when));

  if (lastEntry.when <= maxPrior) {
    const conflicting = journal.entries.find((e) => e.when === maxPrior);
    const conflictLabel = conflicting
      ? ` idx ${conflicting.idx} (${conflicting.tag})`
      : "";
    log.error(
      `Migration journal timestamp ordering violation!
  Last entry idx ${lastEntry.idx} (${lastEntry.tag}) has when=${lastEntry.when}
  but a preceding entry${conflictLabel} has when=${maxPrior}

  The last journal entry must have the highest timestamp.
  drizzle-kit silently skips migrations where folderMillis <= lastDbMigration.created_at.
  On Neon preview branches forked from production, the DB stores the max
  applied created_at — any new migration with a lower timestamp is skipped.

  Fix: set idx ${lastEntry.idx}'s "when" to at least ${maxPrior + 1}`
    );
    process.exit(1);
  }
}

function main(): void {
  const checkOnly = process.argv.includes("--check-only");

  log.info("Checking migration integrity...");

  validateSnapshotChain();
  validateJournalTimestampOrder();

  if (checkOnly) {
    log.success("Migration metadata is valid");
    return;
  }

  const staged = getStagedFiles();
  const schemaChanges = staged.filter((f) => f.startsWith(`${SCHEMA_DIR}/`));

  if (schemaChanges.length === 0) {
    log.success("No schema changes detected");
    return;
  }

  console.log("\x1b[33m  Schema changes detected:\x1b[0m");
  for (const file of schemaChanges) {
    console.log(`  - ${file}`);
  }

  const migrationChanges = staged.filter((f) =>
    f.startsWith(`${MIGRATIONS_DIR}/`)
  );
  if (migrationChanges.length > 0) {
    log.success("Schema changes include migration files");
    return;
  }

  log.info("Analyzing if changes affect database schema...");

  const genResult = spawnSync("bun", ["run", "db:generate"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${genResult.stdout ?? ""}${genResult.stderr ?? ""}`;

  if (output.includes("No schema changes, nothing to migrate")) {
    log.success(
      "Schema file changes are code-only — no database migration needed"
    );
    return;
  }

  console.log(
    "\x1b[33m  Database schema changes detected, staging migrations...\x1b[0m"
  );
  stageFiles([MIGRATIONS_DIR]);

  const recent = getRecentMigrations(MIGRATIONS_DIR);
  if (recent.length > 0) {
    log.success("Migrations generated and staged:");
    for (const m of recent) {
      console.log(`  - ${m}`);
    }
  }

  log.success("All checks passed");
}

try {
  main();
} catch (err) {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
