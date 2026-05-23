/**
 * `/` — the Review screen. The primary "swipe" verb.
 *
 * Loader pre-fetches the first card so SSR paints a real listing rather
 * than a skeleton on first frame. Three mutations:
 *
 *   - recordSwipe  (keep / skip / shortlist)
 *   - undoLastSwipe
 *   - (no separate "next" mutation — recordSwipe + invalidate handles it)
 *
 * Optimistic UX:
 *   - On `recordSwipe.onMutate`, we snapshot the current card and write
 *     `undefined` to the query cache so the next paint shows whatever
 *     the server hands back when we re-fetch. On error we restore the
 *     snapshot and surface a toast-style banner.
 *   - On `undoLastSwipe`, same shape — snapshot, optimistically wipe,
 *     re-fetch.
 *
 * The bottom nav + the household provider already handle the
 * member-count-aware UX (Matches tab visibility) — the Review screen
 * itself doesn't care how many members the household has.
 */
import { useHotkey } from "@tanstack/react-hotkeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { AdminSidebar } from "../components/layout/admin-sidebar";
import { BottomNav } from "../components/layout/bottom-nav";
import { ActionButtons } from "../components/review/action-buttons";
import {
  DesktopReview,
  type DesktopReviewData,
} from "../components/review/desktop-review";
import { ReviewCardView } from "../components/review/review-card";
import { ReviewEmpty } from "../components/review/review-empty";
import { ReviewHeader } from "../components/review/review-header";
import { Skeleton } from "../components/ui/skeleton";
import { useIsMobile } from "../hooks/use-mobile";
import { requireSession } from "../lib/auth-guard";
import { queryKeys } from "../lib/query-keys";
import {
  type ReviewCard,
  type ReviewQueue,
  type ReviewQueueItem,
  type TodayReviewStats,
  getNextReviewCard,
  getReviewQueue,
  getTodayReviewStats,
  recordSwipe,
  undoLastSwipe,
} from "../server/functions/review";
import { listSearches, readAiRules } from "../server/functions/searches";

type SwipeOutcome = "keep" | "skip" | "shortlist";
type PendingAction = SwipeOutcome | "undo" | null;

// `searchId` filter and the explicit `clusterId` selection both live
// in the URL so refresh + back-button preserve them and the filter is
// shareable. Empty / omitted both collapse to `null` so the queue
// isn't accidentally scoped to a stale id.
const reviewSearchSchema = z.object({
  searchId: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  /**
   * When set, the hero/center column is pinned to this cluster instead
   * of the top of the queue. Cleared automatically on swipe/undo so the
   * next card surfaces.
   */
  clusterId: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
});

const reviewCardQueryOptions = (
  searchId: string | null,
  clusterId: string | null
) =>
  ({
    queryKey: queryKeys.reviewNext(searchId, clusterId),
    queryFn: () => {
      const input =
        searchId || clusterId
          ? {
              data: {
                ...(searchId ? { searchId } : {}),
                ...(clusterId ? { clusterId } : {}),
              },
            }
          : undefined;
      return getNextReviewCard(input);
    },
    // Always re-fetch on focus — a household member swiping on another
    // device can change what's at the top of our queue.
    staleTime: 0,
  }) as const;

const reviewQueueQueryOptions = (searchId: string | null) =>
  ({
    queryKey: queryKeys.reviewQueue(searchId),
    queryFn: () =>
      getReviewQueue(searchId ? { data: { searchId } } : undefined),
    staleTime: 0,
  }) as const;

const reviewTodayStatsQueryOptions = (searchId: string | null) =>
  ({
    queryKey: queryKeys.reviewTodayStats(searchId),
    queryFn: () =>
      getTodayReviewStats(searchId ? { data: { searchId } } : undefined),
    staleTime: 0,
  }) as const;

const reviewSearchesQueryOptions = {
  queryKey: queryKeys.searches(),
  queryFn: () => listSearches(),
  staleTime: 60_000,
};

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Review · Gaff" }] }),
  validateSearch: reviewSearchSchema,
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/");
  },
  loaderDeps: ({ search }) => ({
    searchId: search.searchId,
    clusterId: search.clusterId,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        reviewCardQueryOptions(deps.searchId, deps.clusterId)
      ),
      context.queryClient.ensureQueryData(
        reviewQueueQueryOptions(deps.searchId)
      ),
      context.queryClient.ensureQueryData(
        reviewTodayStatsQueryOptions(deps.searchId)
      ),
      context.queryClient.ensureQueryData(reviewSearchesQueryOptions),
    ]),
  component: ReviewPage,
});

function ReviewPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { searchId, clusterId } = Route.useSearch();
  const cardOpts = reviewCardQueryOptions(searchId, clusterId);
  const queueOpts = reviewQueueQueryOptions(searchId);
  const todayOpts = reviewTodayStatsQueryOptions(searchId);
  const cardQuery = useQuery(cardOpts);
  const queueQuery = useQuery(queueOpts);
  const todayStatsQuery = useQuery(todayOpts);
  const searchesQuery = useQuery(reviewSearchesQueryOptions);
  const card = cardQuery.data;
  const queue = queueQuery.data;
  const todayStats = todayStatsQuery.data;
  const searchesList = searchesQuery.data ?? [];
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  // Surface the first query error we see so silent failures stop
  // masquerading as "empty queue" via the placeholder fallback.
  const queryError =
    cardQuery.error?.message ??
    queueQuery.error?.message ??
    todayStatsQuery.error?.message ??
    null;

  // Prefetch the next card so swipes feel instant. After the current
  // card + queue settle, prefetch the queue's next item's ReviewCard
  // and stash it on its clusterId-pinned key — `onMutate` looks for it
  // there and plugs it into the active query key to skip the network.
  useEffect(() => {
    if (!card || !queue) {
      return;
    }
    const idx = queue.items.findIndex((i) => i.clusterId === card.cluster.id);
    const nextItem =
      idx >= 0
        ? queue.items[idx + 1]
        : queue.items.find((i) => i.clusterId !== card.cluster.id);
    if (!nextItem) {
      return;
    }
    qc.prefetchQuery(reviewCardQueryOptions(searchId, nextItem.clusterId));
  }, [card, queue, searchId, qc]);

  const swipe = useMutation({
    mutationFn: (args: {
      clusterId: string;
      searchId: string;
      outcome: SwipeOutcome;
    }) => recordSwipe({ data: args }),
    // Optimistic swipe:
    //   - Drop the swiped cluster out of the queue rail.
    //   - Bump today's stats counter so the header strip moves.
    //   - If we've already prefetched the next card, swap to it now so
    //     the hero updates without a network round-trip. If not, keep
    //     the current card visible while the mutation lands — better
    //     than flashing the "all caught up" empty state mid-swipe.
    onMutate: async (args) => {
      setPendingAction(args.outcome);
      await Promise.all([
        qc.cancelQueries({ queryKey: ["review", "next"] }),
        qc.cancelQueries({ queryKey: ["review", "queue"] }),
        qc.cancelQueries({ queryKey: ["review", "today-stats"] }),
      ]);

      const previousCard = qc.getQueryData<ReviewCard | null>(
        cardOpts.queryKey
      );
      const previousQueue = qc.getQueryData<ReviewQueue | null>(
        queueOpts.queryKey
      );
      const previousStats = qc.getQueryData<TodayReviewStats | null>(
        todayOpts.queryKey
      );

      const nextItem = applyOptimisticQueueDrop(
        qc,
        queueOpts.queryKey,
        previousQueue,
        args.clusterId
      );
      applyOptimisticStatsBump(
        qc,
        todayOpts.queryKey,
        previousStats,
        args.outcome
      );
      applyOptimisticCardSwap(
        qc,
        cardOpts.queryKey,
        searchId,
        nextItem,
        previousQueue
      );

      return { previousCard, previousQueue, previousStats };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previousCard !== undefined) {
        qc.setQueryData<ReviewCard | null>(cardOpts.queryKey, ctx.previousCard);
      }
      if (ctx?.previousQueue !== undefined) {
        qc.setQueryData<ReviewQueue | null>(
          queueOpts.queryKey,
          ctx.previousQueue
        );
      }
      if (ctx?.previousStats !== undefined) {
        qc.setQueryData<TodayReviewStats | null>(
          todayOpts.queryKey,
          ctx.previousStats
        );
      }
      setError(e.message ?? "Couldn't record swipe");
    },
    onSettled: () => {
      setPendingAction(null);
      // Invalidate every variant of the review queries (every searchId
      // bucket) so the next-card pointer and queue refresh regardless
      // of which filter is active — a swipe inside one search shifts
      // the cross-search "All" queue too.
      qc.invalidateQueries({ queryKey: ["review", "next"] });
      qc.invalidateQueries({ queryKey: ["review", "queue"] });
      qc.invalidateQueries({ queryKey: ["review", "today-stats"] });
      // Drop the pinned-cluster selection so the next top-of-queue
      // card surfaces — the swiped one is gone from the queue.
      if (clusterId) {
        navigate({ to: "/", search: (prev) => ({ ...prev, clusterId: null }) });
      }
    },
  });

  const undo = useMutation({
    mutationFn: () => undoLastSwipe(),
    onMutate: async () => {
      setPendingAction("undo");
      await qc.cancelQueries({ queryKey: ["review"] });
      // We don't know which cluster the server will restore until the
      // mutation returns, so we don't touch the card cache — the
      // current card stays visible until the refetch swaps it.
    },
    onError: (e: Error) => {
      setError(e.message ?? "Couldn't undo");
    },
    onSettled: () => {
      setPendingAction(null);
      qc.invalidateQueries({ queryKey: ["review", "next"] });
      qc.invalidateQueries({ queryKey: ["review", "queue"] });
      qc.invalidateQueries({ queryKey: ["review", "today-stats"] });
      if (clusterId) {
        navigate({ to: "/", search: (prev) => ({ ...prev, clusterId: null }) });
      }
    },
  });

  const pending = pendingAction !== null;

  // The aiRules on the card's search are read by the FeaturePills
  // filter. We don't fetch the full search server-side — we just send
  // the relevant pill keys with the card payload. Until that wire
  // change lands, fall back to "show all" by passing an empty rules
  // list.
  const aiRules = readAiRules({ rules: [], excludeOutcodes: [] });

  const doKeep = useCallback(() => {
    if (!card || pending) {
      return;
    }
    swipe.mutate({
      clusterId: card.cluster.id,
      searchId: card.searchId,
      outcome: "keep",
    });
  }, [card, pending, swipe]);

  const doSkip = useCallback(() => {
    if (!card || pending) {
      return;
    }
    swipe.mutate({
      clusterId: card.cluster.id,
      searchId: card.searchId,
      outcome: "skip",
    });
  }, [card, pending, swipe]);

  const doShortlist = useCallback(() => {
    if (!card || pending) {
      return;
    }
    swipe.mutate({
      clusterId: card.cluster.id,
      searchId: card.searchId,
      outcome: "shortlist",
    });
  }, [card, pending, swipe]);

  const doUndo = useCallback(() => {
    if (pending) {
      return;
    }
    undo.mutate();
  }, [pending, undo]);

  const doOpenDetail = useCallback(() => {
    if (!card) {
      return;
    }
    navigate({
      to: "/listings/$clusterId",
      params: { clusterId: card.cluster.id },
      search: { from: "review" },
    });
  }, [card, navigate]);

  // Up/Down step through the queue rail by repointing the URL's
  // `clusterId` search param. No-ops at the ends so wrap-around behavior
  // doesn't surprise — the QueueRail itself doesn't wrap on click either.
  const queueItems = queue?.items ?? [];
  const currentQueueIdx = card
    ? queueItems.findIndex((i) => i.clusterId === card.cluster.id)
    : -1;
  const doPrevInQueue = useCallback(() => {
    if (currentQueueIdx <= 0) {
      return;
    }
    const target = queueItems[currentQueueIdx - 1];
    if (!target) {
      return;
    }
    navigate({
      to: "/",
      search: (prev) => ({ ...prev, clusterId: target.clusterId }),
    });
  }, [currentQueueIdx, queueItems, navigate]);
  const doNextInQueue = useCallback(() => {
    if (currentQueueIdx < 0 || currentQueueIdx >= queueItems.length - 1) {
      return;
    }
    const target = queueItems[currentQueueIdx + 1];
    if (!target) {
      return;
    }
    navigate({
      to: "/",
      search: (prev) => ({ ...prev, clusterId: target.clusterId }),
    });
  }, [currentQueueIdx, queueItems, navigate]);

  // Review-screen shortcuts: S Skip · K Keep · L Shortlist (Like) · Z Undo · I Details.
  // Plus ↑/↓ to step through the queue rail, and ←/→ to cycle the hero photos
  // (the latter registered inside HeroPhoto where the embla instance lives).
  // Disabled while the photo lightbox owns the keyboard (so its ArrowLeft/Right
  // only scroll photos), and disabled on mobile (no physical keyboard).
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isMobile = useIsMobile();
  const reviewKeysEnabled = !lightboxOpen && !isMobile;
  useHotkey("S", doSkip, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Skip listing" },
  });
  useHotkey("K", doKeep, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Keep listing" },
  });
  useHotkey("L", doShortlist, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Shortlist listing" },
  });
  useHotkey("Z", doUndo, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Undo last swipe" },
  });
  useHotkey("I", doOpenDetail, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Open listing details" },
  });
  useHotkey("ArrowUp", doPrevInQueue, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Previous in queue" },
  });
  useHotkey("ArrowDown", doNextInQueue, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Next in queue" },
  });

  const banner = error ?? queryError;
  // Three rendering states for the hero column:
  //   - `card` present     → real review card (covers in-flight swipes
  //     too: `onMutate` keeps the previous card or swaps to the
  //     prefetched next one, never sets `null`).
  //   - card is loading    → skeleton placeholder (initial cold render
  //     or a filter switch with no cached card yet).
  //   - card resolved null → empty state.
  const isCardLoading = cardQuery.isPending && card === undefined;
  return (
    <>
      {banner ? (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-foreground px-4 py-3 text-primary-foreground text-sm shadow-lg"
        >
          {banner}
        </div>
      ) : null}

      {renderDesktopHero({
        card,
        isCardLoading,
        queue,
        todayStats,
        searchesList,
        searchId,
        pending,
        pendingAction,
        queryError,
        doKeep,
        doSkip,
        doShortlist,
        doUndo,
        doOpenDetail,
        setLightboxOpen,
        navigate,
      })}

      <div className="mx-auto min-h-screen max-w-md bg-background pb-24 md:hidden">
        <ReviewHeader
          leftToday={card?.leftToday ?? 0}
          searchPill={card?.searchPill}
        />

        {renderMobileHero({
          card,
          isCardLoading,
          pending,
          pendingAction,
          aiRules,
          doKeep,
          doSkip,
          doShortlist,
          doUndo,
        })}

        <BottomNav />
      </div>
    </>
  );
}

