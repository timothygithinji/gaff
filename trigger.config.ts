import { execFileSync } from "node:child_process";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

const REQUIRED_SECRETS = ["DATABASE_URL", "ZYTE_API_KEY"] as const;

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
        return REQUIRED_SECRETS.flatMap((name) => {
          const value = secrets[name];
          if (!value) {
            throw new Error(
              `Doppler config gaff/${config} is missing required secret ${name}`
            );
          }
          return [{ name, value }];
        });
      }),
    ],
  },
});
