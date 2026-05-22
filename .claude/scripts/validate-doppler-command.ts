#!/usr/bin/env bun
/**
 * Block `doppler` commands that expose raw secret values, mutate
 * the vault, or change auth state.
 *
 * Allowed:
 *   - `doppler run -- <cmd>`        inject secrets as env vars (the only safe path)
 *   - `doppler secrets --only-names`  lists names, NOT values
 *   - `doppler whoami`              identity check, no secrets
 *   - `doppler --help` / subcommand --help
 *   - `doppler setup`               local config wiring (interactive, no value leak)
 *
 * Blocked:
 *   - `doppler secrets get`         exposes a single value
 *   - `doppler secrets set`         mutates the vault
 *   - `doppler secrets delete`      mutates the vault
 *   - `doppler secrets download`    dumps every value to disk (this is what
 *                                   created the .dev.vars we explicitly removed)
 *   - `doppler secrets`             plain listing exposes values too
 *   - `doppler login` / `logout`    auth state changes
 *   - `doppler configure`           mutates local Doppler config
 *   - `doppler token`               token mgmt
 *
 * Adapted from fanya-labs/playt's .claude/scripts/validate-infisical-command.ts,
 * translated to Doppler's command surface.
 */

type HookInput = {
  tool_name?: string;
  tool_input?: { command?: string };
};

const input = (await Bun.stdin.json()) as HookInput;

if (input.tool_name !== "Bash") {
  process.exit(0);
}

const command = (input.tool_input?.command ?? "") as string;

// Skip commands that don't touch doppler at all.
if (!/\bdoppler\b/i.test(command)) {
  process.exit(0);
}

// ─── Allow-list (safe paths) ────────────────────────────────────────────────
const ALLOWED_PATTERNS: RegExp[] = [
  /\bdoppler\s+run\b/,
  /\bdoppler\s+whoami\b/,
  /\bdoppler\s+setup\b/,
  /\bdoppler\b.*--help\b/,
  /\bdoppler\s+secrets\b.*\s--only-names\b/,
];
for (const re of ALLOWED_PATTERNS) {
  if (re.test(command)) {
    process.exit(0);
  }
}

// ─── Block-list ─────────────────────────────────────────────────────────────
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bdoppler\s+secrets\s+get\b/,
    reason:
      "Reading individual secret values is forbidden. Use `doppler run --project gaff --config dev --scope ~/.t-stack/orgs/timothygithinji -- <cmd>` to inject them into the process env instead.",
  },
  {
    pattern: /\bdoppler\s+secrets\s+set\b/,
    reason:
      "Setting secrets must be done manually by a human via the Doppler UI or CLI — not by Claude.",
  },
  {
    pattern: /\bdoppler\s+secrets\s+delete\b/,
    reason:
      "Deleting secrets is destructive and should be done manually, not by Claude.",
  },
  {
    pattern: /\bdoppler\s+secrets\s+download\b/,
    reason:
      "Downloading dumps every secret value to a file. The Gaff convention is Doppler runtime injection only — no .dev.vars on disk. Use `doppler run` instead.",
  },
  {
    // `doppler secrets` with no subcommand (or with a subcommand that isn't
    // explicitly allow-listed above) renders every value to the terminal.
    pattern:
      /\bdoppler\s+secrets\b(?!.*\s--only-names\b)(?!\s+(folders|substitute)\b)/,
    reason:
      "Plain `doppler secrets` lists every value. Use `doppler secrets --only-names` for just the keys, or `doppler run` to inject them.",
  },
  {
    pattern: /\bdoppler\s+login\b/,
    reason:
      "Auth state changes (`doppler login`) must be done manually by the user, not by Claude.",
  },
  {
    pattern: /\bdoppler\s+logout\b/,
    reason:
      "Auth state changes (`doppler logout`) must be done manually by the user, not by Claude.",
  },
  {
    pattern: /\bdoppler\s+configure\s+(set|reset|unset)\b/,
    reason:
      "Mutating local Doppler configuration must be done manually, not by Claude.",
  },
  {
    pattern: /\bdoppler\s+token\b/,
    reason: "Token management exposes auth credentials. Do this manually.",
  },
  {
    pattern: /\bdoppler\s+service-token\b/,
    reason: "Service-token management exposes auth credentials.",
  },
  {
    pattern: /\bdoppler\s+reset\b/,
    reason:
      "`doppler reset` wipes local Doppler state. Destructive — do this manually.",
  },
];

for (const { pattern, reason } of BLOCKED_PATTERNS) {
  if (pattern.test(command)) {
    console.error("🚫 BLOCKED: Doppler command not allowed.");
    console.error("");
    console.error(`   ${reason}`);
    console.error("");
    console.error(`   Command attempted: ${command}`);
    process.exit(2);
  }
}

// Anything else (e.g. `doppler --version`) is fine by default.
process.exit(0);
