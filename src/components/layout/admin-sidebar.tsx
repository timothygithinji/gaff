/**
 * Desktop app shell — the shared chrome that wraps every authenticated
 * desktop screen. Renders Paper's TOP NAV BAR (artboard "App bar",
 * 2MS-0) plus a full-width scrollable content region below it.
 *
 * Consumers wrap their page content in `<AdminSidebar>...</AdminSidebar>`
 * exactly as before — the public API (`{ children, mode }`) is
 * unchanged from the old left-rail implementation, so no caller needed
 * structural edits when the rail became a top bar. The name is kept for
 * the same reason (it's imported in ~9 places); think of it as
 * "DesktopShell".
 *
 * Visual contract (locked to the Paper "App bar"):
 *   - 75px tall, white surface (`bg-card`/paper), 1px bottom hairline
 *     `#d9e1e8` (≈ `--line`), 32px horizontal padding, space-between.
 *   - LEFT: navy "G" glyph tile + "gaff" wordmark, then pill tabs
 *     (gap 4px). Active tab = navy fill + white text (weight 600);
 *     inactive = slate `#5a6b7a` text (weight 500).
 *   - RIGHT: search-context pill (`bg-mist` + hairline) + round avatar
 *     with the household initial (copper fill per artboard).
 *
 * Fixed-navy surfaces (the glyph tile + active tab fill + avatar) pin
 * literal hex so they don't flip in the dark scene — per globals.css's
 * dark-mode gotcha.
 */
import {
  Clock01Icon,
  GitMergeIcon,
  House03Icon,
  Logout03Icon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Badge } from "../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { authClient } from "../../lib/auth-client";
import { useHouseholdOptional } from "../../lib/household-context";
import {
  type ListingFromOrigin,
  resolveFromOrigin,
} from "../../lib/listing-origin";
import { queryKeys } from "../../lib/query-keys";
import { cn } from "../../lib/utils";
import { unreadMatchCount } from "../../server/functions/shortlist";

type NavTab = {
  to: string;
  label: string;
};

/** Primary tabs, mirroring the mobile bottom nav's IA. The `/matches`
 * route was retired into the Shortlist pipeline, so its unread badge
 * rides the Shortlist tab (see {@link badgeFor}). */
const TABS: NavTab[] = [
  { to: "/", label: "Review" },
  { to: "/shortlist", label: "Shortlist" },
  { to: "/searches", label: "Searches" },
];

const unreadMatchesQueryOptions = {
  queryKey: queryKeys.matchesUnread(),
  queryFn: () => unreadMatchCount(),
  staleTime: 30_000,
};

/**
 * Optional `mode="desktop-only"` hides the entire shell below `lg` so
 * the mobile flow (bottom nav + single-column pages) renders instead.
 * The boundary lives at `lg` (1024px) to match the bottom nav's
 * `lg:hidden` and the three-column desktop layouts that assume at least
 * a laptop's width.
 */
type Props = {
  children?: ReactNode;
  mode?: "responsive" | "desktop-only";
};

