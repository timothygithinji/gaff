/**
 * `/admin/spend` — per-day, per-model, per-search cost breakdown for
 * the calling household, this month. Three small tables stacked
 * vertically.
 */
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { OwnerGate } from "../../components/admin/owner-gate";
import { Sparkline } from "../../components/admin/sparkline";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { requireSession } from "../../lib/auth-guard";
import { queryKeys } from "../../lib/query-keys";
import {
  type SpendBreakdown,
  getSpendBreakdown,
} from "../../server/functions/admin";

const spendQueryOptions = {
  queryKey: queryKeys.admin.spend(),
  queryFn: () => getSpendBreakdown(),
  staleTime: 30_000,
};

export const Route = createFileRoute("/admin/spend")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/admin/spend");
  },
  component: AdminSpendPage,
});

function AdminSpendPage() {
  return (
    <OwnerGate>
      <SpendScreen />
    </OwnerGate>
  );
}

function SpendScreen() {
  const { data } = useSuspenseQuery(spendQueryOptions);
  const percentUsed =
    data.budgetUsd === 0 ? 0 : (data.totalUsd / data.budgetUsd) * 100;
  return (
    <AdminSidebar>
      <div className="flex-1 px-10 py-8">
        <header className="mb-8">
          <p className="font-semibold text-[11px] text-primary uppercase tracking-[0.14em]">
            System · Spend
          </p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Spend</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            ${data.totalUsd.toFixed(2)} of ${data.budgetUsd.toFixed(0)} cap ·{" "}
            {percentUsed.toFixed(0)}% used · last 30 days for trend, this month
            for breakdowns.
          </p>
        </header>

        <PerDayCard data={data} />
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <PerModelCard data={data} />
          <PerSearchCard data={data} />
        </div>
      </div>
    </AdminSidebar>
  );
}

function PerDayCard({ data }: { data: SpendBreakdown }) {
  const sparkline = data.perDay.map((d) => d.usd);
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-semibold text-[12px] text-muted-foreground uppercase tracking-wide">
          Daily · last 30 days
        </h2>
        <span className="font-serif text-2xl text-foreground">
          ${data.totalUsd.toFixed(2)}
        </span>
      </header>
      <Sparkline data={sparkline} height={48} width={720} />
      <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
        <span>{data.perDay[0]?.date ?? ""}</span>
        <span>{data.perDay.at(-1)?.date ?? ""}</span>
      </div>
    </section>
  );
}

function PerModelCard({ data }: { data: SpendBreakdown }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <header className="mb-4">
        <h2 className="font-semibold text-[12px] text-muted-foreground uppercase tracking-wide">
          By model · this month
        </h2>
      </header>
      {data.perModel.length === 0 ? (
        <EmptyRow label="No runs this month yet." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.perModel.map((row) => (
            <li
              className="flex items-center justify-between gap-4 py-3"
              key={row.model}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground text-sm">
                  {row.model}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {row.calls} call{row.calls === 1 ? "" : "s"}
                </span>
              </div>
              <span className="font-serif text-foreground text-sm">
                ${row.usd.toFixed(4)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PerSearchCard({ data }: { data: SpendBreakdown }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <header className="mb-4">
        <h2 className="font-semibold text-[12px] text-muted-foreground uppercase tracking-wide">
          By search · this month
        </h2>
      </header>
      {data.perSearch.length === 0 ? (
        <EmptyRow label="No runs this month yet." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.perSearch.map((row) => (
            <li
              className="flex items-center justify-between gap-4 py-3"
              key={row.searchId}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium text-foreground text-sm">
                  {row.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {row.runs} run{row.runs === 1 ? "" : "s"}
                </span>
              </div>
              <span className="font-serif text-foreground text-sm">
                ${row.usd.toFixed(4)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <p className="py-6 text-center text-muted-foreground text-sm">{label}</p>
  );
}
