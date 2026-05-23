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
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { queryKeys } from "../../lib/query-keys";
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

function useHouseLinks(): NavLink[] {
  const { data } = useQuery(shortlistMineQueryOptions);
  return [
    { to: "/searches", label: "Searches", icon: Search01Icon },
    { to: "/", label: "Review", icon: SwipeRight03Icon },
    {
      to: "/shortlist",
      label: "Shortlist",
      icon: StarIcon,
      badge: data?.length,
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
            <NavSection label="House" links={houseLinks} />
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {links.map((link) => {
            const active = isActive(pathname, link.to);
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
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const me = household?.members.find(
    (m) => m.userId === household.currentUserId
  );
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();
  const displayName = me?.name ?? me?.email ?? "—";
  const secondary = me?.email && me.email !== displayName ? me.email : null;

  async function handleSignOut() {
    await authClient.signOut();
    await navigate({ to: "/login" });
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
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem render={<Link to="/settings/household" />}>
                  <HugeiconsIcon icon={UserSettings01Icon} size={14} />
                  Household settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setTheme("light")}>
                  <HugeiconsIcon icon={Sun03Icon} size={14} />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                  <HugeiconsIcon icon={Moon02Icon} size={14} />
                  Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  <HugeiconsIcon icon={ComputerIcon} size={14} />
                  System
                </DropdownMenuItem>
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

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === to : pathname.startsWith(to);
}