type Navigate = ReturnType<typeof useNavigate>;
type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * Drop the swiped cluster out of the queue rail's cache and return
 * whichever item would naturally come next — the immediate successor
 * if we can find it, otherwise the new head of the queue.
 */
function applyOptimisticQueueDrop(
  qc: QueryClient,
  key: readonly unknown[],
  previousQueue: ReviewQueue | null | undefined,
  swipedClusterId: string
): ReviewQueueItem | undefined {
  if (!previousQueue) {
    return;
  }
  const newItems = previousQueue.items.filter(
    (i) => i.clusterId !== swipedClusterId
  );
  qc.setQueryData<ReviewQueue>(key, {
    items: newItems,
    remaining: newItems.length,
  });
  const idx = previousQueue.items.findIndex(
    (i) => i.clusterId === swipedClusterId
  );
  return (idx >= 0 ? previousQueue.items[idx + 1] : undefined) ?? newItems[0];
}

/**
 * Bump today's stats counter — the header strip animates from the
 * cached snapshot to a number one higher in the matching bucket. The
 * server's authoritative count lands on the next refetch.
 */
function applyOptimisticStatsBump(
  qc: QueryClient,
  key: readonly unknown[],
  previousStats: TodayReviewStats | null | undefined,
  outcome: SwipeOutcome
) {
  if (!previousStats) {
    return;
  }
  qc.setQueryData<TodayReviewStats>(key, {
    reviewed: previousStats.reviewed + 1,
    kept: previousStats.kept + (outcome === "keep" ? 1 : 0),
    skipped: previousStats.skipped + (outcome === "skip" ? 1 : 0),
    shortlisted: previousStats.shortlisted + (outcome === "shortlist" ? 1 : 0),
  });
}

