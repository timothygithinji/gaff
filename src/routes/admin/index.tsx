/**
 * `/admin` — desktop-only admin dashboard.
 *
 * Layout matches the 1440px "Admin · runs" Paper artboard:
 *   - AdminSidebar on the left (HOUSE + SYSTEM nav).
 *   - Header: eyebrow + "Quiet morning, busy night." headline + a
 *     SystemStatusPill in the top-right.
 *   - Four metric cards (Spend / Listings ingested 24h / AI today /
 *     Dedupe cross-portal).
 *   - "Recent runs" panel with filter pills + a runs table.
 *
 * Owner-only (see `OwnerGate`). Server functions are also household-
 * scoped so a non-owner who hand-rolls the request gets back at most
 * their own household's data, but never another household's.
 */
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MetricCard } from "../../components/admin/metric-card";
import { OwnerGate } from "../../components/admin/owner-gate";
import {
  type RunFilter,
  RunsFilterPills,
} from "../../components/admin/runs-filter-pills";
import { RunsTable } from "../../components/admin/runs-table";
import { SystemStatusPill } from "../../components/admin/system-status-pill";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { requireSession } from "../../lib/auth-guard";
import { queryKeys } from "../../lib/query-keys";
import {
  adminMetrics,
  listRecentRuns,
  runFilterCounts,
} from "../../server/functions/admin";

const metricsQueryOptions = {
  queryKey: queryKeys.admin.metrics(),
  queryFn: () => adminMetrics(),
  staleTime: 30_000,
};

const recentRunsQueryOptions = (filter: RunFilter) => ({
  queryKey: queryKeys.admin.recentRuns(filter),
  queryFn: () => listRecentRuns({ data: { filter, limit: 50 } }),
  staleTime: 15_000,
});

const filterCountsQueryOptions = {
  queryKey: queryKeys.admin.filterCounts(),
  queryFn: () => runFilterCounts(),
  staleTime: 30_000,
};

export const Route = createFileRoute("/admin/")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/admin");
  },
  component: AdminIndexPage,
});

function AdminIndexPage() {
  // No loader-side prefetch: the admin queries require an owner-gated
  // session, and the loader runs before the OwnerGate's UI gets a
  // chance to render the 403 panel. Letting Suspense pick up the
  // queries on the client keeps the redirect / 403 path clean.
  return (
    <OwnerGate>
      <AdminDashboard />
    </OwnerGate>
  );
}

function AdminDashboard() {
  const [filter, setFilter] = useState<RunFilter>("all");
  const { data: metrics } = useSuspenseQuery(metricsQueryOptions);
  const { data: counts } = useSuspenseQuery(filterCountsQueryOptions);
  const { data: runs } = useSuspenseQuery(recentRunsQueryOptions(filter));

  return (
    <div className="flex min-h-screen bg-ground">
      <AdminSidebar />
      <main className="flex-1 px-10 py-8">
        <DashboardHeader />
        <MetricCardsRow metrics={metrics} />
        <section className="mt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-serif text-ink text-xl">Recent runs</h2>
            <RunsFilterPills
              counts={counts}
              onChange={setFilter}
              value={filter}
            />
          </div>
          <RunsTable rows={runs} />
        </section>
      </main>
    </div>
  );
}

function DashboardHeader() {
  return (
    <header className="mb-8 flex items-start justify-between">
      <div>
        <p className="font-semibold text-[11px] text-copper uppercase tracking-[0.14em]">
          System · Last 24h
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink leading-tight">
          {pickHeadline()}
        </h1>
      </div>
      <SystemStatusPill />
    </header>
  );
}

/**
 * Pick a copy variant based on the local hour. v1 chooses from a small
 * fixed set; v1.1 may swap in something more dynamic once the dashboard
 * has more telemetry to summarise.
 */
function pickHeadline(): string {
  const hour = new Date().getHours();
  if (hour < 6) {
    return "Late shift, steady hands.";
  }
  if (hour < 12) {
    return "Quiet morning, busy night.";
  }
  if (hour < 18) {
    return "Afternoon hum, listings landing.";
  }
  return "Evening sweep, lights still on.";
}

function MetricCardsRow({
  metrics,
}: {
  metrics: Awaited<ReturnType<typeof adminMetrics>>;
}) {
  const {
    spendThisMonth,
    listingsIngested24h,
    aiCallsToday,
    dedupeCrossPortal,
  } = metrics;
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        eyebrow="Spend this month"
        sparkline={spendThisMonth.sparkline}
        stat={`$${spendThisMonth.totalUsd.toFixed(2)}`}
        sub={
          <span>
            of ${spendThisMonth.budgetUsd.toFixed(2)} ·{" "}
            {spendThisMonth.percentUsed.toFixed(0)}% ·{" "}
            <span
              className={
                spendThisMonth.deltaVsLastMonth >= 0
                  ? "text-[#B05A38]"
                  : "text-[#7A8C5C]"
              }
            >
              {spendThisMonth.deltaVsLastMonth >= 0 ? "+" : ""}
              {spendThisMonth.deltaVsLastMonth.toFixed(0)}% vs last
            </span>
          </span>
        }
      />
      <MetricCard
        eyebrow="Listings ingested · 24h"
        stat={listingsIngested24h.total.toLocaleString()}
        sub={
          <span>
            of {listingsIngested24h.ofGrandTotal.toLocaleString()} total · RM{" "}
            {listingsIngested24h.byPortal.rightmove} · ZO{" "}
            {listingsIngested24h.byPortal.zoopla} · OR{" "}
            {listingsIngested24h.byPortal.openrent}
          </span>
        }
      />
      <MetricCard
        eyebrow="AI calls today"
        stat={aiCallsToday.total.toLocaleString()}
        sub={
          <span>
            ${aiCallsToday.spentUsd.toFixed(2)} ·{" "}
            {aiCallsToday.byModel.length === 0
              ? "no models yet"
              : aiCallsToday.byModel
                  .map((m) => `${m.model}: ${m.count}`)
                  .join(" · ")}
          </span>
        }
      />
      <MetricCard
        eyebrow="Dedupe · cross-portal"
        stat={`${dedupeCrossPortal.collapsedPct.toFixed(0)}%`}
        sub={
          <span>
            {dedupeCrossPortal.threePortalClusters} on 3 portals ·{" "}
            {dedupeCrossPortal.twoPortalClusters} on 2 ·{" "}
            {dedupeCrossPortal.soloListings} solo
          </span>
        }
      />
    </section>
  );
}
