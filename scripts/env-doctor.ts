#!/usr/bin/env bun
/**
 * env-doctor.ts
 *
 * Checks `.dev.vars` for required keys and reports what's missing.
 * Run via: `bun run scripts/env-doctor.ts`
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { consola } from "consola";
import { colors } from "consola/utils";

type Requirement = {
  key: string;
  reason: string;
};

const REQUIRED: Requirement[] = [
  { key: "DATABASE_URL", reason: "database connection" },
  { key: "TRIGGER_SECRET_KEY", reason: "Trigger.dev tasks" },
];

function parseDotenv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function main(): number {
  const path = resolve(process.cwd(), ".dev.vars");

  consola.box(`env-doctor — checking ${colors.cyan(".dev.vars")}`);

  if (!existsSync(path)) {
    consola.error(`Missing ${colors.yellow(".dev.vars")} at project root.`);
    consola.info(
      "Create one (e.g. copy from .dev.vars.example) and try again."
    );
    return 1;
  }

  const env = parseDotenv(readFileSync(path, "utf8"));

  const missing: Requirement[] = [];
  const empty: Requirement[] = [];
  const ok: Requirement[] = [];

  for (const req of REQUIRED) {
    const value = env[req.key];
    if (value === undefined) {
      missing.push(req);
    } else if (value.length === 0) {
      empty.push(req);
    } else {
      ok.push(req);
    }
  }

  for (const req of ok) {
    consola.success(
      `${colors.green(req.key)}  ${colors.dim(`(${req.reason})`)}`
    );
  }
  for (const req of empty) {
    consola.warn(
      `${colors.yellow(req.key)} is set but empty  ${colors.dim(`(${req.reason})`)}`
    );
  }
  for (const req of missing) {
    consola.error(
      `${colors.red(req.key)} is missing  ${colors.dim(`(${req.reason})`)}`
    );
  }

  if (missing.length === 0 && empty.length === 0) {
    consola.success(colors.green("All required env vars present."));
    return 0;
  }

  consola.fail(
    `${missing.length} missing, ${empty.length} empty out of ${REQUIRED.length} required keys.`
  );
  return 1;
}

process.exit(main());
