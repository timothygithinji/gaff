/**
 * Mobile bottom nav. Hidden on `md+` where the AdminSidebar takes
 * over. The Matches tab is conditional on the household having more
 * than one member — solo users never see it (mutual matches with
 * yourself are noise).
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useHousehold } from "../../lib/household-context";

type Tab = {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  { to: "/", label: "Review", match: (p) => p === "/" },
  {
    to: "/shortlist",
    label: "Shortlist",
    match: (p) => p.startsWith("/shortlist"),
  },
  {
    to: "/searches",
    label: "Searches",
    match: (p) => p.startsWith("/searches"),
  },
];

const MATCHES_TAB: Tab = {
  to: "/matches",
  label: "Matches",
  match: (p) => p.startsWith("/matches"),
};

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { memberCount } = useHousehold();
  const tabs = memberCount > 1 ? [...TABS, MATCHES_TAB] : TABS;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-brass/20 border-t bg-paper md:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={
              active
                ? "flex flex-col items-center justify-center py-3 text-copper"
                : "flex flex-col items-center justify-center py-3 text-brass"
            }
          >
            <span className="font-medium text-xs uppercase tracking-wide">
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
