/**
 * `/shortlist` — the Shortlist screen.
 *
 * Composes mutual matches (the view's output) with each individual
 * member's keep/shortlist picks. The tab row is parameterised by
 * household size:
 *
 *   1 member  → no tabs; one list (the user's own picks).
 *   2 members → Mutual · Yours · <other>'s
 *   N members → Mutual · Yours · <each other member>'s
 *
 * Mutual tab gets a featured card + "Other mutual picks" list. The
 * other tabs render a single flat list. Sort dropdown switches between
 * cheapest (default) and newest.
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BottomNav } from "../components/layout/bottom-nav";
import { MatchCard, usePlanViewing } from "../components/shortlist/match-card";
import { MatchRow } from "../components/shortlist/match-row";
import {
  SortDropdown,
  type SortKey,
} from "../components/shortlist/sort-dropdown";
import { type ShortlistTab, ShortlistTabs } from "../components/shortlist/tabs";
import { requireSession } from "../lib/auth-guard";
import { useHousehold } from "../lib/household-context";
import { queryKeys } from "../lib/query-keys";
import {
  type MutualMatch,
  listMemberOutcomes,
  listMutualMatches,
  listMyOutcomes,
} from "../server/functions/shortlist";

const mutualQueryOptions = {
  queryKey: queryKeys.shortlistMutual(),
  queryFn: () => listMutualMatches(),
  staleTime: 15_000,
};

const myQueryOptions = {
  queryKey: queryKeys.shortlistMine(),
  queryFn: () => listMyOutcomes({ data: { outcome: "keep_or_shortlist" } }),
  staleTime: 15_000,
};

export const Route = createFileRoute("/shortlist")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/shortlist");
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(mutualQueryOptions),
      context.queryClient.ensureQueryData(myQueryOptions),
    ]),
  component: ShortlistPage,
});

/** Pretty "time ago" — coarse buckets, en-GB. */
function timeAgo(date: Date): string {
  const now = Date.now();
  const ms = now - new Date(date).getTime();
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

const WHITESPACE_RE = /\s+/;

/**
 * First name of a member (best-effort — splits on whitespace). Falls
 * back to the email local-part for users who haven't filled in a name.
 */
function firstNameOf(member: { name: string; email: string }): string {
  const head = (member.name || "").trim().split(WHITESPACE_RE)[0];
  if (head) {
    return head;
  }
  const local = member.email.split("@")[0] ?? "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function ShortlistPage() {
  const navigate = useNavigate();
  const { memberCount, otherMembers, members, currentUserId } = useHousehold();

  const { data: mutual = [] } = useQuery(mutualQueryOptions);
  const { data: mine = [] } = useQuery(myQueryOptions);

  // Per-other-member outcome lists. We use `useQueries` so the number
  // of underlying queries can vary with household composition without
  // tripping React's rules-of-hooks. TanStack Query dedupes shared
  // keys; each response is small.
  const otherMemberResults = useQueries({
    queries: otherMembers.map((m) => ({
      queryKey: queryKeys.shortlistMember(m.userId),
      queryFn: () =>
        listMemberOutcomes({
          data: { memberId: m.userId, outcome: "keep_or_shortlist" as const },
        }),
      staleTime: 15_000,
    })),
  });
  const otherMemberQueries = otherMembers.map((member, idx) => ({
    member,
    query: otherMemberResults[idx],
  }));

  const tabs: ShortlistTab[] = useMemo(() => {
    if (memberCount <= 1) {
      return [];
    }
    const base: ShortlistTab[] = [
      { id: "mutual", label: "Mutual", count: mutual.length },
      { id: "mine", label: "Yours", count: mine.length },
    ];
    for (const { member, query } of otherMemberQueries) {
      base.push({
        id: `member:${member.userId}`,
        label: `${firstNameOf(member)}'s`,
        count: query?.data?.length ?? 0,
      });
    }
    return base;
    // We intentionally re-derive on every render; the inputs are cheap
    // refs. (useMemo is here to stabilise the array identity for child
    // memoisation in the future.)
  }, [memberCount, mutual.length, mine.length, otherMemberQueries]);

  const [activeTab, setActiveTab] = useState<string>("mutual");
  const [sort, setSort] = useState<SortKey>("cheapest");

  const me = members.find((m) => m.userId === currentUserId);
  const headlineOther = otherMembers[0];
  let eyebrow: string | null = null;
  if (memberCount === 2 && headlineOther) {
    eyebrow = `You & ${firstNameOf(headlineOther)}`;
  } else if (memberCount > 2) {
    eyebrow = "Your household";
  }

  // Resolve which list is currently visible.
  const visible = useMemo<MutualMatch[]>(() => {
    if (memberCount <= 1) {
      return sortMatches(mine, sort);
    }
    if (activeTab === "mutual") {
      return sortMatches(mutual, sort);
    }
    if (activeTab === "mine") {
      return sortMatches(mine, sort);
    }
    const m = otherMemberQueries.find(
      (q) => `member:${q.member.userId}` === activeTab
    );
    return sortMatches(m?.query?.data ?? [], sort);
  }, [activeTab, memberCount, mine, mutual, otherMemberQueries, sort]);

  const { toast, planViewing } = usePlanViewing();

  const featured =
    activeTab === "mutual" && memberCount > 1 ? visible[0] : null;
  const rows = featured ? visible.slice(1) : visible;

  function openCluster(clusterId: string) {
    // PR 9 lands `/listings/$clusterId`. Until that route exists in the
    // typed route tree, we go through `href` so the call still works —
    // the cast keeps tsc happy without registering a fake route.
    navigate({
      to: "/listings/$clusterId" as never,
      params: { clusterId } as never,
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-ground pb-24">
      {toast ? (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-ink px-4 py-3 text-bone text-sm shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      <header className="flex flex-col gap-1 px-6 pt-6 pb-5">
        {eyebrow ? (
          <span className="font-semibold text-[11px] text-brass uppercase tracking-[0.12em]">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="font-medium font-serif text-[32px] text-ink leading-[110%] tracking-[-0.03em]">
          Shortlist
        </h1>
      </header>

      <ShortlistTabs activeId={activeTab} onChange={setActiveTab} tabs={tabs} />

      {featured ? (
        <MatchCard
          ageLabel={timeAgo(featured.matchedAt)}
          match={featured}
          memberCount={memberCount}
          onOpen={() => openCluster(featured.clusterId)}
          onPlanViewing={() => planViewing(featured.headline)}
        />
      ) : null}

      <div className="flex items-center justify-between px-6 pb-3">
        <span className="font-semibold text-[10px] text-brass uppercase tracking-[0.12em]">
          {sectionLabelFor(
            activeTab,
            memberCount,
            otherMemberQueries,
            me?.name
          )}
        </span>
        <SortDropdown onChange={setSort} value={sort} />
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-bone p-8 text-center text-brass text-sm">
            Nothing here yet. Keep swiping on the Review screen — picks land
            here as you (and your household) hit Keep.
          </p>
        ) : (
          rows.map((m) => (
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

      {/* Settings link sneaks into the empty-state corner — keeps the
          screen self-contained when there's nothing to look at. */}
      {rows.length === 0 && !featured ? (
        <div className="mt-6 px-6 text-center">
          <Link className="text-copper text-xs" to="/searches">
            Manage your searches →
          </Link>
        </div>
      ) : null}

      <BottomNav />
    </div>
  );
}

function sectionLabelFor(
  activeTab: string,
  memberCount: number,
  otherMemberQueries: Array<{
    member: { userId: string; name: string; email: string };
  }>,
  myName: string | undefined
): string {
  if (memberCount <= 1) {
    return "Your picks";
  }
  if (activeTab === "mutual") {
    return "Other mutual picks";
  }
  if (activeTab === "mine") {
    return myName
      ? `${firstNameOf({ name: myName, email: "" })}'s picks`
      : "Your picks";
  }
  const m = otherMemberQueries.find(
    (q) => `member:${q.member.userId}` === activeTab
  );
  if (m) {
    return `${firstNameOf(m.member)}'s picks`;
  }
  return "Picks";
}
