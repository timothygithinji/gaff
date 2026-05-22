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
import { BottomNav } from "../../components/layout/bottom-nav";
import { Button } from "../../components/ui/button";
import { requireSession } from "../../lib/auth-guard";
import { queryKeys } from "../../lib/query-keys";
import { type SearchRow, listSearches } from "../../server/functions/searches";

const searchesQueryOptions = {
  queryKey: queryKeys.searches(),
  queryFn: () => listSearches(),
  staleTime: 30_000,
};

export const Route = createFileRoute("/searches/")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/searches");
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(searchesQueryOptions),
  component: SearchesIndexPage,
});

function SearchesIndexPage() {
  const { data } = useSuspenseQuery(searchesQueryOptions);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-28">
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
        {data.length === 0 ? <EmptyState /> : <SearchList searches={data} />}
      </main>
      <BottomNav />
    </div>
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

function SearchList({ searches }: { searches: SearchRow[] }) {
  return (
    <ul className="space-y-3">
      {searches.map((s) => (
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
                  Active
                </span>
              ) : (
                <span className="rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                  Paused
                </span>
              )}
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {s.outcodes.join(" · ")} · £{(s.minPrice ?? 0).toLocaleString()}–£
              {(s.maxPrice ?? 0).toLocaleString()}
            </p>
            <p className="mt-2 text-muted-foreground text-xs">
              {s.portals.join(", ")}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
