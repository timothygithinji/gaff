/**
 * Desktop admin sidebar — matches the 1440px Admin artboard. Wordmark
 * at the top, two nav sections (HOUSE + SYSTEM) with Hugeicons icons,
 * and a user block at the bottom showing who's signed in. Hidden on `md-`.
 */
import {
  Calendar03Icon,
  CoinsDollarIcon,
  Database01Icon,
  Search01Icon,
  Settings02Icon,
  StarIcon,
  SwipeRight03Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { useHouseholdOptional } from "../../lib/household-context";
import { cn } from "../../lib/utils";

type IconRef = typeof SwipeRight03Icon;

type NavLink = { to: string; label: string; icon: IconRef };

const HOUSE_LINKS: NavLink[] = [
  { to: "/", label: "Review", icon: SwipeRight03Icon },
  { to: "/shortlist", label: "Shortlist", icon: StarIcon },
  { to: "/searches", label: "Searches", icon: Search01Icon },
];

const SYSTEM_LINKS: NavLink[] = [
  { to: "/admin", label: "Dashboard", icon: Database01Icon },
  { to: "/admin/runs", label: "Runs", icon: Database01Icon },
  { to: "/admin/spend", label: "Spend", icon: CoinsDollarIcon },
  { to: "/admin/schedules", label: "Schedules", icon: Calendar03Icon },
  { to: "/admin/settings", label: "Settings", icon: Settings02Icon },
];

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const household = useHouseholdOptional();
  const me = household?.members.find(
    (m) => m.userId === household.currentUserId
  );
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  return (
    <aside className="hidden h-screen w-60 flex-col justify-between border-border border-r bg-card px-4 py-6 md:flex">
      <div className="space-y-6">
        <div className="flex items-center gap-2 px-3 pb-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-bold font-serif text-lg">g</span>
          </span>
          <span className="font-serif text-foreground text-xl">Gaff</span>
        </div>
        <SidebarSection label="House" links={HOUSE_LINKS} pathname={pathname} />
        <SidebarSection
          label="System"
          links={SYSTEM_LINKS}
          pathname={pathname}
        />
      </div>
      <div className="flex items-center gap-3 border-border border-t pt-4">
        <Avatar>
          <AvatarFallback className="bg-primary font-medium text-primary-foreground text-sm">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground text-sm">
            {me?.name ?? me?.email ?? "—"}
          </p>
          <p className="text-muted-foreground text-xs">via Cloudflare Access</p>
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({
  label,
  links,
  pathname,
}: {
  label: string;
  links: NavLink[];
  pathname: string;
}) {
  return (
    <div>
      <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </p>
      <ul className="space-y-1">
        {links.map((link) => {
          const exactMatch = link.to === "/" || link.to === "/admin";
          const active = exactMatch
            ? pathname === link.to
            : pathname.startsWith(link.to);
          return (
            <li key={link.to}>
              <Link
                to={link.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-primary"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <HugeiconsIcon
                  icon={link.icon}
                  size={16}
                  strokeWidth={active ? 2 : 1.6}
                />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
