/**
 * Desktop admin sidebar — matches the 1440px Admin artboard. Two
 * sections (HOUSE + SYSTEM) and a user block at the bottom showing
 * who's signed in and how. Hidden on `md-`.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useHouseholdOptional } from "../../lib/household-context";

type NavLink = { to: string; label: string };

const HOUSE_LINKS: NavLink[] = [
  { to: "/", label: "Review" },
  { to: "/shortlist", label: "Shortlist" },
  { to: "/searches", label: "Searches" },
];

const SYSTEM_LINKS: NavLink[] = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/runs", label: "Runs" },
  { to: "/admin/spend", label: "Spend" },
  { to: "/admin/schedules", label: "Schedules" },
  { to: "/admin/settings", label: "Settings" },
];

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Sidebar renders on both the owner-only admin screens (where the
  // household provider is guaranteed) and inside the OwnerGate 403
  // panel for unauth'd users (where it isn't). Optional hook lets us
  // degrade to a generic "signed out" footer rather than throwing.
  const household = useHouseholdOptional();
  const me = household?.members.find(
    (m) => m.userId === household.currentUserId
  );

  return (
    <aside className="hidden h-screen w-60 flex-col justify-between border-brass/20 border-r bg-paper px-4 py-6 md:flex">
      <div className="space-y-6">
        <SidebarSection label="House" links={HOUSE_LINKS} pathname={pathname} />
        <SidebarSection
          label="System"
          links={SYSTEM_LINKS}
          pathname={pathname}
        />
      </div>
      <div className="border-brass/20 border-t pt-4">
        <p className="font-medium text-ink text-sm">
          {me?.name ?? me?.email ?? "—"}
        </p>
        <p className="text-brass text-xs">via Cloudflare Access</p>
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
      <p className="mb-2 font-semibold text-brass text-xs uppercase tracking-wider">
        {label}
      </p>
      <ul className="space-y-1">
        {links.map((link) => {
          // `/` and `/admin` need exact-match (otherwise `/admin/runs`
          // would also light up the `Dashboard` link). Everything else
          // uses a startsWith so sub-routes light up their parent.
          const exactMatch = link.to === "/" || link.to === "/admin";
          const active = exactMatch
            ? pathname === link.to
            : pathname.startsWith(link.to);
          return (
            <li key={link.to}>
              <Link
                to={link.to}
                className={
                  active
                    ? "block rounded px-3 py-2 font-medium text-copper text-sm"
                    : "block rounded px-3 py-2 text-ink text-sm hover:bg-ground"
                }
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
