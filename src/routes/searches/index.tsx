/**
 * `/searches` — the current household's saved searches.
 *
 * Each search renders as a card mirroring the editorial card style
 * used elsewhere (serif title, brass body text, copper accents). The
 * "New search" CTA in the top-right opens the full-screen create flow.
 */
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ScheduleObject } from "@trigger.dev/core/v3";
import { BottomNav } from "../../components/layout/bottom-nav";
import { DesktopSearches } from "../../components/searches/desktop-searches";
import { Button } from "../../components/ui/button";
import { requireSession } from "../../lib/auth-guard";
import { findCadenceByCron } from "../../lib/cron-presets";
import { queryKeys } from "../../lib/query-keys";
import { listSchedules } from "../../server/functions/schedules";
import {
  type SearchRow,
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

  return (
    <>
      <DesktopSearches
        cadenceBySearch={cadenceBySearch}
        portfolio={portfolio}
        searches={data}
      />

      <div className="mx-auto min-h-screen max-w-md bg-background pb-28 md:hidden">
        <header className="flex flex-col gap-1 px-6 pt-6 pb-5">
          <h1 className="font-medium font-serif text-[32px] text-foreground leading-[110%] tracking-[-0.03em]">
            Searches
          </h1>
        </header>

        <div className="flex items-center justify-between px-6 pb-3">
          <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            {data.length === 0
              ? "No searches yet"
              : `${data.length} search${data.length === 1 ? "" : "es"}`}
          </span>
          <Button
            className="rounded-full"
            render={<Link to="/searches/new" />}
            size="sm"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
            New
          </Button>
        </div>

        <main className="space-y-4 px-4">
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
    <div className="mt-12 rounded-2xl bg-muted p-8 text-center">
      <p className="font-serif text-2xl text-foreground">No searches yet</p>
      <p className="mt-2 text-muted-foreground text-sm">
        Start watching a corner of the rental market. Pick your outcodes, beds,
        and budget — we'll tell you what's worth a viewing.
      </p>
      <Link
        className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground text-sm"
        to="/searches/new"
      >
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
  const statsBySearch = new Map(
    portfolio.perSearch.map((s) => [s.searchId, s])
  );
  return (
    <ul className="space-y-3">
      {searches.map((s) => {
        const stats = statsBySearch.get(s.id);
        const cadence = cadenceBySearch.get(s.id);
        return (
          <li key={s.id}>
            <Link
              className="block rounded-2xl bg-muted p-5"
              params={{ id: s.id }}
              to="/searches/$id"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-foreground text-xl">{s.name}</h2>
                {s.active ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary uppercase tracking-wide">
                    {cadence ? `Active · ${cadence}` : "Active"}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                    Paused
                  </span>
                )}
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {s.outcodes.join(" · ")} · £{(s.minPrice ?? 0).toLocaleString()}
                –£
                {(s.maxPrice ?? 0).toLocaleString()}
              </p>
              <p className="mt-2 text-muted-foreground text-xs">
                {s.portals.join(", ")}
              </p>
              {stats ? (
                <div className="mt-3 flex items-center gap-4 border-border border-t pt-3 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-semibold text-foreground">
                      {stats.listingsThisWeek}
                    </span>{" "}
                    new · wk
                  </span>
                  <span>
                    <span className="font-semibold text-primary">
                      {stats.inQueue}
                    </span>{" "}
                    in queue
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">
                      {stats.keptLast30d}
                    </span>{" "}
                    kept · 30d
                  </span>
                  {stats.lastRunAt ? (
                    <span className="ml-auto">
                      {relativeShortMobile(stats.lastRunAt)} ago
                    </span>
                  ) : null}
                </div>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function relativeShortMobile(date: Date): string {
  const d = date instanceof Date ? date : new Date(date as unknown as string);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}
