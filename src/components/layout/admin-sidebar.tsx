/**
 * Desktop app shell — composes the shadcn `<Sidebar>` primitive with the
 * Gaff brand, HOUSE / SYSTEM nav groups, and user footer block.
 *
 * Consumers wrap their page content in `<AdminSidebar>...</AdminSidebar>`
 * (the children render inside `<SidebarInset>`, which is the main column
 * pinned next to the sidebar). The component takes care of mounting the
 * `<SidebarProvider>` so callers don't have to.
 *
 * Visual tokens flow from `--sidebar-*` CSS vars defined in
 * `src/styles/globals.css`, which alias the mineral palette:
 *   - `bg-sidebar`           = paper
 *   - `text-sidebar-foreground` = ink
 *   - active item bg         = ground (via `--sidebar-accent`)
 *   - active item foreground = copper (via `--sidebar-accent-foreground`)
 */
import {
  ArrowUpDownIcon,
  ComputerIcon,
  House03Icon,
  Logout03Icon,
  Moon02Icon,
  Search01Icon,
  StarIcon,
  Sun03Icon,
  SwipeRight03Icon,
  Tick01Icon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "../../components/ui/sidebar";
import { authClient } from "../../lib/auth-client";
import { useHouseholdOptional } from "../../lib/household-context";
import {
  type ListingFromOrigin,
  resolveFromOrigin,
} from "../../lib/listing-origin";
import { queryKeys } from "../../lib/query-keys";
import { getReviewQueue } from "../../server/functions/review";
import { listMyOutcomes } from "../../server/functions/shortlist";
import { useTheme } from "../theme-provider";

type IconRef = typeof SwipeRight03Icon;

type NavLink = {
  to: string;
  label: string;
  icon: IconRef;
  badge?: number;
};

/**
 * Same key + queryFn the `/shortlist` route uses, so when the user
 * navigates there the data is already cached — and the badge here
 * stays in sync when a swipe on the Review screen creates a new
 * shortlist entry. `listMyOutcomes` returns the full list; we just
 * read `.length` for the badge.
 */
const shortlistMineQueryOptions = {
  queryKey: queryKeys.shortlistMine(),
  queryFn: () => listMyOutcomes({ data: { outcome: "keep_or_shortlist" } }),
  staleTime: 15_000,
};

// Unscoped review queue — the badge always reflects the total across
// all searches, even when the user is on `/?searchId=…` looking at a
// filtered view. Shares its queryKey with the Review page's
// unscoped fetch so the cache is reused.
const reviewQueueAllQueryOptions = {
  queryKey: queryKeys.reviewQueue(null),
  queryFn: () => getReviewQueue(),
  staleTime: 0,
};

function useHouseLinks(): NavLink[] {
  const { data: shortlist } = useQuery(shortlistMineQueryOptions);
  const { data: queue } = useQuery(reviewQueueAllQueryOptions);
  return [
    { to: "/searches", label: "Searches", icon: Search01Icon },
    {
      to: "/",
      label: "Review",
      icon: SwipeRight03Icon,
      badge: queue?.remaining,
    },
    {
      to: "/shortlist",
      label: "Shortlist",
      icon: StarIcon,
      badge: shortlist?.length,
    },
  ];
}

/**
 * Optional `mode="desktop-only"` hides the entire shell below `md` so
 * the existing mobile flow can render alongside it (the same pattern
 * the desktop layouts used pre-migration). Default `mode="responsive"`
 * keeps the shell visible everywhere.
 */
type Props = {
  children?: ReactNode;
  mode?: "responsive" | "desktop-only";
};

export function AdminSidebar({ children, mode = "responsive" }: Props) {
  const desktopOnly = mode === "desktop-only";
  const houseLinks = useHouseLinks();
  return (
    <div className={desktopOnly ? "hidden md:contents" : "contents"}>
      {/* Pin the whole shell to the viewport so the inset becomes a
       * scrollable region of fixed height rather than a page that
       * grows past the fold. Children that need to scroll handle it
       * with their own `overflow-y-auto` on an internal flex-1 child. */}
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <Sidebar
          className="group-data-[side=left]:border-r-0 group-data-[side=right]:border-l-0"
          collapsible="icon"
        >
          <Brand />
          <SidebarContent>
            <NavSection label="Household" links={houseLinks} />
          </SidebarContent>
          <UserFooter />
        </Sidebar>
        <SidebarInset className="h-svh min-h-0 overflow-y-auto bg-ground">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function Brand() {
  return (
    <SidebarHeader className="px-3 pt-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <HugeiconsIcon icon={House03Icon} size={18} strokeWidth={1.8} />
        </span>
        <span className="font-serif text-foreground text-xl group-data-[collapsible=icon]:hidden">
          Gaff
        </span>
      </div>
    </SidebarHeader>
  );
}

function NavSection({ label, links }: { label: string; links: NavLink[] }) {
  const location = useRouterState({ select: (s) => s.location });
  const activeTo = resolveActiveLink(location.pathname, location.search);
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {links.map((link) => {
            const active = link.to === activeTo;
            return (
              <SidebarMenuItem key={link.to}>
                <SidebarMenuButton
                  isActive={active}
                  render={<Link to={link.to} />}
                  tooltip={link.label}
                >
                  <HugeiconsIcon
                    icon={link.icon}
                    size={16}
                    strokeWidth={active ? 2 : 1.6}
                  />
                  <span>{link.label}</span>
                </SidebarMenuButton>
                {link.badge ? (
                  <SidebarMenuBadge>{link.badge}</SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserFooter() {
  const household = useHouseholdOptional();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const me = household?.members.find(
    (m) => m.userId === household.currentUserId
  );
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();
  const displayName = me?.name ?? me?.email ?? "—";
  const secondary = me?.email && me.email !== displayName ? me.email : null;

  async function handleSignOut() {
    // 1. Burn the server-side session + auth-client cache.
    // 2. Drop household + auth-scoped queries so no stale data flashes
    //    if the same browser later signs in as someone else.
    // 3. `router.invalidate()` re-runs every route's `beforeLoad` against
    //    the now-null `currentUserId`. The current route's
    //    `requireSession()` throws a redirect to `/login` BEFORE the
    //    component re-renders — without this the component would tick
    //    once with a null household context and `useHousehold()` would
    //    throw "called with no household available".
    await authClient.signOut();
    queryClient.removeQueries({ queryKey: queryKeys.household() });
    await router.invalidate();
  }

  return (
    <SidebarFooter className="border-sidebar-border border-t">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton size="lg" tooltip={displayName}>
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary font-medium text-primary-foreground text-sm">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-medium text-sm">
                      {displayName}
                    </span>
                    {secondary ? (
                      <span className="truncate text-muted-foreground text-xs">
                        {secondary}
                      </span>
                    ) : null}
                  </div>
                  <HugeiconsIcon
                    className="ml-auto opacity-60"
                    icon={ArrowUpDownIcon}
                    size={14}
                    strokeWidth={1.6}
                  />
                </SidebarMenuButton>
              }
            />
            <DropdownMenuContent
              align="end"
              alignOffset={-4}
              className="min-w-56"
              side="top"
              sideOffset={8}
            >
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
                <DropdownMenuItem render={<Link to="/settings/household" />}>
                  <HugeiconsIcon icon={UserSettings01Icon} size={14} />
                  Household settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup className="space-y-0.5">
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <ThemeItem
                  active={theme === "light"}
                  icon={Sun03Icon}
                  label="Light"
                  onSelect={() => setTheme("light")}
                />
                <ThemeItem
                  active={theme === "dark"}
                  icon={Moon02Icon}
                  label="Dark"
                  onSelect={() => setTheme("dark")}
                />
                <ThemeItem
                  active={theme === "system"}
                  icon={ComputerIcon}
                  label="System"
                  onSelect={() => setTheme("system")}
                />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} variant="destructive">
                <HugeiconsIcon icon={Logout03Icon} size={14} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

function ThemeItem({
  active,
  icon,
  label,
  onSelect,
}: {
  active: boolean;
  icon: IconRef;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className={active ? "bg-accent text-accent-foreground" : undefined}
      onClick={onSelect}
    >
      <HugeiconsIcon icon={icon} size={14} />
      {label}
      {active ? (
        <HugeiconsIcon
          className="ml-auto"
          icon={Tick01Icon}
          size={14}
          strokeWidth={2}
        />
      ) : null}
    </DropdownMenuItem>
  );
}

/**
 * Returns the sidebar `link.to` that should appear active for the
 * current location. Normally pathname-driven, but `/listings/*` has no
 * sidebar entry of its own — we read the `?from=` origin baked into the
 * URL by the caller and project it onto Review or Shortlist so the
 * shell still shows where the user came from.
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
  if (pathname.startsWith("/shortlist")) {
    return "/shortlist";
  }
  if (pathname.startsWith("/matches")) {
    return "/shortlist";
  }
  if (pathname.startsWith("/searches")) {
    return "/searches";
  }
  return null;
}
