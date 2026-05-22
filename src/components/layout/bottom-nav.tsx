/**
 * Mobile bottom nav. Hidden on `md+` where the AdminSidebar takes
 * over. Always shows the four primary tabs (Review · Shortlist ·
 * Searches · Matches) so the layout stays consistent across household
 * sizes — solo users land on the Matches screen's empty state rather
 * than discovering the tab only after a partner joins.
 *
 * Matches shows an unread badge driven by `unreadMatchCount` — the
 * underlying query stays gated to multi-member households so we don't
 * poll for nothing. Tapping the route clears the badge via
 * `markMatchesSeen`.
 */
import {
  Search01Icon,
  StarIcon,
  SwipeRight03Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Badge } from "../../components/ui/badge";
import { useHousehold } from "../../lib/household-context";
import { queryKeys } from "../../lib/query-keys";
import { cn } from "../../lib/utils";
import { unreadMatchCount } from "../../server/functions/shortlist";

type Tab = {
  to: string;
  label: string;
  icon: typeof SwipeRight03Icon;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    to: "/",
    label: "Review",
    icon: SwipeRight03Icon,
    match: (p) => p === "/",
  },
  {
    to: "/shortlist",
    label: "Shortlist",
    icon: StarIcon,
    match: (p) => p.startsWith("/shortlist"),
  },
  {
    to: "/searches",
    label: "Searches",
    icon: Search01Icon,
    match: (p) => p.startsWith("/searches"),
  },
  {
    to: "/matches",
    label: "Matches",
    icon: UserGroupIcon,
    match: (p) => p.startsWith("/matches"),
  },
];

const unreadMatchesQueryOptions = {
  queryKey: queryKeys.matchesUnread(),
  queryFn: () => unreadMatchCount(),
  staleTime: 30_000,
};

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { memberCount } = useHousehold();

  // Only run the unread query for multi-member households. Solo users
  // can't accrue mutual matches with themselves, so the count would
  // always be zero — skip the poll entirely.
  const { data: unread } = useQuery({
    ...unreadMatchesQueryOptions,
    enabled: memberCount > 1,
  });
  const unreadCount = unread?.count ?? 0;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-border border-t bg-card md:hidden"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        const isMatches = tab.to === "/matches";
        return (
          <Link
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
            key={tab.to}
            to={tab.to}
          >
            <HugeiconsIcon
              icon={tab.icon}
              size={22}
              strokeWidth={active ? 2 : 1.6}
            />
            <span className="font-medium text-[11px] tracking-wide">
              {tab.label}
            </span>
            {isMatches && unreadCount > 0 ? (
              <Badge
                aria-label={`${unreadCount} unread match${unreadCount === 1 ? "" : "es"}`}
                className="absolute top-1 right-[26%] h-4 min-w-4 rounded-full px-1 font-bold text-[9px] tabular-nums"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