/**
 * Try to plug the prefetched next-card into the active query key so
 * the hero updates without waiting for the network. When we have
 * nothing prefetched, leave the current card on screen (the disabled
 * action buttons prevent a double-swipe) — far better than flashing
 * the empty state. When the swiped card was the last in the queue, we
 * intentionally do clear so the empty state can paint.
 */
function applyOptimisticCardSwap(
  qc: QueryClient,
  key: readonly unknown[],
  searchId: string | null,
  nextItem: ReviewQueueItem | undefined,
  previousQueue: ReviewQueue | null | undefined
) {
  if (nextItem) {
    const prefetched = qc.getQueryData<ReviewCard | null>(
      queryKeys.reviewNext(searchId, nextItem.clusterId)
    );
    if (prefetched) {
      qc.setQueryData<ReviewCard>(key, {
        ...prefetched,
        leftToday: Math.max(prefetched.leftToday - 1, 0),
      });
    }
    return;
  }
  if (previousQueue && previousQueue.items.length <= 1) {
    qc.setQueryData<ReviewCard | null>(key, null);
  }
}

/**
 * Three-state render for the desktop hero — present card / loading
 * skeleton / empty. Pulled out of the JSX to keep the conditional flat
 * (no nested ternaries) and to let the lint cap on cognitive complexity
 * land cleanly.
 */
