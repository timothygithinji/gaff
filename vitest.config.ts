import { defineConfig } from "vitest/config";

// Vitest is intentionally kept separate from `vite.config.ts` — the
// TanStack Start + Cloudflare Workers Vite plugins try to spin up a
// workerd environment which is the wrong fit for parser unit tests.
//
// Tests are pure-Node, read fixtures from disk, and exercise the
// `src/lib/parsers/` module against real captured HTML.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "threads",
  },
});
