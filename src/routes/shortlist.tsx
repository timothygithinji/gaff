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
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueries,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminSidebar } from "../components/layout/admin-sidebar";
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
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { skeletonIds } from "../components/ui/patterns/skeletons";
import { Skeleton } from "../components/ui/skeleton";
import { requireSession } from "../lib/auth-guard";
import { useHousehold } from "../lib/household-context";
import { listingDetailQueryOptions } from "../lib/listing-detail-query";
import {
  PIPELINE_STATUSES,
  type PipelineArchivedReason,
  type PipelineStatus,
} from "../lib/pipeline-status";
import { queryKeys } from "../lib/query-keys";
import {
  type PipelineCard,
  type PipelineColumns,
  type PipelineLastMovedBy,
  addListingByUrl,
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
  pendingComponent: PendingShortlist,
  component: ShortlistPage,
});

/** Per-column card counts for the loading frame — staggered so the board
 * reads naturally rather than as a uniform grid. */
const PENDING_COLUMNS = [
  { key: "shortlisted", count: 3 },
  { key: "contacted", count: 2 },
  { key: "viewing_booked", count: 2 },
  { key: "offer_made", count: 1 },
];

/**
 * Loading frame — mirrors the live Shortlist: the desktop header
 * (eyebrow + title + square tab strip), the "Add a listing" button, and
 * the four-column kanban of compact cards; the mobile header + stage-tab
 * strip + stacked card list.
 */
