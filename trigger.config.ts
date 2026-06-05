import { execFileSync } from "node:child_process";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

// Mirrors the required keys in `src/lib/env.ts` (the Zod-validated env
// loader). Any task that touches `env()` — clustering, EPC enrichment,
// AI enrichment, photo caching — needs the full set, not just the two
// the scrape tasks read directly.
const REQUIRED_SECRETS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CLOUDFLARE_ACCESS_AUD",
  "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
  "ZYTE_API_KEY",
  "ANTHROPIC_API_KEY",
  "EPC_OPENDATA_TOKEN",
  "GOOGLE_MAPS_API_KEY",
] as const;

// Optional keys from `src/lib/env.ts` — synced when Doppler has them,
// silently skipped when it doesn't (matches the schema's `.optional()`).
const OPTIONAL_SECRETS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  // Read by the notification tasks (send-match-email, daily-digest).
  "RESEND_API_KEY",
  // Server-side Google Maps key for the enrichers (nearby-transit,
  // station-routes, commute). `GOOGLE_MAPS_API_KEY` is HTTP-referrer-
  // restricted because it ships to the browser, so it 403s on server
  // calls; `mapsServerKey()` prefers this unrestricted key. Without it
  // synced here the worker never sees the Doppler value.
  "GOOGLE_MAPS_SERVER_KEY",
] as const;

// Map Trigger.dev environment slugs to Doppler config names.
const DOPPLER_CONFIG_BY_ENV: Record<string, string> = {
  prod: "prd",
  staging: "stg",
  preview: "dev",
};

export default defineConfig({
  project: "REDACTED_TRIGGER_REF",
  logLevel: "log",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10_000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  build: {
    extensions: [
      syncEnvVars(async ({ environment }) => {
        const config = DOPPLER_CONFIG_BY_ENV[environment];
        if (!config) {
          throw new Error(
            `No Doppler config mapped for Trigger env "${environment}"`
          );
        }
        const raw = execFileSync(
          "doppler",
          [
            "secrets",
            "download",
            "--no-file",
            "--format=json",
            "--project=gaff",
            `--config=${config}`,
            `--scope=${process.env.HOME}/.t-stack/orgs/timothygithinji`,
          ],
          { encoding: "utf8" }
        );
        const secrets = JSON.parse(raw) as Record<string, string>;
        const required = REQUIRED_SECRETS.map((name) => {
          const value = secrets[name];
          if (!value) {
            throw new Error(
              `Doppler config gaff/${config} is missing required secret ${name}`
            );
          }
          return { name, value };
        });
        const optional = OPTIONAL_SECRETS.flatMap((name) => {
          const value = secrets[name];
          return value ? [{ name, value }] : [];
        });
        return [...required, ...optional];
      }),
    ],
  },
});
