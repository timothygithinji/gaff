/**
 * `/admin/settings` — placeholder for v1.1. Household settings live at
 * `/settings/household`; this slot is reserved for system-wide knobs
 * (pause-all, budget cap, notification preferences) once we land them.
 */
import { createFileRoute } from "@tanstack/react-router";
import { OwnerGate } from "../../components/admin/owner-gate";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { requireSession } from "../../lib/auth-guard";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: ({ context }) => {
    requireSession(
      context as { currentUserId: string | null },
      "/admin/settings"
    );
  },
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  return (
    <OwnerGate>
      <div className="flex min-h-screen bg-ground">
        <AdminSidebar />
        <main className="flex-1 px-10 py-8">
          <header className="mb-8">
            <p className="font-semibold text-[11px] text-copper uppercase tracking-[0.14em]">
              System · Settings
            </p>
            <h1 className="mt-2 font-serif text-3xl text-ink">Settings</h1>
          </header>
          <div className="rounded-2xl bg-bone p-8 text-center">
            <p className="font-serif text-2xl text-ink">
              Settings coming in v1.1
            </p>
            <p className="mt-2 text-brass text-sm">
              Household membership lives in{" "}
              <a className="text-copper underline" href="/settings/household">
                /settings/household
              </a>{" "}
              for now.
            </p>
          </div>
        </main>
      </div>
    </OwnerGate>
  );
}
