import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import faviconSvg from "../assets/favicon.svg?url";
import { HotkeyHelp } from "../components/hotkey-help";
import { ThemeProvider } from "../components/theme-provider";
import {
  HouseholdProvider,
  householdQueryOptions,
} from "../lib/household-context";
import { getRootBootstrap } from "../server/functions/household";
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

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Gaff" },
    ],
    links: [
      { rel: "stylesheet", href: globalsCss },
      { rel: "icon", type: "image/svg+xml", href: faviconSvg },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const { userId, household } = await getRootBootstrap();
    // Fold the household straight into the query cache so the
    // HouseholdProvider paints the real shell on first frame without a
    // second round-trip. Skipped when there's no session (login/signup
    // don't need it) or no household (the provider re-fetches).
    if (household) {
      context.queryClient.setQueryData(
        householdQueryOptions.queryKey,
        household
      );
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
      <ThemeProvider defaultTheme="system">
        <HouseholdProvider initialUserId={currentUserId}>
          <Outlet />
          {currentUserId ? <HotkeyHelp /> : null}
        </HouseholdProvider>
      </ThemeProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning silences the class mismatch on <html> caused
    // by the pre-hydration theme script in ThemeProvider.
    <html lang="en" suppressHydrationWarning>
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
