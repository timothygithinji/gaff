/**
 * Settings left sub-nav (Paper's "Settings" rail).
 *
 * Shared by every `/settings/*` screen so the rail STAYS as you move
 * between Household and Merge duplicates — previously it only lived on the
 * Household page, so opening Merge duplicates dropped you onto a bare
 * centred page with no way back into settings. It's `sticky` to the top of
 * the scroll region so it stays put while long content scrolls past.
 *
 * Active state is derived from the live pathname (not a hardcoded prop), so
 * each route lights its own item. "Merge duplicates" carries a count badge
 * of outstanding suggestion groups, fed by the shared duplicates query —
 * the same cache the page reads, so badge and page never disagree.
 */
import { GitMergeIcon, UserGroup03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { FC } from "react";
import { duplicatesQueryOptions } from "../../lib/duplicates-query";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

type SettingsLink = {
  to: string;
  label: string;
  icon: typeof UserGroup03Icon;
};

const LINKS: SettingsLink[] = [
  { to: "/settings/household", label: "Household", icon: UserGroup03Icon },
  { to: "/settings/duplicates", label: "Merge duplicates", icon: GitMergeIcon },
];

export const SettingsNav: FC = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: groups } = useQuery(duplicatesQueryOptions);
  const dupeCount = groups?.length ?? 0;

  return (
    <nav
      aria-label="Settings"
      className="sticky top-10 flex h-fit w-60 shrink-0 flex-col gap-0.5 self-start"
    >
      <p className="pb-3 font-normal text-[11px] text-slate uppercase tracking-[0.14em]">
        Settings
      </p>
      {LINKS.map((link) => {
        const active = pathname === link.to;
        const showBadge = link.to === "/settings/duplicates" && dupeCount > 0;
        return (
          <Link
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3.5 py-2.5 text-[13px] transition-colors",
              active
                ? "border border-navy bg-card font-semibold text-navy"
                : "text-slate hover:bg-ground/60 hover:text-navy"
            )}
            key={link.to}
            to={link.to}
          >
            <HugeiconsIcon icon={link.icon} size={14} strokeWidth={1.5} />
            <span className="grow">{link.label}</span>
            {showBadge ? (
              <Badge
                aria-label={`${dupeCount} duplicate group${dupeCount === 1 ? "" : "s"} to review`}
                className="h-[18px] min-w-[18px] rounded-full bg-copper px-1 font-bold text-[10px] text-white tabular-nums"
              >
                {dupeCount > 9 ? "9+" : dupeCount}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};
