/**
 * `/searches` — the current household's saved searches.
 *
 * Each search renders as a card mirroring the editorial card style
 * used elsewhere (serif title, brass body text, copper accents). The
 * "New search" CTA in the top-right opens the full-screen create flow.
 */
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { Search } from "../../../db/schema";
import { TopBar } from "../../components/layout/top-bar";
import { listSearches } from "../../server/functions/searches";

const searchesQueryOptions = {
  queryKey: ["searches"] as const,
  queryFn: () => listSearches(),
  staleTime: 30_000,
};

export const Route = createFileRoute("/searches/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(searchesQueryOptions),
  component: SearchesIndexPage,
});

function SearchesIndexPage() {
  const { data } = useSuspenseQuery(searchesQueryOptions);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-ground pb-24">
      <TopBar title="Searches" />
      <main className="space-y-4 px-5 pt-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-3xl text-ink">Your searches</h1>
          <Link
            className="rounded-full bg-copper px-4 py-2 font-medium text-bone text-xs"
            to="/searches/new"
          >
            + New
          </Link>
        </div>

        {data.length === 0 ? <EmptyState /> : <SearchList searches={data} />}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 rounded-2xl bg-bone p-8 text-center">
      <p className="font-serif text-2xl text-ink">No searches yet</p>
      <p className="mt-2 text-brass text-sm">
        Start watching a corner of the rental market. Pick your outcodes, beds,
        and budget — we'll tell you what's worth a viewing.
      </p>
      <Link
        className="mt-6 inline-block rounded-full bg-copper px-6 py-3 font-medium text-bone text-sm"
        to="/searches/new"
      >
        Create your first search
      </Link>
    </div>
  );
}

function SearchList({ searches }: { searches: Search[] }) {
  return (
    <ul className="space-y-3">
      {searches.map((s) => (
        <li key={s.id}>
          <Link
            className="block rounded-2xl bg-bone p-5"
            params={{ id: s.id }}
            to="/searches/$id"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-ink text-xl">{s.name}</h2>
              {s.active ? (
                <span className="rounded-full bg-copper/15 px-2 py-0.5 text-[10px] text-copper uppercase tracking-wide">
                  Active
                </span>
              ) : (
                <span className="rounded-full bg-brass/15 px-2 py-0.5 text-[10px] text-brass uppercase tracking-wide">
                  Paused
                </span>
              )}
            </div>
            <p className="mt-1 text-brass text-sm">
              {s.outcodes.join(" · ")} · £{(s.minPrice ?? 0).toLocaleString()}–£
              {(s.maxPrice ?? 0).toLocaleString()}
            </p>
            <p className="mt-2 text-brass text-xs">{s.portals.join(", ")}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
