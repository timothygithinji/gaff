#!/usr/bin/env bun
/**
 * Block `drizzle-kit push` / `db:push` invocations.
 *
 * Schema changes must go through versioned migrations (db:generate +
 * db:migrate). `push` skips the migration graph entirely, which means
 * prod and dev drift and the snapshot chain in `drizzle/meta/_journal.json`
 * no longer reflects reality. We deliberately removed the `db:push`
 * npm script when this convention landed; this hook stops anyone
 * (or any agent) from invoking it raw via `bunx`.
 *
 * Adapted from fanya-labs/playt's .claude/scripts/validate-drizzle-push.ts.
 */

type HookInput = {
  tool_name?: string;
  tool_input?: { command?: string };
};

const input = (await Bun.stdin.json()) as HookInput;

if (input.tool_name !== "Bash") {
  process.exit(0);
}

const command = input.tool_input?.command ?? "";

// Skip git / gh — commit messages or PR bodies may legitimately mention
// blocked terms.
if (/^\s*(git|gh)\s/i.test(command)) {
  process.exit(0);
}

const BLOCKED_PATTERNS = [
  "drizzle-kit push",
  "drizzle-kit push:pg",
  "db:push",
  "db-push",
];

for (const pattern of BLOCKED_PATTERNS) {
  if (command.includes(pattern)) {
    console.error(`🚫 BLOCKED: '${pattern}' is not allowed in this project.`);
    console.error("");
    console.error(
      "Schema changes must go through versioned migrations to maintain"
    );
    console.error("parity between dev branches and production.");
    console.error("");
    console.error(
      "Use 'bun run db:generate' to create a migration, then 'bun run"
    );
    console.error("db:migrate' to apply it.");
    console.error("");
    console.error(`Command attempted: ${command}`);
    process.exit(2);
  }
}

process.exit(0);