export function AdminSidebar({ children, mode = "responsive" }: Props) {
  const desktopOnly = mode === "desktop-only";
  return (
    <div
      className={cn(
        "flex h-svh min-h-0 flex-col overflow-hidden bg-ground",
        desktopOnly && "hidden lg:flex"
      )}
    >
      <TopNav />
      {/* Content scrolls under the fixed-height bar. Children that need
       * their own scroll region handle it via an internal flex-1 child. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function TopNav() {
  return (
    <header className="flex shrink-0 items-center justify-between border-line border-b bg-ground px-10 py-5">
      <div className="flex items-center gap-10">
        <Brand />
        <NavTabs />
      </div>
      <div className="flex items-center gap-4">
        <UserAvatar />
      </div>
    </header>
  );
}

function Brand() {
  // Paper draws the house glyph as a plain navy outline (no filled tile)
  // next to a bold Inter wordmark. Use the `navy` ink token (not a literal
  // hex) so the mark flips light against the dark scene's near-black ground
  // and stays legible in both themes.
  return (
    <Link className="flex items-center gap-2.5" to="/">
      <HugeiconsIcon
        className="text-navy"
        icon={House03Icon}
        size={24}
        strokeWidth={1.5}
      />
      <span className="font-bold text-[17px] text-navy tracking-[-0.01em]">
        Gaff
      </span>
    </Link>
  );
}

function NavTabs() {
  const location = useRouterState({ select: (s) => s.location });
  const activeTo = resolveActiveLink(location.pathname, location.search);
  const memberCount = useHouseholdOptional()?.memberCount ?? 0;
  const { data: unread } = useQuery({
    ...unreadMatchesQueryOptions,
    enabled: memberCount > 1,
  });
  const unreadCount = unread?.count ?? 0;

  return (
    <nav aria-label="Primary" className="flex items-center gap-1">
      {TABS.map((tab) => {
        const active = tab.to === activeTo;
        const showBadge = tab.to === "/shortlist" && unreadCount > 0;
        return (
          <Link
            className={cn(
              "relative flex items-center justify-center rounded-full px-[18px] py-2 text-[13px] transition-colors",
              active
                ? "bg-[#0e2235] font-semibold text-[#eef1f4]"
                : "text-slate hover:text-navy"
            )}
            key={tab.to}
            to={tab.to}
          >
            {tab.label}
            {showBadge ? (
              <Badge
                aria-label={`${unreadCount} unread match${unreadCount === 1 ? "" : "es"}`}
                className="-top-0.5 -right-0.5 absolute h-[18px] min-w-[18px] rounded-full bg-copper px-1 font-bold text-[10px] text-white tabular-nums"
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

function UserAvatar() {
  const household = useHouseholdOptional();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = household?.members.find(
    (m) => m.userId === household.currentUserId
  );
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();
  const displayName = me?.name ?? me?.email ?? "—";
  const secondary = me?.email && me.email !== displayName ? me.email : null;

  async function handleSignOut() {
    // Burn the session, drop household-scoped queries so no stale data
    // flashes on a later sign-in, then re-run route guards (the current
    // route's requireSession throws a redirect to /login before the
    // component re-renders against a null household).
    await authClient.signOut();
    queryClient.removeQueries({ queryKey: queryKeys.household() });
    await router.invalidate();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={displayName}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#0e2235] font-semibold text-[#eef1f4] text-[13px] transition-opacity hover:opacity-90 active:scale-[0.98]"
            type="button"
          >
            {initial}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="grid gap-0.5">
              <span className="truncate font-medium text-sm">
                {displayName}
              </span>
              {secondary ? (
                <span className="truncate text-muted-foreground text-xs">
                  {secondary}
                </span>
              ) : null}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/deferred" />}>
            <HugeiconsIcon icon={Clock01Icon} size={14} />
            Deferred listings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/settings/duplicates" />}>
            <HugeiconsIcon icon={GitMergeIcon} size={14} />
            Merge duplicates
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/settings/household" />}>
            <HugeiconsIcon icon={UserSettings01Icon} size={14} />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} variant="destructive">
          <HugeiconsIcon icon={Logout03Icon} size={14} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Returns the tab `to` that should appear active for the current
 * location. Pathname-driven, except `/listings/*` (no tab of its own)
 * reads the `?from=` origin so the bar still highlights where the user
 * came from. `/matches` maps to Shortlist since that route was retired
 * into the Shortlist pipeline.
 */
function resolveActiveLink(
  pathname: string,
  search: Record<string, unknown>
): string | null {
  if (pathname.startsWith("/listings/")) {
    return resolveFromOrigin(search.from as ListingFromOrigin).sidebarTo;
  }
  if (pathname === "/") {
    return "/";
  }
  if (pathname.startsWith("/shortlist") || pathname.startsWith("/matches")) {
    return "/shortlist";
  }
  if (pathname.startsWith("/searches")) {
    return "/searches";
  }
  return null;
}
