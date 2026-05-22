import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Universal router factory — `tanstackStart`'s vite plugin imports this from
 * both the client (`hydrateStart`) and SSR bundles, so it must run identically
 * on both sides. The plugin looks for an export named `getRouter`.
 */
export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
