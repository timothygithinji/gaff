/**
 * Desktop admin sidebar — matches the 1440px Admin artboard. Two
 * sections (HOUSE + SYSTEM) and a user block at the bottom showing
 * who's signed in and how. Hidden on `md-`.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useHousehold } from "../../lib/household-context";

type NavLink = { to: string; label: string };

const HOUSE_LINKS: NavLink[] = [
  { to: "/", label: "Review" },
  { to: "/shortlist", label: "Shortlist" },
  { to: "/searches", label: "Searches" },
];

const SYSTEM_LINKS: NavLink[] = [
  { to: "/admin/runs", label: "Runs" },
  { to: "/admin/spend", label: "Spend" },
  { to: "/admin/schedules", label: "Schedules" },
  { to: "/settings/household", label: "Settings" },
];

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { members, currentUserId } = useHousehold();
  const me = members.find((m) => m.userId === currentUserId);

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
          const active =
            link.to === "/" ? pathname === "/" : pathname.startsWith(link.to);
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
