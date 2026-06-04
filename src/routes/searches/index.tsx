/**
 * `/searches` — the current household's saved searches.
 *
 * Mobile (this file) renders the Paper "Searches · Mobile" artboard
 * (3AV-0): an eyebrow + "Searches" title with a "New" pill, then one
 * bordered card per saved search (status row, name, subline, stat strip,
 * cadence footer). Desktop is delegated to `DesktopSearches`.
 */
import {
  Add01Icon,
  Clock01Icon,
  More02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ScheduleObject } from "@trigger.dev/core/v3";
import { useEffect, useState } from "react";
import { BottomNav } from "../../components/layout/bottom-nav";
import { DesktopSearches } from "../../components/searches/desktop-searches";
import { subline } from "../../components/searches/desktop-searches";
import { requireSession } from "../../lib/auth-guard";
import { findCadenceByCron } from "../../lib/cron-presets";
import { queryKeys } from "../../lib/query-keys";
import { cn } from "../../lib/utils";
import { listSchedules } from "../../server/functions/schedules";
import {
  type SearchRow,
  type SearchesPerSearchStats,
  type SearchesPortfolio,
  getSearchesPortfolio,
  listSearches,
} from "../../server/functions/searches";

const searchesQueryOptions = {
  queryKey: queryKeys.searches(),
  queryFn: () => listSearches(),
  staleTime: 30_000,
};

const portfolioQueryOptions = {
  queryKey: queryKeys.searchesPortfolio(),
  queryFn: () => getSearchesPortfolio(),
  staleTime: 30_000,
};

const schedulesQueryOptions = {
  queryKey: queryKeys.schedules(),
  queryFn: () => listSchedules(),
  staleTime: 30_000,
};

export const Route = createFileRoute("/searches/")({
  head: () => ({ meta: [{ title: "Searches · Gaff" }] }),
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/searches");
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(searchesQueryOptions),
      context.queryClient.ensureQueryData(portfolioQueryOptions),
      context.queryClient.ensureQueryData(schedulesQueryOptions),
    ]),
  component: SearchesIndexPage,
});

function cadenceLabelMap(schedules: ScheduleObject[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of schedules) {
    if (!s.externalId) {
      continue;
    }
    const cadence = findCadenceByCron(s.generator.expression);
    out.set(s.externalId, cadence.label);
  }
  return out;
}

function SearchesIndexPage() {
  const { data } = useSuspenseQuery(searchesQueryOptions);
  const { data: portfolio } = useSuspenseQuery(portfolioQueryOptions);
  const { data: schedules } = useSuspenseQuery(schedulesQueryOptions);
  const cadenceBySearch = cadenceLabelMap(schedules);
  const paused = Math.max(
    0,
    portfolio.totals.totalSearches - portfolio.totals.activeSearches
  );

  return (
    <>
      <DesktopSearches
        cadenceBySearch={cadenceBySearch}
        portfolio={portfolio}
        searches={data}
      />

      <div className="mx-auto min-h-screen max-w-md bg-background pb-28 sm:max-w-2xl lg:hidden">
        <header className="flex items-start justify-between gap-4 px-5 pt-2 pb-3.5">
          <div className="flex flex-col gap-1">
            <p className="font-normal text-[11px] text-slate uppercase tracking-[0.14em]">
              {portfolio.totals.activeSearches} watching
              {paused > 0 ? ` · ${paused} paused` : ""}
            </p>
            <h1 className="font-semibold text-[26px] text-navy leading-8 tracking-[-0.02em]">
              Searches
            </h1>
          </div>
          <Link
            className='mt-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy px-4 py-2 font-medium text-[#eef1f4] text-[12px]'
            to="/searches/new"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2.2} />
            New
          </Link>
        </header>

        <main className="space-y-3 px-5">
          {data.length === 0 ? (
            <EmptyState />
          ) : (
            <SearchList
              cadenceBySearch={cadenceBySearch}
              portfolio={portfolio}
              searches={data}
            />
          )}
        </main>
        <BottomNav />
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-lg border border-line bg-paper p-8 text-center">
      <p className="font-semibold text-[20px] text-navy">No searches yet</p>
      <p className="mt-2 text-[13px] text-slate">
        Start watching a corner of the rental market. Pick your area, beds, and
        budget — we'll tell you what's worth a viewing.
      </p>
      <Link
        className='mt-6 inline-flex items-center gap-1.5 rounded-md bg-navy px-5 py-2.5 font-medium text-[#eef1f4] text-[13px]'
        to="/searches/new"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
        Create your first search
      </Link>
    </div>
  );
}

