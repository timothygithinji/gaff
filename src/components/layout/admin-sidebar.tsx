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
  Search01Icon,
  StarIcon,
  SwipeRight03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { ModeToggle } from "../mode-toggle";
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
import { useHouseholdOptional } from "../../lib/household-context";

type IconRef = typeof SwipeRight03Icon;

type NavLink = {
  to: string;
  label: string;
  icon: IconRef;
  badge?: number;
};

const HOUSE_LINKS: NavLink[] = [
  { to: "/", label: "Review", icon: SwipeRight03Icon },
  { to: "/shortlist", label: "Shortlist", icon: StarIcon, badge: 3 },
  { to: "/searches", label: "Searches", icon: Search01Icon },
];

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
            <NavSection label="House" links={HOUSE_LINKS} />
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
          <span className="font-bold font-serif text-lg leading-none">g</span>
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
  const me = household?.members.find(
    (m) => m.userId === household.currentUserId
  );
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();
  const displayName = me?.name ?? me?.email ?? "—";
  return (
    <SidebarFooter className="border-sidebar-border border-t px-3 py-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary font-medium text-primary-foreground text-sm">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <p className="truncate font-medium text-foreground text-sm">
            {displayName}
          </p>
          <p className="text-muted-foreground text-xs">via Cloudflare Access</p>
        </div>
        <div className="group-data-[collapsible=icon]:hidden">
          <ModeToggle />
        </div>
      </div>
    </SidebarFooter>
  );
}

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === to : pathname.startsWith(to);
}
