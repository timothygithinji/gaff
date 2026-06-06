import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import {
  DefaultErrorComponent,
  DefaultPendingComponent,
} from "./components/ui/patterns/route-fallback";
import { routeTree } from "./routeTree.gen";

/**
 * Universal router factory — `tanstackStart`'s vite plugin imports this from
 * both the client (`hydrateStart`) and SSR bundles, so it must run identically
 * on both sides. The plugin looks for an export named `getRouter`.
 *
 * The QueryClient is constructed once per router (i.e. once per SSR
 * request on the server, once per page load on the client). We expose
 * it via the router's `context` so route loaders can prefetch with
 * `context.queryClient.ensureQueryData(...)`, and via the `Wrap`
 * option so React Query's provider is mounted around the whole tree
 * without the user having to do it themselves in `__root.tsx`.
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Non-zero stale time prevents the client from re-fetching
        // SSR-hydrated data on the first frame after hydration.
        staleTime: 60 * 1000,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Loading UX: show a route's pendingComponent quickly (150ms) once a
    // loader is genuinely waiting, but hold it on screen for at least
    // 400ms so a near-instant resolve doesn't flash a skeleton. Routes
    // without a tailored pendingComponent fall back to these generic
    // shadcn-Skeleton + error components.
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
    defaultPendingComponent: DefaultPendingComponent,
    defaultErrorComponent: DefaultErrorComponent,
    context: { queryClient },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