function PendingShortlist() {
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <header className="flex items-end justify-between gap-4 px-10 pt-7 pb-4.5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-10 w-44" />
          </div>
          <div className="flex gap-1.5">
            {skeletonIds("tab", 4).map((id) => (
              <Skeleton className="h-9 w-20 rounded-md" key={id} />
            ))}
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-10 pt-2 pb-6">
          <Skeleton className="h-9 w-32 rounded-md" />
          <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
            {PENDING_COLUMNS.map((col) => (
              <div
                className="flex w-[280px] shrink-0 flex-col gap-2.5"
                key={col.key}
              >
                <div className="flex items-center gap-2 pb-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="size-5 rounded-full" />
                </div>
                {skeletonIds(col.key, col.count).map((id) => (
                  <KanbanCardSkeleton key={id} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </AdminSidebar>

      <div className="mx-auto min-h-screen max-w-md bg-background px-5 pb-24 sm:max-w-2xl lg:hidden">
        <header className="flex flex-col gap-2 pt-6 pb-4.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-40" />
        </header>
        <Skeleton className="mb-4 h-9 w-full rounded-md" />
        <div className="mb-4 flex gap-2">
          {skeletonIds("mtab", 4).map((id) => (
            <Skeleton className="h-7 w-20 rounded-full" key={id} />
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          {skeletonIds("mcard", 4).map((id) => (
            <KanbanCardSkeleton key={id} />
          ))}
        </div>
        <BottomNav />
      </div>
    </>
  );
}

/** Compact pipeline card skeleton — small thumbnail + two text lines,
 * matching the kanban's resting (compact) card. */
function KanbanCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-card px-3.5 py-3">
      <Skeleton className="size-12 shrink-0 rounded-sm" />
      <div className="flex min-w-0 grow flex-col gap-1.5 pt-0.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

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

/**
 * Pure, optimistic version of a pipeline move: pull the card out of
 * whichever column currently holds it and drop it into `to`, stamping
 * the new status / reason / mover so the kanban repaints on the next
 * frame instead of waiting for the server round-trip + refetch. The
 * authoritative ordering lands on the `onSettled` invalidate. Returns
 * the input untouched when the card isn't found (nothing to move).
 */
function moveCardOptimistically(
  columns: PipelineColumns,
  clusterId: string,
  to: PipelineStatus,
  archivedReason: PipelineArchivedReason | undefined,
  movedBy: PipelineLastMovedBy
): PipelineColumns {
  let moving: PipelineCard | undefined;
  const next: PipelineColumns = {
    shortlisted: [],
    contacted: [],
    viewing_booked: [],
    offer_made: [],
    archived: [],
  };
  for (const status of PIPELINE_STATUSES) {
    for (const card of columns[status]) {
      if (card.clusterId === clusterId) {
        moving = card;
      } else {
        next[status].push(card);
      }
    }
  }
  if (!moving) {
    return columns;
  }
  // Freshly-moved card is the newest in its column — prepend so it reads
  // at the top until the refetch confirms the server's ordering.
  next[to].unshift({
    ...moving,
    status: to,
    archivedReason: to === "archived" ? (archivedReason ?? null) : null,
    lastMovedAt: new Date(),
    lastMovedBy: movedBy,
  });
  return next;
}

function ShortlistPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { memberCount, otherMembers, members, currentUserId } = useHousehold();

  // Loader prefetches both via `ensureQueryData`; the pendingComponent owns
  // the loading frame, so these are always populated here.
  const { data: columns } = useSuspenseQuery(pipelineQueryOptions);
  const { data: mine } = useSuspenseQuery(myQueryOptions);

  // Clear the unread-matches badge on first paint — the user landed on
  // the screen that supersedes /matches, so anything new is "seen". On
  // success we invalidate the badge query so the bottom-nav / sidebar
  // count clears on the action, not just when its staleTime lapses.
  useState(() => {
    markMatchesSeen()
      .then(() => {
        qc.invalidateQueries({ queryKey: queryKeys.matchesUnread() });
      })
      .catch(() => {
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
  const [addUrlValue, setAddUrlValue] = useState("");
  const [addUrlError, setAddUrlError] = useState<string | null>(null);
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    clusterId: string;
    to: PipelineStatus;
  } | null>(null);

  const me = members.find((m) => m.userId === currentUserId);

  // Mutation: move a card to a different stage (or archive with reason).
  // Optimistic — mirrors the Review screen's swipe: snapshot the board,
  // move the card in-cache so the kanban repaints immediately, roll back
  // on error, then invalidate the whole shortlist family on settle (the
  // move can also shift the "Yours" / per-member tabs).
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
    onMutate: async (input) => {
      setMoveError(null);
      setPendingMove({ clusterId: input.clusterId, to: input.to });
      await qc.cancelQueries({ queryKey: queryKeys.shortlist() });
      const previous = qc.getQueryData<PipelineColumns>(
        queryKeys.shortlistPipeline()
      );
      if (previous) {
        const movedBy: PipelineLastMovedBy = me
          ? { userId: me.userId, name: me.name }
          : null;
        qc.setQueryData<PipelineColumns>(
          queryKeys.shortlistPipeline(),
          moveCardOptimistically(
            previous,
            input.clusterId,
            input.to,
            input.archivedReason,
            movedBy
          )
        );
      }
      return { previous };
    },
    onError: (e: Error, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKeys.shortlistPipeline(), ctx.previous);
      }
      setMoveError(e.message ?? "Couldn't move that card. Try again.");
    },
    onSettled: () => {
      setPendingMove(null);
      qc.invalidateQueries({ queryKey: queryKeys.shortlist() });
    },
  });

  // Add a listing to the pipeline by pasting its URL. Lands in
  // Shortlisted; dedupes against listings we already have.
  const addUrlMutation = useMutation({
    mutationFn: (url: string) => addListingByUrl({ data: { url } }),
    onSuccess: () => {
      setAddUrlError(null);
      setAddUrlValue("");
      setAddUrlOpen(false);
      setActiveTab(PIPELINE_TAB_ID);
      qc.invalidateQueries({ queryKey: queryKeys.shortlist() });
    },
    onError: (e: Error) => {
      setAddUrlError(
        e.message === "invalid_listing_url"
          ? "That's not a Rightmove, Zoopla or OpenRent listing URL."
          : (e.message ?? "Couldn't add that listing.")
      );
    },
  });

  const addByUrl = (
    <AddByUrlForm
      error={addUrlError}
      onChange={(v) => {
        setAddUrlValue(v);
        if (addUrlError) {
          setAddUrlError(null);
        }
      }}
      onOpenChange={(next) => {
        setAddUrlOpen(next);
        if (!next) {
          // Reset the field + error when the modal is dismissed so the
          // next open starts clean.
          setAddUrlValue("");
          setAddUrlError(null);
        }
      }}
      onSubmit={() => {
        const url = addUrlValue.trim();
        if (url) {
          addUrlMutation.mutate(url);
        }
      }}
      open={addUrlOpen}
      pending={addUrlMutation.isPending}
      value={addUrlValue}
    />
  );

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

  // Cards navigate to detail imperatively (no `<Link>`), so the router's
  // intent-preload never fires. Warm the detail payload on hover/focus
  // so the click that follows is instant.
  function prefetchCluster(clusterId: string) {
    qc.prefetchQuery(listingDetailQueryOptions(clusterId));
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 px-1">{addByUrl}</div>
      <PipelineKanban
        columns={columns}
        onArchive={(clusterId, reason) =>
          moveMutation.mutate({
            clusterId,
            to: "archived",
            archivedReason: reason,
          })
        }
        onHoverCluster={prefetchCluster}
        onMove={(clusterId, to) => moveMutation.mutate({ clusterId, to })}
        onOpenCluster={openCluster}
      />
    </div>
  );

  return (
    <>
      {moveError ? (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-foreground px-4 py-3 text-primary-foreground text-sm shadow-lg"
        >
          {moveError}
        </div>
      ) : null}

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

        {isPipeline ? <div className="px-4 pb-3">{addByUrl}</div> : null}

        {isPipeline ? (
          <PipelineMobile
            columns={columns}
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

/**
 * "Add a listing" — a trigger button that opens a modal. Paste a
 * Rightmove/Zoopla/OpenRent listing URL → scrapes it and drops it
 * straight into Shortlisted. The parent owns the field/error/pending
 * state and the open flag so the mutation's `onSuccess` can close it.
 */
function AddByUrlForm({
  value,
  error,
  pending,
  open,
  onChange,
  onOpenChange,
  onSubmit,
}: {
  value: string;
  error: string | null;
  pending: boolean;
  open: boolean;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button className="gap-2" variant="outline">
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
            Add a listing
          </Button>
        }
      />
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-navy">Add a listing</DialogTitle>
            <DialogDescription>
              Paste a Rightmove, Zoopla or OpenRent listing URL — we'll scrape
              it and drop it straight into your pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <input
              aria-label="Listing URL"
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              inputMode="url"
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://www.rightmove.co.uk/properties/…"
              type="url"
              value={value}
            />
            {error ? (
              <p className="text-[12px] text-destructive">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              }
            />
            <Button
              disabled={value.trim().length === 0}
              loading={pending}
              loadingText="Adding…"
              type="submit"
            >
              Add to pipeline
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
