/**
 * Mobile bottom nav. Hidden on `md+` where the AdminSidebar takes
 * over. Always shows the three primary tabs (Review · Shortlist ·
 * Searches) so the layout stays consistent across household sizes —
 * solo users land on the Shortlist screen's empty state rather than
 * discovering the kanban only after a partner joins.
 *
 * The unread-mutual-match badge now sits on the Shortlist tab — the
 * `/matches` route was retired in favour of the Shortlist pipeline's
 * "Shortlisted" column. The underlying query stays gated to multi-
 * member households so solo users don't poll for nothing.
 */
import {
  Search01Icon,
  StarIcon,
  SwipeRight03Icon,
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
    // Matches the legacy `/matches` URL too so deep-links during the
    // redirect window still highlight the right tab.
    match: (p) => p.startsWith("/shortlist") || p.startsWith("/matches"),
  },
  {
    to: "/searches",
    label: "Searches",
    icon: Search01Icon,
    match: (p) => p.startsWith("/searches"),
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
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-border border-t bg-card md:hidden"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        const isShortlist = tab.to === "/shortlist";
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
            {isShortlist && unreadCount > 0 ? (
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
