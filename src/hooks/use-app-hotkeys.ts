import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "../components/theme-provider";
import { useIsMobile } from "./use-mobile";

// Adds a `category` field to every registration's `meta`. The help dialog
// reads it to group shortcuts under headings without us having to maintain
// a parallel list of what's registered where. Augments the underlying
// `@tanstack/hotkeys` core module — `react-hotkeys` re-exports its types
// but the `declare module` target has to be the package that owns the
// interface.
declare module "@tanstack/hotkeys" {
  interface HotkeyMeta {
    /** Group label used by the help dialog (e.g. "Navigation", "Theme"). */
    category?: string;
  }
}

export function useAppHotkeys(onShowHelp: () => void): void {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  // Don't register global shortcuts on touch viewports — wastes a slot in
  // the singleton manager and the help dialog is desktop-only anyway.
  const isMobile = useIsMobile();
  const enabled = !isMobile;

  // Navigation — "g" leader sequences.
  useHotkeySequence(["G", "S"], () => navigate({ to: "/searches" }), {
    enabled,
    meta: { category: "Navigation", description: "Go to Searches" },
  });
  useHotkeySequence(["G", "R"], () => navigate({ to: "/" }), {
    enabled,
    meta: { category: "Navigation", description: "Go to Review" },
  });
  useHotkeySequence(["G", "K"], () => navigate({ to: "/shortlist" }), {
    enabled,
    meta: { category: "Navigation", description: "Go to Shortlist" },
  });
  useHotkeySequence(["G", "M"], () => navigate({ to: "/matches" }), {
    enabled,
    meta: { category: "Navigation", description: "Go to Matches" },
  });
  useHotkeySequence(["G", "H"], () => navigate({ to: "/settings/household" }), {
    enabled,
    meta: { category: "Navigation", description: "Go to Household settings" },
  });
  useHotkeySequence(["G", "N"], () => navigate({ to: "/searches/new" }), {
    enabled,
    meta: { category: "Navigation", description: "Start a new search" },
  });
  useHotkey(",", () => navigate({ to: "/settings/household" }), {
    enabled,
    meta: { category: "Navigation", description: "Open Household settings" },
  });

  // Theme
  useHotkeySequence(["T", "D"], () => setTheme("dark"), {
    enabled,
    meta: { category: "Theme", description: "Switch theme to dark" },
  });
  useHotkeySequence(["T", "L"], () => setTheme("light"), {
    enabled,
    meta: { category: "Theme", description: "Switch theme to light" },
  });
  useHotkeySequence(["T", "S"], () => setTheme("system"), {
    enabled,
    meta: { category: "Theme", description: "Match the system theme" },
  });
  useHotkeySequence(
    ["T", "T"],
    () => {
      let resolved: "light" | "dark";
      if (theme === "system") {
        resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      } else {
        resolved = theme;
      }
      setTheme(resolved === "dark" ? "light" : "dark");
    },
    {
      enabled,
      meta: { category: "Theme", description: "Flip between light and dark" },
    }
  );

  // `?` — Shift+/ on US/UK layouts. PunctuationKey + Shift is excluded from
  // the typed string union to avoid layout-dependent surprises, so we
  // register the raw key the browser actually fires (`event.key === "?"`).
  useHotkey({ key: "?" }, onShowHelp, {
    enabled,
    meta: { category: "App", description: "Show keyboard shortcuts" },
  });
}