function renderDesktopHero(args: {
  card: ReviewCard | null | undefined;
  isCardLoading: boolean;
  queue: ReviewQueue | null | undefined;
  todayStats: TodayReviewStats | null | undefined;
  searchesList: Array<{ id: string; name: string }>;
  searchId: string | null;
  pending: boolean;
  pendingAction: PendingAction;
  queryError: string | null;
  doKeep: () => void;
  doSkip: () => void;
  doShortlist: () => void;
  doUndo: () => void;
  doOpenDetail: () => void;
  setLightboxOpen: (open: boolean) => void;
  navigate: Navigate;
}) {
  if (args.card) {
    return (
      <DesktopReview
        data={desktopData(args.card, args.queue, args.todayStats, {
          searchesList: args.searchesList,
          selectedSearchId: args.searchId,
        })}
        disabled={args.pending}
        onKeep={args.doKeep}
        onLightboxOpenChange={args.setLightboxOpen}
        onOpenDetail={args.doOpenDetail}
        onSelectCluster={(nextClusterId) => {
          args.navigate({
            to: "/",
            search: (prev) => ({
              ...prev,
              clusterId: nextClusterId ?? null,
            }),
          });
        }}
        onSelectSearch={(nextSearchId) => {
          args.navigate({
            to: "/",
            search: { searchId: nextSearchId ?? null, clusterId: null },
          });
        }}
        onShortlist={args.doShortlist}
        onSkip={args.doSkip}
        onUndo={args.doUndo}
        pendingAction={args.pendingAction}
      />
    );
  }
  if (args.isCardLoading) {
    return <DesktopReviewSkeleton />;
  }
  return (
    <DesktopReviewEmpty
      activeSearchId={args.searchId}
      hasQueryError={Boolean(args.queryError)}
      onClearFilter={() =>
        args.navigate({ to: "/", search: { searchId: null } })
      }
      searchesList={args.searchesList}
    />
  );
}

function renderMobileHero(args: {
  card: ReviewCard | null | undefined;
  isCardLoading: boolean;
  pending: boolean;
  pendingAction: PendingAction;
  aiRules: ReturnType<typeof readAiRules>;
  doKeep: () => void;
  doSkip: () => void;
  doShortlist: () => void;
  doUndo: () => void;
}) {
  if (args.card) {
    return (
      <main className="space-y-4 pb-4">
        <ReviewCardView aiRules={args.aiRules} card={args.card} />
        <ActionButtons
          clusterId={args.card.cluster.id}
          disabled={args.pending}
          onKeep={args.doKeep}
          onShortlist={args.doShortlist}
          onSkip={args.doSkip}
          onUndo={args.doUndo}
          pendingAction={args.pendingAction}
        />
      </main>
    );
  }
  if (args.isCardLoading) {
    return <MobileReviewSkeleton />;
  }
  return <ReviewEmpty />;
}

