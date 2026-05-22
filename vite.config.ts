import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// TanStack Start + Cloudflare Workers.
//
// `tanstackStart` configures the router plugin internally (file-based
// routing from `src/routes`, `routeTree.gen.ts` codegen) and wires the
// virtual client/server entries.
//
// The cloudflare plugin runs the SSR build inside workerd locally via
// miniflare during `vite dev`, and emits a Worker bundle on `vite build`
// that `wrangler deploy` consumes. The `viteEnvironment: { name: "ssr" }`
// option tells the plugin to merge its Worker config into the SSR build —
// which is how Start ships its handler to workerd.
//
// `customViteReactPlugin: true` lets us declare `viteReact()` explicitly so
// we control its placement (must come after `tanstackStart`).
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
