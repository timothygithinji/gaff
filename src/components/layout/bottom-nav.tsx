/**
 * Mobile bottom nav. Hidden on `md+` where the AdminSidebar takes
 * over. The Matches tab is conditional on the household having more
 * than one member — solo users never see it (mutual matches with
 * yourself are noise).
 *
 * When the household has multiple members, the Matches tab shows an
 * unread badge driven by `unreadMatchCount` — counts mutual matches
 * that landed after the user last opened `/matches`. Tapping the route
 * clears the badge via `markMatchesSeen`.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useHousehold } from "../../lib/household-context";
import { queryKeys } from "../../lib/query-keys";
import { unreadMatchCount } from "../../server/functions/shortlist";

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

const unreadMatchesQueryOptions = {
  queryKey: queryKeys.matchesUnread(),
  queryFn: () => unreadMatchCount(),
  staleTime: 30_000,
};

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { memberCount } = useHousehold();
  const tabs = memberCount > 1 ? [...TABS, MATCHES_TAB] : TABS;

  // Only run the unread query when the Matches tab is actually visible.
  // Solo users have no Matches tab — no need to poll.
  const { data: unread } = useQuery({
    ...unreadMatchesQueryOptions,
    enabled: memberCount > 1,
  });
  const unreadCount = unread?.count ?? 0;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-brass/20 border-t bg-paper md:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        const isMatches = tab.to === "/matches";
        return (
          <Link
            className={
              active
                ? "relative flex flex-col items-center justify-center py-3 text-copper"
                : "relative flex flex-col items-center justify-center py-3 text-brass"
            }
            key={tab.to}
            to={tab.to}
          >
            <span className="font-medium text-xs uppercase tracking-wide">
              {tab.label}
            </span>
            {isMatches && unreadCount > 0 ? (
              <span
                aria-label={`${unreadCount} unread match${unreadCount === 1 ? "" : "es"}`}
                className="-top-0.5 absolute right-[28%] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-copper px-1 font-bold text-[9px] text-bone"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