/**
 * Compose the DesktopReview payload from live data. The caller is
 * responsible for branching on `card === null` and rendering a real
 * empty state instead — we never fall back to a fake "Belsize Park
 * Mews" placeholder.
 */
function desktopData(
  card: ReviewCard,
  queue: ReviewQueue | null | undefined,
  todayStats: TodayReviewStats | null | undefined,
  opts: {
    searchesList: Array<{ id: string; name: string }>;
    selectedSearchId: string | null;
  }
): DesktopReviewData {
  const reviewedToday = todayStats?.reviewed ?? 0;
  const keptToday = todayStats?.kept ?? 0;
  const skippedToday = todayStats?.skipped ?? 0;
  return {
    searchOptions: opts.searchesList.map((s) => ({ id: s.id, name: s.name })),
    selectedSearchId: opts.selectedSearchId,
    leftToday: card.leftToday,
    reviewedToday,
    keptToday,
    skippedToday,
    queue: buildQueueData(card, queue),
    hero: buildHeroData(card),
  };
}

/**
 * Shown above the `md` breakpoint when there's no current card —
 * either the queue is genuinely empty (all caught up, or no listings
 * yet) or one of the review queries errored. Keeps the sidebar shell
 * so the rest of the app's chrome stays consistent.
 */
function DesktopReviewEmpty({
  hasQueryError,
  activeSearchId,
  searchesList,
  onClearFilter,
}: {
  hasQueryError: boolean;
  activeSearchId: string | null;
  searchesList: Array<{ id: string; name: string }>;
  onClearFilter: () => void;
}) {
  const filteredSearchName = activeSearchId
    ? (searchesList.find((s) => s.id === activeSearchId)?.name ?? null)
    : null;
  let body: string;
  if (hasQueryError) {
    body =
      "Check the banner top-right for the underlying error. Refresh once it's resolved.";
  } else if (filteredSearchName) {
    body = `Nothing left to swipe in "${filteredSearchName}". Switch to all searches to see the rest of the queue.`;
  } else {
    body =
      "Nothing left to swipe right now. New listings will land here as your searches keep scraping.";
  }
  return (
    <AdminSidebar mode="desktop-only">
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="max-w-md rounded-2xl bg-muted p-8 text-center">
          <p className="font-semibold text-[10px] text-primary uppercase tracking-[0.14em]">
            {hasQueryError ? "Couldn't load review" : "Queue · empty"}
          </p>
          <h1 className="mt-2 font-serif text-2xl text-foreground">
            {hasQueryError ? "Something went sideways" : "All caught up"}
          </h1>
          <p className="mt-3 text-muted-foreground text-sm">{body}</p>
          {filteredSearchName ? (
            <button
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm"
              onClick={onClearFilter}
              type="button"
            >
              Show all searches
            </button>
          ) : null}
        </div>
      </div>
    </AdminSidebar>
  );
}

// Stable id arrays for the skeletons — keep them outside the
// component so React keys don't churn between re-renders.
const SKELETON_QUEUE_ROWS = ["q0", "q1", "q2", "q3", "q4", "q5"];
const SKELETON_SPEC_CELLS = ["s0", "s1", "s2", "s3", "s4"];
const SKELETON_VERDICT_CHIPS = ["v0", "v1", "v2", "v3"];
const SKELETON_MOBILE_STATS = ["m0", "m1", "m2"];

/**
 * Skeleton shell painted while the first card + queue load (initial
 * cold render, or a filter switch where the new search has no cached
 * card yet). Shape mirrors {@link DesktopReview} — queue rail on the
 * left, hero card on the right — so the layout doesn't reflow when the
 * real content lands.
 */
