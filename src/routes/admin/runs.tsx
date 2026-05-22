/**
 * `/admin/runs` — "see all" variant of the recent-runs table. Same
 * shape as the dashboard panel, just a deeper limit (500) and no
 * metric cards. v1.1 will layer filters / search / export on top.
 */
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OwnerGate } from "../../components/admin/owner-gate";
import {
  type RunFilter,
  RunsFilterPills,
} from "../../components/admin/runs-filter-pills";
import { RunsTable } from "../../components/admin/runs-table";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { requireSession } from "../../lib/auth-guard";
import { queryKeys } from "../../lib/query-keys";
import { listRecentRuns, runFilterCounts } from "../../server/functions/admin";

const RUNS_LIMIT = 500;

const allRunsQueryOptions = (filter: RunFilter) => ({
  queryKey: queryKeys.admin.runs(filter),
  queryFn: () => listRecentRuns({ data: { filter, limit: RUNS_LIMIT } }),
  staleTime: 15_000,
});

const filterCountsQueryOptions = {
  queryKey: queryKeys.admin.filterCounts(),
  queryFn: () => runFilterCounts(),
  staleTime: 30_000,
};

export const Route = createFileRoute("/admin/runs")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/admin/runs");
  },
  // No loader-side prefetch: the admin queries require an owner-gated
  // session, and the loader runs before the OwnerGate component gets
  // a chance to render the 403 panel.
  component: AdminRunsPage,
});

function AdminRunsPage() {
  return (
    <OwnerGate>
      <AllRunsTable />
    </OwnerGate>
  );
}

function AllRunsTable() {
  const [filter, setFilter] = useState<RunFilter>("all");
  const { data: counts } = useSuspenseQuery(filterCountsQueryOptions);
  const { data: runs } = useSuspenseQuery(allRunsQueryOptions(filter));

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 px-10 py-8">
        <header className="mb-6">
          <p className="font-semibold text-[11px] text-primary uppercase tracking-[0.14em]">
            System · Runs
          </p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">All runs</h1>
        </header>
        <div className="mb-4">
          <RunsFilterPills
            counts={counts}
            onChange={setFilter}
            value={filter}
          />
        </div>
        <RunsTable rows={runs} />
      </main>
    </div>
  );
}
