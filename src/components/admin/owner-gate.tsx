/**
 * Owner gate for `/admin/*` routes. The household context is always
 * loaded by the time these screens render (the root route's loader
 * primes it), so we can branch on `isOwner` synchronously.
 *
 * Non-owners get a 403 panel instead of the admin layout — the server
 * functions are household-scoped (an owner of household A still can't
 * see household B's runs) but only the owner is meant to operate the
 * scrape / AI cost dials, hence the UX gate.
 */
import type { ReactNode } from "react";
import { useHouseholdOptional } from "../../lib/household-context";
import { AdminSidebar } from "../layout/admin-sidebar";

export function OwnerGate({ children }: { children: ReactNode }) {
  const household = useHouseholdOptional();
  // Pre-auth / no household — render the 403 panel so the route never
  // accidentally leaks an owner-only view to a logged-out user. The
  // `__root` loader still runs first; if the user is signed in but
  // mid-household-bootstrap this branch flashes briefly and then the
  // owner branch takes over.
  if (!household) {
    return <ForbiddenPanel reason="signin" />;
  }
  if (!household.isOwner) {
    return <ForbiddenPanel reason="not-owner" />;
  }
  return <>{children}</>;
}

function ForbiddenPanel({ reason }: { reason: "signin" | "not-owner" }) {
  const body =
    reason === "signin"
      ? "Sign in to view the admin console."
      : "Only the household owner can see this. Ask whoever set the household up.";
  return (
    <div className="flex min-h-screen bg-ground">
      <AdminSidebar />
      <main className="flex flex-1 items-center justify-center p-10">
        <div className="max-w-md rounded-2xl bg-bone p-8 text-center">
          <p className="font-semibold text-[10px] text-copper uppercase tracking-[0.12em]">
            403 · Restricted
          </p>
          <h1 className="mt-2 font-serif text-2xl text-ink">Owner-only area</h1>
          <p className="mt-3 text-brass text-sm">{body}</p>
        </div>
      </main>
    </div>
  );
}