function DesktopReviewSkeleton() {
  return (
    <AdminSidebar mode="desktop-only">
      <header className="flex items-end justify-between px-10 pt-9 pb-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-6 w-44 rounded-full" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-5 px-10 pb-8">
        <aside className="flex min-h-0 w-[260px] shrink-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3">
          {SKELETON_QUEUE_ROWS.map((id) => (
            <div className="flex items-center gap-3" key={id}>
              <Skeleton className="size-11 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </aside>
        <section className="flex min-h-0 w-[540px] flex-1 shrink-0 flex-col gap-3.5">
          <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <Skeleton className="min-h-[280px] flex-1 rounded-none" />
            <div className="flex shrink-0 flex-col gap-4 px-7 pt-6 pb-6">
              <div className="flex items-end justify-between">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-5 w-56" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
              <div className="flex items-stretch gap-4 border-bone border-y py-3.5">
                {SKELETON_SPEC_CELLS.map((id) => (
                  <div className="flex flex-1 flex-col gap-1.5" key={id}>
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-6 w-10" />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {SKELETON_VERDICT_CHIPS.map((id) => (
                  <Skeleton className="h-7 w-32 rounded-full" key={id} />
                ))}
              </div>
            </div>
          </article>
        </section>
      </div>
    </AdminSidebar>
  );
}

/**
 * Mobile counterpart of {@link DesktopReviewSkeleton}. Shown inside the
 * existing `md:hidden` shell so the bottom nav stays anchored.
 */
function MobileReviewSkeleton() {
  return (
    <main className="space-y-4 pb-4">
      <div className="mx-4 overflow-hidden rounded-2xl bg-card">
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="flex gap-4">
            {SKELETON_MOBILE_STATS.map((id) => (
              <Skeleton className="h-12 flex-1 rounded-lg" key={id} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function buildHeroData(card: ReviewCard): DesktopReviewData["hero"] {
  const { headlineListing, portalsAlsoOn, features, epcRating } = card;
  const photos =
    headlineListing.photos.length > 0
      ? headlineListing.photos
      : [FALLBACK_PHOTO];

  return {
    photos,
    alsoOn: formatAlsoOn(portalsAlsoOn),
    price: formatPrice(headlineListing.priceMonthly),
    priceUnit: "/mo",
    title: headlineListing.title,
    subtitle: formatSubtitle(
      headlineListing.outcode,
      headlineListing.firstSeenAt
    ),
    cheapestPortal: prettyPortal(headlineListing.portal),
    spec: buildSpec({
      bedrooms: headlineListing.bedrooms,
      bathrooms: headlineListing.bathrooms,
      giaSqm: features?.floorplan?.giaSqm ?? null,
      epc: epcRating ?? null,
    }),
    verdicts: buildVerdicts(features),
  };
}

function formatAlsoOn(portalsAlsoOn: ReviewCard["portalsAlsoOn"]): string {
  if (portalsAlsoOn.length === 0) {
    return "";
  }
  // De-dupe — a cluster can have multiple listings on the same portal
  // if a search overlaps with another. Preserve first-seen order.
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const p of portalsAlsoOn) {
    const pretty = prettyPortal(p.portal);
    if (seen.has(pretty)) {
      continue;
    }
    seen.add(pretty);
    labels.push(pretty);
  }
  return `Also on ${labels.join(" · ")}`;
}

function formatSubtitle(outcode: string, firstSeenAt: Date): string {
  const outcodePart = outcode || "—";
  // `firstSeenAt` is when our scraper first saw the listing, NOT when
  // the portal listed it. The portals don't expose a reliable
  // listed-on date in their public payload, so the copy is honest
  // about what we actually know.
  const seenPart = `First seen ${relativeFirstSeen(firstSeenAt)}`;
  return `${outcodePart} · ${seenPart}`;
}

function relativeFirstSeen(firstSeenAt: Date): string {
  const date =
    firstSeenAt instanceof Date
      ? firstSeenAt
      : new Date(firstSeenAt as unknown as string);
  const diffMs = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) {
    return "today";
  }
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
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function prettyPortal(portal: string): string {
  switch (portal.toLowerCase()) {
    case "rightmove":
      return "Rightmove";
    case "zoopla":
      return "Zoopla";
    case "openrent":
      return "OpenRent";
    default:
      return portal.charAt(0).toUpperCase() + portal.slice(1);
  }
}

function buildSpec(args: {
  bedrooms: number | null;
  bathrooms: number | null;
  giaSqm: number | null;
  epc: string | null;
}): DesktopReviewData["hero"]["spec"] {
  const sqftValue =
    args.giaSqm != null ? Math.round(args.giaSqm * 10.7639) : null;
  return [
    { label: "Beds", value: specValue(args.bedrooms) },
    { label: "Baths", value: specValue(args.bathrooms) },
    { label: "Sq ft", value: specValue(sqftValue) },
    { label: "EPC", value: args.epc ?? "—" },
    // Commute isn't computed yet — `getListingDetail` has the
    // postcodes.io address lookup but no transit-time provider wired
    // in. Surface a placeholder dash until that lands.
    { label: "Commute", value: "—", suffix: undefined },
  ];
}

function specValue(value: number | null): string {
  return value == null ? "—" : value.toLocaleString("en-GB");
}

/**
 * Mirrors `FeaturePills` (the mobile equivalent) but flattens its three
 * tones onto the two the desktop hero supports: `positive` stays
 * positive, `caution`/`problem` both fold into `caution`. Floorplan
 * room sizes are not shown on this surface — too dense for the hero —
 * they live in the listing-detail page.
 *
 * Important: aiRules are NOT applied here. Mobile gates pills by the
 * search's enabled rules; the desktop hero shows whatever the AI
 * extracted so the reviewer always sees the same signal regardless of
 * which filters are on. Adjust if that turns out to be wrong.
 */
function buildVerdicts(
  features: ReviewCard["features"]
): DesktopReviewData["hero"]["verdicts"] {
  if (!features) {
    return [];
  }
  const out: DesktopReviewData["hero"]["verdicts"] = [];

  if (features.hasGarden === true) {
    out.push({ label: "Garden", tone: "positive" });
  }
  if (features.hasParking === true) {
    out.push({ label: "Parking", tone: "positive" });
  }
  if (features.hasWasher === true) {
    out.push({ label: "Washer", tone: "positive" });
  }
  if (features.allowsPets === true) {
    out.push({ label: "Pets OK", tone: "positive" });
  }
  if (features.isFurnished === true) {
    out.push({ label: "Furnished", tone: "positive" });
  }
  if (features.floorplan?.layout === "separate") {
    out.push({ label: "Separate kitchen", tone: "positive" });
  }
  for (const sp of features.smallPrint ?? []) {
    if (sp.severity === "ok") {
      continue;
    }
    out.push({ label: sp.label, tone: "caution" });
  }
  return out;
}

function buildQueueData(
  card: ReviewCard,
  queue: ReviewQueue | null | undefined
): DesktopReviewData["queue"] {
  if (!queue) {
    // Fallback when the queue query is still loading — at least render
    // the currently-shown card so the rail isn't empty.
    return {
      items: [queueItemFromCard(card)],
      remaining: Math.max(card.leftToday, 1),
      selectedClusterId: card.cluster.id,
    };
  }
  return {
    items: queue.items.map(queueItemFromReviewQueueItem),
    remaining: queue.remaining,
    selectedClusterId: card.cluster.id,
  };
}

function queueItemFromCard(card: ReviewCard) {
  const photo = card.headlineListing.photos[0] ?? FALLBACK_PHOTO;
  return {
    id: card.cluster.id,
    title: card.headlineListing.title,
    outcode: card.headlineListing.outcode || "—",
    beds: card.headlineListing.bedrooms ?? 0,
    price: formatPrice(card.headlineListing.priceMonthly),
    photo,
  };
}

function queueItemFromReviewQueueItem(item: ReviewQueueItem) {
  return {
    id: item.clusterId,
    title: item.title,
    outcode: item.outcode || "—",
    beds: item.bedrooms ?? 0,
    price: formatPrice(item.priceMonthly),
    photo: item.photo ?? FALLBACK_PHOTO,
    // `suffix` shows "·N" when the cluster appears on more than one
    // portal. Blind-review rule means we don't surface peer outcomes
    // until there's a mutual match, so no `peareaceFlag`.
    suffix: item.portalCount > 1 ? `·${item.portalCount}` : undefined,
  };
}

function formatPrice(priceMonthly: number | null): string {
  if (priceMonthly == null) {
    return "—";
  }
  return `£${priceMonthly.toLocaleString("en-GB")}`;
}

/**
 * Used when a listing has no photo rows yet — keeps the rail from
 * rendering a broken-image icon while the scrape catches up.
 */
const FALLBACK_PHOTO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23E8E2D6'/></svg>";
