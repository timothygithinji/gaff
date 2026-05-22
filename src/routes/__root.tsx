import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect } from "react";
import {
  HouseholdProvider,
  householdQueryOptions,
} from "../lib/household-context";
import { getCurrentUser } from "../server/functions/session";
import globalsCss from "../styles/globals.css?url";

// react-grab: in-app element picker that pipes context to AI coding tools.
// Dev-only — `import.meta.env.DEV` and the dynamic import together ensure
// the package never lands in the production bundle.
function useReactGrab() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      import("react-grab");
    }
  }, []);
}

/**
 * Server function that returns just the current user id, so the root
 * route loader can prime the HouseholdProvider without a second
 * round-trip on first paint. Returns null when there's no session
 * (the layout still renders — auth-gated children handle their own
 * redirects).
 */
const getCurrentUserId = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ userId: string | null }> => {
    const session = await getCurrentUser();
    return { userId: session?.userId ?? null };
  }
);

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "gaff" },
    ],
    links: [{ rel: "stylesheet", href: globalsCss }],
  }),
  beforeLoad: async ({ context }) => {
    const { userId } = await getCurrentUserId();
    // Pre-fetch the household on the server so SSR paints the real
    // shell, not the HouseholdProvider's loading skeleton. Skipped
    // when no session — login/signup don't need it.
    if (userId) {
      await context.queryClient.prefetchQuery(householdQueryOptions);
    }
    return { currentUserId: userId };
  },
  component: RootComponent,
});

function RootComponent() {
  const { currentUserId } = Route.useRouteContext();
  useReactGrab();
  return (
    <RootDocument>
      <HouseholdProvider initialUserId={currentUserId}>
        <Outlet />
      </HouseholdProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      {/* biome-ignore lint/nursery/noHeadElement: TanStack Start's root document owns <head>. */}
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
