import { defineConfig } from "vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// TanStack Start + Cloudflare Workers.
// The Cloudflare adapter expects the Workers runtime; `wrangler dev` and
// `wrangler deploy` consume the built output, while `vite` serves the
// client-side routes during local dev.
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
  ],
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
});
