/**
 * `/matches` — the Matches screen.
 *
 * Same data feed as the Shortlist's "Mutual" tab. This route exists as
 * a dedicated destination so the bottom nav has a place to land when
 * the unread-matches badge is tapped — `/shortlist` may default to
 * "Yours" if the user has more saved than mutual, while `/matches` is
 * unambiguous.
 *
 * On mount we call `markMatchesSeen` to clear the badge.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BottomNav } from "../components/layout/bottom-nav";
import { MatchRow } from "../components/shortlist/match-row";
import {
  SortDropdown,
  type SortKey,
} from "../components/shortlist/sort-dropdown";
import { requireSession } from "../lib/auth-guard";
import { useHousehold } from "../lib/household-context";
import { queryKeys } from "../lib/query-keys";
import {
  type MutualMatch,
  listMutualMatches,
  markMatchesSeen,
} from "../server/functions/shortlist";

const mutualQueryOptions = {
  queryKey: queryKeys.shortlistMutual(),
  queryFn: () => listMutualMatches(),
  staleTime: 15_000,
};

export const Route = createFileRoute("/matches")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/matches");
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(mutualQueryOptions),
  component: MatchesPage,
});

function timeAgo(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  return new Date(date).toLocaleDateString("en-GB");
}

function sortMatches(matches: MutualMatch[], by: SortKey): MutualMatch[] {
  const copy = [...matches];
  if (by === "cheapest") {
    copy.sort((a, b) => {
      const ap = a.headline.priceMonthly ?? Number.POSITIVE_INFINITY;
      const bp = b.headline.priceMonthly ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    });
  } else {
    copy.sort(
      (a, b) =>
        new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime()
    );
  }
  return copy;
}

function MatchesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { memberCount } = useHousehold();
  const { data = [] } = useQuery(mutualQueryOptions);
  const [sort, setSort] = useState<SortKey>("newest");

  // Clear the unread badge when the user lands here. Optimistic: drop
  // the badge to zero immediately so the bottom-nav re-paints without
  // a round-trip; on error restore whatever the server had; on settled
  // re-fetch to reconcile.
  const seen = useMutation({
    mutationFn: () => markMatchesSeen(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.matchesUnread() });
      const prev = qc.getQueryData<{ count: number }>(
        queryKeys.matchesUnread()
      );
      qc.setQueryData<{ count: number }>(queryKeys.matchesUnread(), {
        count: 0,
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.matchesUnread(), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.matchesUnread() });
    },
  });

  // A ref-gated effect — fires exactly once per route mount, regardless
  // of React 18 StrictMode double-invokes. We deliberately keep `seen`
  // out of the dependency array because the mutation object identity
  // changes every render; the ref guarantees we don't re-fire.
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) {
      return;
    }
    firedRef.current = true;
    seenRef.current.mutate();
  }, []);

  const visible = sortMatches(data, sort);

  function openCluster(clusterId: string) {
    // PR 9 lands `/listings/$clusterId` — until then we navigate via a
    // cast so the route tree can stay untouched.
    navigate({
      to: "/listings/$clusterId" as never,
      params: { clusterId } as never,
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="flex flex-col gap-1 px-6 pt-6 pb-5">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
          Your household
        </span>
        <h1 className="font-medium font-serif text-[32px] text-foreground leading-[110%] tracking-[-0.03em]">
          Matches
        </h1>
      </header>

      <div className="flex items-center justify-between px-6 pb-3">
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          Mutual picks
        </span>
        <SortDropdown onChange={setSort} value={sort} />
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        {visible.length === 0 ? (
          <p className="rounded-2xl bg-muted p-8 text-center text-muted-foreground text-sm">
            No mutual matches yet. Once every household member keeps the same
            cluster, it lands here.
          </p>
        ) : (
          visible.map((m) => (
            <MatchRow
              ageLabel={timeAgo(m.matchedAt)}
              key={`${m.clusterId}:${m.searchId}`}
              match={m}
              memberCount={memberCount}
              onOpen={() => openCluster(m.clusterId)}
            />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
