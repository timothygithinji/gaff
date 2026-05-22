import { defineConfig } from "vitest/config";

// Vitest is intentionally kept separate from `vite.config.ts` — the
// TanStack Start + Cloudflare Workers Vite plugins try to spin up a
// workerd environment which is the wrong fit for parser unit tests.
//
// Tests are pure-Node, read fixtures from disk, and exercise the
// `src/lib/parsers/` module against real captured HTML.
export default defineConfig({
  test: {
    // Parser tests live under tests/ (they read big HTML fixtures from disk
    // and want to stay separate from the source tree). Co-located unit tests
    // — e.g. `src/lib/cluster/normalise.test.ts` — also get picked up so
    // small pure-function modules can carry their tests next to the code.
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "threads",
  },
});