function SearchList({
  searches,
  portfolio,
  cadenceBySearch,
}: {
  searches: SearchRow[];
  portfolio: SearchesPortfolio;
  cadenceBySearch: Map<string, string>;
}) {
  const statsBySearch = new Map(portfolio.perSearch.map((s) => [s.searchId, s]));
  return (
    <ul className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
      {searches.map((s) => (
        <li key={s.id}>
          <MobileCard
            cadenceLabel={cadenceBySearch.get(s.id) ?? null}
            search={s}
            stats={statsBySearch.get(s.id) ?? null}
          />
        </li>
      ))}
    </ul>
  );
}

function MobileCard({
  search,
  stats,
  cadenceLabel,
}: {
  search: SearchRow;
  stats: SearchesPerSearchStats | null;
  cadenceLabel: string | null;
}) {
  const paused = !search.active;
  return (
    <Link
      className="flex flex-col gap-3.5 rounded-lg border border-line bg-paper p-[18px]"
      params={{ id: search.id }}
      to="/searches/$id"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <StatusRow paused={paused} />
          <h2 className="truncate font-semibold text-[17px] text-navy leading-[22px]">
            {search.name}
          </h2>
          <p className="truncate text-[12px] text-slate leading-4">
            {subline(search)}
          </p>
        </div>
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-mist text-slate">
          <HugeiconsIcon icon={More02Icon} size={14} strokeWidth={2.5} />
        </span>
      </div>
      {paused ? (
        <PausedFooter search={search} stats={stats} />
      ) : (
        <>
          <StatStrip stats={stats} />
          <RunFooter cadenceLabel={cadenceLabel} stats={stats} />
        </>
      )}
    </Link>
  );
}

function StatusRow({ paused }: { paused: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          paused ? "bg-slate-2" : "bg-copper"
        )}
      />
      <span
        className={cn(
          "font-semibold text-[10px] uppercase tracking-[0.14em]",
          paused ? "text-slate-2" : "text-copper"
        )}
      >
        {paused ? "Paused" : "Active"}
      </span>
    </span>
  );
}

function StatStrip({ stats }: { stats: SearchesPerSearchStats | null }) {
  return (
    <div className="flex border-mist border-t pt-3">
      <StatCell
        first
        label="New / wk"
        value={stats ? String(stats.listingsThisWeek) : "—"}
      />
      <StatCell label="In queue" value={stats ? String(stats.inQueue) : "—"} />
      <StatCell
        label="Kept 30d"
        last
        value={stats ? String(stats.keptLast30d) : "—"}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  first,
  last,
}: {
  label: string;
  value: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-0.5",
        first && "border-mist border-r pr-2.5",
        !(first || last) && "border-mist border-r px-2.5",
        last && "pl-2.5"
      )}
    >
      <span className="text-[9px] text-slate uppercase tracking-[0.14em]">
        {label}
      </span>
      <span className="font-medium text-[18px] text-navy leading-[22px]">
        {value}
      </span>
    </div>
  );
}

function RunFooter({
  cadenceLabel,
  stats,
}: {
  cadenceLabel: string | null;
  stats: SearchesPerSearchStats | null;
}) {
  const ran = useRelativeTime(stats?.lastRunAt ?? null);
  return (
    <div className="flex items-center gap-1.5">
      <HugeiconsIcon
        className="shrink-0 text-slate"
        icon={Clock01Icon}
        size={12}
        strokeWidth={1.6}
      />
      <span className="text-[11px] text-slate leading-[14px]">
        {cadenceLabel ?? "On demand"}
        {ran ? ` · ran ${ran}` : ""}
      </span>
    </div>
  );
}

function PausedFooter({
  search,
  stats,
}: {
  search: SearchRow;
  stats: SearchesPerSearchStats | null;
}) {
  const since = useRelativeTime(search.updatedAt);
  const queue = stats?.inQueue ?? 0;
  return (
    <p className="text-[11px] text-slate leading-[14px]">
      {since ? `Paused ${since}` : "Paused"}
      {queue > 0 ? ` · ${queue} in queue` : ""}
    </p>
  );
}

/**
 * Compact relative-time label, deferred to post-mount so SSR and the
 * first client render agree (no hydration drift).
 */
function useRelativeTime(date: Date | null): string {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!(mounted && date)) {
    return "";
  }
  const d = date instanceof Date ? date : new Date(date as unknown as string);
  const minutes = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}hr ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  return `${Math.floor(days / 30)}mo ago`;
}
