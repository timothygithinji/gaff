/**
 * `/admin/spend` — placeholder for the v1.1 spend dashboard. v1 ships
 * the totals on the index dashboard's metric card; the deeper
 * per-day / per-model / per-search breakdown lands in v1.1.
 */
import { createFileRoute } from "@tanstack/react-router";
import { OwnerGate } from "../../components/admin/owner-gate";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { requireSession } from "../../lib/auth-guard";

export const Route = createFileRoute("/admin/spend")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/admin/spend");
  },
  component: AdminSpendPage,
});

function AdminSpendPage() {
  return (
    <OwnerGate>
      <AdminSidebar>
        <div className="flex-1 px-10 py-8">
          <header className="mb-8">
            <p className="font-semibold text-[11px] text-primary uppercase tracking-[0.14em]">
              System · Spend
            </p>
            <h1 className="mt-2 font-serif text-3xl text-foreground">Spend</h1>
          </header>
          <div className="rounded-2xl bg-muted p-8 text-center">
            <p className="font-serif text-2xl text-foreground">
              Spend dashboard coming in v1.1
            </p>
            <p className="mt-2 text-muted-foreground text-sm">
              Per-day, per-model, per-search breakdowns will land here. The
              monthly total sits on the main dashboard for now.
            </p>
          </div>
        </div>
      </AdminSidebar>
    </OwnerGate>
  );
}
