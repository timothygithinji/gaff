/**
 * `/shortlist` — the Shortlist screen.
 *
 * v2 (pipeline): the "Mutual" tab has been replaced by "Pipeline" —
 * mutually-shortlisted clusters render as a kanban (desktop) or stage-
 * tab list (mobile). The remaining tabs (Yours / per-member) keep the
 * pre-pipeline featured-banner-plus-card-grid layout because they list
 * not-yet-mutual picks — there's no pipeline status to surface there.
 *
 *   1 member  → no tabs; pipeline is the whole screen.
 *   2 members → Pipeline · Yours · <other>'s
 *   N members → Pipeline · Yours · <each other member>'s
 *
 * Card moves and archives flow through `setPipelineStatus`. Notes are
 * a v2.1 add — the schema column exists, but the UI for editing notes
 * isn't wired here yet.
 */
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BottomNav } from "../components/layout/bottom-nav";
import { DesktopShortlist } from "../components/shortlist/desktop-shortlist";
import { MatchCard, usePlanViewing } from "../components/shortlist/match-card";
import { MatchRow } from "../components/shortlist/match-row";
import { PipelineKanban } from "../components/shortlist/pipeline-kanban";
import { PipelineMobile } from "../components/shortlist/pipeline-mobile";
import {
  SortDropdown,
  type SortKey,
} from "../components/shortlist/sort-dropdown";
import { type ShortlistTab, ShortlistTabs } from "../components/shortlist/tabs";
import { requireSession } from "../lib/auth-guard";
import { useHousehold } from "../lib/household-context";
import type {
  PipelineArchivedReason,
  PipelineStatus,
} from "../lib/pipeline-status";
import { queryKeys } from "../lib/query-keys";
import {
  type PipelineColumns,
  listPipeline,
  setPipelineStatus,
} from "../server/functions/pipeline";
import {
  type MutualMatch,
  listMemberOutcomes,
  listMyOutcomes,
  markMatchesSeen,
} from "../server/functions/shortlist";

const pipelineQueryOptions = {
  queryKey: queryKeys.shortlistPipeline(),
  queryFn: () => listPipeline(),
  staleTime: 15_000,
};

const myQueryOptions = {
  queryKey: queryKeys.shortlistMine(),
  queryFn: () => listMyOutcomes({ data: { outcome: "keep_or_shortlist" } }),
  staleTime: 15_000,
};

export const Route = createFileRoute("/shortlist")({
  head: () => ({ meta: [{ title: "Shortlist · Gaff" }] }),
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/shortlist");
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(pipelineQueryOptions),
      context.queryClient.ensureQueryData(myQueryOptions),
    ]),
  component: ShortlistPage,
});

const PIPELINE_TAB_ID = "pipeline";

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

function firstNameOf(member: { name: string; email: string }): string {
  const head = (member.name || "").trim().split(WHITESPACE_RE)[0];
  if (head) {
    return head;
  }
  const local = member.email.split("@")[0] ?? "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function totalPipelineCount(columns: PipelineColumns): number {
  return (
    columns.shortlisted.length +
    columns.contacted.length +
    columns.viewing_booked.length +
    columns.offer_made.length +
    columns.archived.length
  );
}

function ShortlistPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { memberCount, otherMembers, members, currentUserId } = useHousehold();

  const { data: pipeline } = useQuery(pipelineQueryOptions);
  const { data: mine = [] } = useQuery(myQueryOptions);
  const columns: PipelineColumns = pipeline ?? {
    shortlisted: [],
    contacted: [],
    viewing_booked: [],
    offer_made: [],
    archived: [],
  };

  // Clear the unread-matches badge on first paint — the user landed on
  // the screen that supersedes /matches, so anything new is "seen". We
  // fire-and-forget; no consumer cares about the result.
  useState(() => {
    markMatchesSeen().catch(() => {
      // ignore; the badge will still clear on next refresh
    });
    return null;
  });

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
      {
        id: PIPELINE_TAB_ID,
        label: "Pipeline",
        count: totalPipelineCount(columns),
      },
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
  }, [columns, memberCount, mine.length, otherMemberQueries]);

  const [activeTab, setActiveTab] = useState<string>(PIPELINE_TAB_ID);
  const [sort, setSort] = useState<SortKey>("cheapest");
  const [pendingMove, setPendingMove] = useState<{
    clusterId: string;
    to: PipelineStatus;
  } | null>(null);

  const me = members.find((m) => m.userId === currentUserId);

  // Mutation: move a card to a different stage (or archive with reason).
  const moveMutation = useMutation({
    mutationFn: (input: {
      clusterId: string;
      to: PipelineStatus;
      archivedReason?: PipelineArchivedReason;
    }) =>
      setPipelineStatus({
        data: {
          clusterId: input.clusterId,
          status: input.to,
          ...(input.archivedReason
            ? { archivedReason: input.archivedReason }
            : {}),
        },
      }),
    onMutate: (input) => {
      setPendingMove({ clusterId: input.clusterId, to: input.to });
    },
    onSettled: () => {
      setPendingMove(null);
      qc.invalidateQueries({ queryKey: queryKeys.shortlistPipeline() });
    },
  });

  // Non-pipeline tabs (Yours / Per-member) keep the legacy list view.
  const visibleMatches = useMemo<MutualMatch[]>(() => {
    if (memberCount <= 1) {
      return [];
    }
    if (activeTab === "mine") {
      return sortMatches(mine, sort);
    }
    const m = otherMemberQueries.find(
      (q) => `member:${q.member.userId}` === activeTab
    );
    return sortMatches(m?.query?.data ?? [], sort);
  }, [activeTab, memberCount, mine, otherMemberQueries, sort]);

  const { toast, planViewing } = usePlanViewing();

  function openCluster(clusterId: string) {
    navigate({
      to: "/listings/$clusterId",
      params: { clusterId },
      search: { from: "shortlist" },
    });
  }

  const otherForLabel = otherMembers[0];
  const partnerLabel = otherForLabel ? firstNameOf(otherForLabel) : null;
  const isPipeline = activeTab === PIPELINE_TAB_ID || memberCount <= 1;
  const sectionLabel = sectionLabelFor(
    activeTab,
    memberCount,
    otherMemberQueries,
    me?.name
  );

  const pipelineKanban = (
    <PipelineKanban
      columns={columns}
      disabled={moveMutation.isPending}
      onArchive={(clusterId, reason) =>
        moveMutation.mutate({
          clusterId,
          to: "archived",
          archivedReason: reason,
        })
      }
      onMove={(clusterId, to) => moveMutation.mutate({ clusterId, to })}
      onOpenCluster={openCluster}
    />
  );

  return (
    <>
      <DesktopShortlist
        activeTab={activeTab}
        bodySlot={isPipeline ? pipelineKanban : undefined}
        featured={visibleMatches[0] ?? null}
        featuredAgeLabel={visibleMatches[0] ? timeAgo(visibleMatches[0].matchedAt) : ""}
        memberCount={memberCount}
        onOpen={(clusterId) => openCluster(clusterId)}
        onPlanViewing={(m) => planViewing(m.headline)}
        onSortChange={setSort}
        onTabChange={setActiveTab}
        partnerLabel={partnerLabel}
        rowAgeLabel={(m) => timeAgo(m.matchedAt)}
        rows={visibleMatches[0] ? visibleMatches.slice(1) : visibleMatches}
        sectionLabel={sectionLabel}
        shortlistedCount={totalPipelineCount(columns)}
        sortKey={sort}
        tabs={tabs}
      />

      <div className="mx-auto min-h-screen max-w-md bg-background pb-24 sm:max-w-2xl lg:hidden">
        {toast ? (
          <div
            aria-live="polite"
            className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-foreground px-4 py-3 text-primary-foreground text-sm shadow-lg"
          >
            {toast}
          </div>
        ) : null}

        <header className="flex flex-col gap-1 px-5 pt-6 pb-4.5">
          {partnerLabel ? (
            <span className="text-[11px] text-slate uppercase leading-[14px] tracking-[0.14em]">
              You &amp; {partnerLabel}
            </span>
          ) : null}
          <h1 className="font-semibold text-[26px] text-navy leading-8 tracking-[-0.02em]">
            Shortlist
          </h1>
        </header>

        {memberCount > 1 ? (
          <ShortlistTabs
            activeId={activeTab}
            onChange={setActiveTab}
            tabs={tabs}
          />
        ) : null}

        {isPipeline ? (
          <PipelineMobile
            columns={columns}
            disabled={moveMutation.isPending}
            memberCount={memberCount}
            onArchive={(clusterId, reason) =>
              moveMutation.mutate({
                clusterId,
                to: "archived",
                archivedReason: reason,
              })
            }
            onMove={(clusterId, to) => moveMutation.mutate({ clusterId, to })}
            onOpenCluster={openCluster}
            pendingMove={pendingMove}
          />
        ) : (
          <MemberOutcomesMobile
            matches={visibleMatches}
            memberCount={memberCount}
            onOpen={openCluster}
            onPlanViewing={(m) => planViewing(m.headline)}
            onSortChange={setSort}
            sectionLabel={sectionLabel}
            sort={sort}
          />
        )}

        {/* Empty pipeline: nudge toward searches (PipelineMobile renders
            its own empty copy, so this only adds the action). */}
        {isPipeline && totalPipelineCount(columns) === 0 ? (
          <div className="mt-4 px-6 text-center">
            <Link className="text-[13px] text-copper" to="/searches">
              Manage your searches →
            </Link>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </>
  );
}

function MemberOutcomesMobile({
  matches,
  memberCount,
  sectionLabel,
  sort,
  onSortChange,
  onOpen,
  onPlanViewing,
}: {
  matches: MutualMatch[];
  memberCount: number;
  sectionLabel: string;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  onOpen: (clusterId: string) => void;
  onPlanViewing: (m: MutualMatch) => void;
}) {
  const featured = matches[0] ?? null;
  const rows = featured ? matches.slice(1) : matches;
  return (
    <div className="flex flex-col">
      {featured ? (
        <MatchCard
          ageLabel={timeAgo(featured.matchedAt)}
          match={featured}
          memberCount={memberCount}
          onOpen={() => onOpen(featured.clusterId)}
          onPlanViewing={() => onPlanViewing(featured)}
        />
      ) : null}
      <div className="flex items-center justify-between px-6 pb-3">
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          {sectionLabel}
        </span>
        <SortDropdown onChange={onSortChange} value={sort} />
      </div>
      <div className="flex flex-col gap-2.5 px-4">
        {rows.length === 0 && !featured ? (
          <p className="rounded-2xl bg-muted p-8 text-center text-muted-foreground text-sm">
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
              onOpen={() => onOpen(m.clusterId)}
            />
          ))
        )}
      </div>
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
