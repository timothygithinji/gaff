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
import {
  EMPTY_QUEUE_FILTERS,
  QueueFilter,
  type QueueFilterOptions,
  type QueueFilterable,
  type QueueFilters,
  activeFilterCount,
  matchesQueueFilters,
  queueFilterOptions,
} from "../components/review/queue-filter";
import { MobileReviewCard } from "../components/review/review-card";
import { ReviewEmpty } from "../components/review/review-empty";
import { ReviewHeader } from "../components/review/review-header";
import { toStatCells } from "../components/review/review-shapers";
import { EmptyState } from "../components/ui/patterns/empty-state";
import { toPills } from "../components/ui/patterns/feature-pills";
import { Skeleton } from "../components/ui/skeleton";
import { useIsMobile } from "../hooks/use-mobile";
import { requireSession } from "../lib/auth-guard";
import {
  type HouseholdValue,
  useHouseholdOptional,
} from "../lib/household-context";
import { outcodeLocationLabel } from "../lib/outcode-areas";
import { propertyKindLabel } from "../lib/property-kind";
import { queryKeys } from "../lib/query-keys";
import { deferCluster } from "../server/functions/deferrals";
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
import { listSearches } from "../server/functions/searches";

// "keep" stays in the swipe_outcome DB enum for back-compat with rows
// written before B1 collapsed Keep + Shortlist. The UI only ever writes
// "shortlist" or "skip" now.
type SwipeOutcome = "shortlist" | "skip";
type PendingAction = SwipeOutcome | "undo" | "defer" | null;

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
  const household = useHouseholdOptional();
  const card = cardQuery.data;
  const queue = queueQuery.data;
  const todayStats = todayStatsQuery.data;
  const searchesList = searchesQuery.data ?? [];
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  // Queue filter state, shared by the desktop rail and the mobile card
  // stream (see queue-filter.tsx). On desktop it narrows the rail; on
  // mobile, where there's no rail, the pin effect below uses it to choose
  // which card to show.
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_QUEUE_FILTERS);
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

  // Defer: snooze a half-filled listing for the whole household. Same
  // optimistic queue-drop + card-advance as a swipe (it leaves the queue
  // now), but it's not a review verdict so we don't bump today's stats.
  const defer = useMutation({
    mutationFn: (args: { clusterId: string; searchId: string; days: number }) =>
      deferCluster({
        data: { clusterId: args.clusterId, days: args.days },
      }),
    onMutate: async (args) => {
      setPendingAction("defer");
      await Promise.all([
        qc.cancelQueries({ queryKey: ["review", "next"] }),
        qc.cancelQueries({ queryKey: ["review", "queue"] }),
      ]);
      const previousCard = qc.getQueryData<ReviewCard | null>(
        cardOpts.queryKey
      );
      const previousQueue = qc.getQueryData<ReviewQueue | null>(
        queueOpts.queryKey
      );
      const nextItem = applyOptimisticQueueDrop(
        qc,
        queueOpts.queryKey,
        previousQueue,
        args.clusterId
      );
      applyOptimisticCardSwap(
        qc,
        cardOpts.queryKey,
        searchId,
        nextItem,
        previousQueue
      );
      return { previousCard, previousQueue };
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
      setError(e.message ?? "Couldn't defer");
    },
    onSettled: () => {
      setPendingAction(null);
      qc.invalidateQueries({ queryKey: ["review", "next"] });
      qc.invalidateQueries({ queryKey: ["review", "queue"] });
      qc.invalidateQueries({ queryKey: ["deferrals"] });
      if (clusterId) {
        navigate({ to: "/", search: (prev) => ({ ...prev, clusterId: null }) });
      }
    },
  });

  const pending = pendingAction !== null;

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

  const doDefer = useCallback(
    (days: number) => {
      if (!card || pending) {
        return;
      }
      defer.mutate({
        clusterId: card.cluster.id,
        searchId: card.searchId,
        days,
      });
    },
    [card, pending, defer]
  );

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

  // Review-screen shortcuts: S Skip · L Shortlist · Z Undo · I Details.
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
  useHotkey("L", doShortlist, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Shortlist listing" },
  });
  useHotkey("Z", doUndo, {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Undo last swipe" },
  });
  useHotkey("D", () => doDefer(5), {
    enabled: reviewKeysEnabled,
    meta: { category: "Review", description: "Defer listing (5 days)" },
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

  // The same queue filter, applied to the mobile card stream. Mobile has
  // no rail to narrow, so instead the filter pins the single card to the
  // first listing that still matches; desktop keeps its independent hero,
  // so the pin is gated to mobile. It rides the existing `clusterId` URL
  // param — a swipe clears it (onSettled) and this re-pins to the next
  // match. `filteredQueueItems` also feeds the mobile count + empty state.
  const filterCount = activeFilterCount(filters);
  const filteredQueueItems = queueItems.filter((i) =>
    matchesQueueFilters(queueFilterable(i), filters)
  );
  const mobileFilterOptions = queueFilterOptions(
    queueItems.map(queueFilterable)
  );
  useEffect(() => {
    if (!isMobile || filterCount === 0) {
      return;
    }
    // Already showing a matching card (or it's mid-load) → leave it.
    if (card && filteredQueueItems.some((i) => i.clusterId === card.cluster.id)) {
      return;
    }
    const target = filteredQueueItems[0]?.clusterId ?? null;
    if (target && target !== clusterId) {
      navigate({ to: "/", search: (prev) => ({ ...prev, clusterId: target }) });
    }
  }, [isMobile, filterCount, filteredQueueItems, card, clusterId, navigate]);

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
        household,
        searchId,
        pending,
        pendingAction,
        queryError,
        filters,
        setFilters,
        doSkip,
        doShortlist,
        doUndo,
        doDefer,
        doOpenDetail,
        setLightboxOpen,
        navigate,
      })}

      {renderMobileReview({
        card,
        isCardLoading,
        queueItems,
        filteredQueueItems,
        filterCount,
        filters,
        setFilters,
        mobileFilterOptions,
        pending,
        pendingAction,
        doSkip,
        doShortlist,
        doUndo,
        doDefer,
        doOpenDetail,
      })}
    </>
  );
}

/**
 * Mobile Review shell — header, the filter bar, and the single-card body
 * (or the "no matches" state when the filter empties the queue). Pulled
 * out of {@link ReviewPage} so the page's branchy mobile/desktop split
 * stays under the cognitive-complexity cap.
 */
function renderMobileReview(args: {
  card: ReviewCard | null | undefined;
  isCardLoading: boolean;
  queueItems: ReviewQueueItem[];
  filteredQueueItems: ReviewQueueItem[];
  filterCount: number;
  filters: QueueFilters;
  setFilters: (next: QueueFilters) => void;
  mobileFilterOptions: QueueFilterOptions;
  pending: boolean;
  pendingAction: PendingAction;
  doSkip: () => void;
  doShortlist: () => void;
  doUndo: () => void;
  doDefer: (days: number) => void;
  doOpenDetail: () => void;
}) {
  const filtering = args.filterCount > 0;
  const showFilterBar = args.queueItems.length > 0 || filtering;
  const noMatches =
    filtering &&
    args.filteredQueueItems.length === 0 &&
    args.queueItems.length > 0;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background pb-24 sm:max-w-2xl lg:hidden">
      <ReviewHeader
        leftToday={
          filtering ? args.filteredQueueItems.length : (args.card?.leftToday ?? 0)
        }
        searchPill={args.card?.searchPill}
      />

      {showFilterBar ? (
        <div className="flex items-center justify-between gap-2 px-5 pb-2">
          <span className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
            {filtering
              ? `${args.filteredQueueItems.length} of ${args.queueItems.length} match`
              : ""}
          </span>
          <QueueFilter
            filters={args.filters}
            onChange={args.setFilters}
            options={args.mobileFilterOptions}
          />
        </div>
      ) : null}

      {noMatches ? (
        <MobileFilterEmpty
          onClear={() => args.setFilters(EMPTY_QUEUE_FILTERS)}
        />
      ) : (
        renderMobileHero({
          card: args.card,
          isCardLoading: args.isCardLoading,
          pending: args.pending,
          pendingAction: args.pendingAction,
          doSkip: args.doSkip,
          doShortlist: args.doShortlist,
          doUndo: args.doUndo,
          doDefer: args.doDefer,
          doOpenDetail: args.doOpenDetail,
        })
      )}

      <BottomNav />
    </div>
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
    // `kept` is the legacy bucket for outcome="keep"; nothing in the UI
    // writes that today (B1) but the field stays on the wire for the
    // admin dashboards that still count historical rows.
    kept: previousStats.kept,
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
  household: HouseholdValue | null;
  searchId: string | null;
  pending: boolean;
  pendingAction: PendingAction;
  queryError: string | null;
  filters: QueueFilters;
  setFilters: (next: QueueFilters) => void;
  doSkip: () => void;
  doShortlist: () => void;
  doUndo: () => void;
  doDefer: (days: number) => void;
  doOpenDetail: () => void;
  setLightboxOpen: (open: boolean) => void;
  navigate: Navigate;
}) {
  if (args.card) {
    return (
      <DesktopReview
        data={desktopData(args.card, args.queue, args.todayStats, {
          household: args.household,
        })}
        disabled={args.pending}
        filters={args.filters}
        onDefer={args.doDefer}
        onFiltersChange={args.setFilters}
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
        onShortlist={args.doShortlist}
        onSkip={args.doSkip}
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
  doSkip: () => void;
  doShortlist: () => void;
  doUndo: () => void;
  doDefer: (days: number) => void;
  doOpenDetail: () => void;
}) {
  if (args.card) {
    return (
      <main className="flex flex-1 flex-col gap-3.5 pb-3 sm:justify-center sm:py-5">
        <MobileReviewCard
          card={args.card}
          disabled={args.pending}
          key={args.card.cluster.id}
          onOpenDetail={args.doOpenDetail}
          onShortlist={args.doShortlist}
          onSkip={args.doSkip}
        />
        <ActionButtons
          clusterId={args.card.cluster.id}
          disabled={args.pending}
          onDefer={args.doDefer}
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
  opts: { household: HouseholdValue | null }
): DesktopReviewData {
  const items = buildQueueItems(card, queue);
  const total = queue?.remaining ?? Math.max(card.leftToday, items.length, 1);
  // 1-based position of the current card within the queue (the queue may not
  // include it yet right after a swipe — clamp to 1 so the eyebrow reads sane).
  const position = Math.max(
    items.findIndex((i) => i.id === card.cluster.id) + 1,
    1
  );
  return {
    queue: {
      items,
      remaining: total,
      position,
      selectedClusterId: card.cluster.id,
    },
    hero: buildHero(card),
    // No cluster-match score is computed yet — the "N% match" chip stays
    // hidden until one exists.
    matchPct: null,
    portals: buildPortals(card),
    today: buildToday(todayStats, opts.household),
  };
}

function buildQueueItems(
  card: ReviewCard,
  queue: ReviewQueue | null | undefined
): DesktopReviewData["queue"]["items"] {
  if (!queue) {
    return [queueItemFromCard(card)];
  }
  return queue.items.map((item) => ({
    id: item.clusterId,
    title: streetName(item.addressRaw) || item.title,
    price: formatPrice(item.priceMonthly),
    priceValue: item.priceMonthly,
    outcode: item.outcode || "—",
    beds: item.bedrooms,
    bathrooms: item.bathrooms,
    availability: formatAvailability(item.availableFrom, item.availableNow),
    availableInDays: availableInDays(item.availableFrom, item.availableNow),
    furnished: formatFurnished(item.furnished),
    propertyKind: item.propertyKind,
    councilTaxBand: item.councilTaxBand,
    epcBand: item.epcBand,
    commuteMinutes: item.commuteMinutes,
    fttp: item.fttp,
    portalCount: item.portalCount,
    photo: item.photo ?? FALLBACK_PHOTO,
  }));
}

function queueItemFromCard(
  card: ReviewCard
): DesktopReviewData["queue"]["items"][number] {
  const hl = card.headlineListing;
  return {
    id: card.cluster.id,
    title: streetName(hl.addressRaw) || hl.title,
    price: formatPrice(hl.priceMonthly),
    priceValue: hl.priceMonthly,
    outcode: hl.outcode || "—",
    beds: hl.bedrooms,
    bathrooms: hl.bathrooms,
    availability: formatAvailability(hl.availableFrom, hl.availableNow),
    availableInDays: availableInDays(hl.availableFrom, hl.availableNow),
    furnished: formatFurnished(hl.furnished),
    propertyKind: card.propertyKind,
    councilTaxBand: card.councilTaxBand,
    epcBand: card.epcRating ?? null,
    commuteMinutes: card.commuteMinutes,
    fttp: card.broadband ? card.broadband.fttpAvailable : null,
    portalCount: card.portalsAlsoOn.length + 1,
    photo: hl.photos[0] ?? FALLBACK_PHOTO,
  };
}

function buildHero(card: ReviewCard): DesktopReviewData["hero"] {
  const hl = card.headlineListing;
  const photos = hl.photos.length > 0 ? hl.photos : [FALLBACK_PHOTO];
  return {
    photos,
    title: streetName(hl.addressRaw) || hl.title,
    subtitle: composeSubtitle(card),
    price: formatPrice(hl.priceMonthly),
    priceUnit: "/mo",
    signals: toPills(card.features),
    stats: toStatCells(card),
  };
}

const FLAT_PREFIX_RE = /^(?:flat|unit|apartment|apt)\s+\w+\s+/i;
const HOUSE_NUMBER_RE = /^\d+[a-z]?\s+/i;

/**
 * Street name from a raw address — the first address line with any leading
 * flat/house number stripped ("22 Belsize Park Mews" → "Belsize Park Mews",
 * "Flat 2 Camden Lock" → "Camden Lock"). Mirrors the listing-detail title so
 * the review and detail screens read the same. Empty string if nothing's
 * left, so callers can fall back to the portal title.
 */
function streetName(addressRaw: string): string {
  const firstLine = addressRaw.split(",")[0]?.trim() ?? addressRaw;
  const stripped = firstLine
    .replace(FLAT_PREFIX_RE, "")
    .replace(HOUSE_NUMBER_RE, "");
  return stripped.length > 0 ? stripped : firstLine;
}

/**
 * "Flat · 2 bed · 1 bath · 712 sqft · Hampstead NW3 · Listed 2 days ago" —
 * leads with the property kind, ends with the area/postcode, and skips any
 * field we don't know.
 */
function composeSubtitle(card: ReviewCard): string {
  const hl = card.headlineListing;
  const parts: string[] = [];
  const kind = propertyKindLabel(card.propertyKind);
  if (kind) {
    parts.push(kind);
  }
  if (hl.bedrooms != null) {
    parts.push(`${hl.bedrooms} bed`);
  }
  if (hl.bathrooms != null) {
    parts.push(`${hl.bathrooms} bath`);
  }
  if (hl.sizeSqFt != null) {
    parts.push(`${hl.sizeSqFt.toLocaleString("en-GB")} sqft`);
  }
  const location = outcodeLocationLabel(hl.outcode);
  if (location) {
    parts.push(location);
  }
  parts.push(`Listed ${card.firstSeenLabel}`);
  return parts.join(" · ");
}

/**
 * "What stands out" signals — highlights render as navy ticks, watch-outs as
 * the copper "!" marker. Both come from the v2 features schema; pre-v2 rows
 * lacking these arrays render an empty card (repopulates once re-enriched).
 */

/**
 * "The numbers" grid: transport · EPC · council tax · size.
 * Transport is the walk time to the nearest station; EPC is tinted by band;
 * size prefers the listing's floor area and falls back to the EPC's.
 * Cells that aren't enriched yet read "—" so the grid keeps its rhythm.
 */
/**
 * "Today" tally. Partner-resolved counts ("by <name>", "both kept") need a
 * cross-member feed we don't surface yet, so the three cells read the
 * current user's own stats: kept · vetoed · reviewed (the last accented).
 */
function buildToday(
  todayStats: TodayReviewStats | null | undefined,
  household: HouseholdValue | null
): DesktopReviewData["today"] {
  const me = household?.members.find(
    (m) => m.userId === household.currentUserId
  );
  const youInitial = avatarInitial(me?.name || me?.email || null);
  const partner = household?.otherMembers[0];
  const partnerInitial = partner
    ? avatarInitial(partner.name || partner.email || null)
    : null;
  const kept = (todayStats?.shortlisted ?? 0) + (todayStats?.kept ?? 0);
  return {
    youInitial,
    partnerInitial,
    cells: [
      { value: `${kept}`, label: "kept by you" },
      { value: `${todayStats?.skipped ?? 0}`, label: "vetoed" },
      { value: `${todayStats?.reviewed ?? 0}`, label: "reviewed", accent: true },
    ],
  };
}

function avatarInitial(nameOrEmail: string | null): string {
  return (nameOrEmail || "?").charAt(0).toUpperCase();
}

/**
 * Builds the "Same property" rows from the cluster's listings: the
 * headline (cheapest by the cluster's ranking) as row 0, then every other
 * portal the cluster appears on. Deltas are computed against the headline
 * price; the headline carries the `cheapest` flag (bold price, no delta).
 */
function buildPortals(card: ReviewCard): DesktopReviewData["portals"] {
  const headlinePrice = card.headlineListing.priceMonthly;
  const headlineName = prettyPortal(card.headlineListing.portal);

  // Dedupe "also on" listings to one row per *distinct* portal — two
  // Rightmove listings in a cluster collapse into the single headline row,
  // not a second portal. portalsAlsoOn arrives cheapest-first, so the first
  // listing kept per portal is that portal's cheapest.
  const seen = new Set([headlineName]);
  const otherPortals = card.portalsAlsoOn.filter((p) => {
    const name = prettyPortal(p.portal);
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });

  // Crown the headline "cheapest" only when another distinct portal is
  // actually dearer. Same-portal duplicates don't count: they collapse into
  // the headline row, so flagging them left a lone portal wearing the tag.
  const hasSpread =
    headlinePrice != null &&
    otherPortals.some(
      (p) => p.priceMonthly != null && p.priceMonthly > headlinePrice
    );

  return [
    {
      portal: headlineName,
      initial: headlineName.charAt(0),
      url: card.headlineListing.url,
      price: formatPrice(headlinePrice),
      delta: null,
      cheapest: hasSpread,
    },
    ...otherPortals.map((p) => {
      const name = prettyPortal(p.portal);
      return {
        portal: name,
        initial: name.charAt(0),
        url: p.url,
        price: formatPrice(p.priceMonthly),
        delta: portalDelta(headlinePrice, p.priceMonthly),
        cheapest: false,
      };
    }),
  ];
}

/** "+£50" style delta vs the cheapest, or null when unknown / equal. */
function portalDelta(
  cheapest: number | null,
  other: number | null
): string | null {
  if (cheapest == null || other == null) {
    return null;
  }
  const diff = other - cheapest;
  if (diff <= 0) {
    return null;
  }
  return `+£${diff.toLocaleString("en-GB")}`;
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
const SKELETON_STAT_CELLS = ["s0", "s1", "s2"];
const SKELETON_FLOORPLAN_ROWS = ["f0", "f1", "f2", "f3"];
const SKELETON_MOBILE_STATS = ["m0", "m1", "m2"];

/**
 * Skeleton shell painted while the first card + queue load (initial
 * cold render, or a filter switch where the new search has no cached
 * card yet). Shape mirrors {@link DesktopReview} — queue rail · main
 * column · right rail — so the layout doesn't reflow when content lands.
 */
function DesktopReviewSkeleton() {
  return (
    <AdminSidebar mode="desktop-only">
      <div className="flex w-full items-start gap-6 px-8 py-6">
        <aside className="flex w-60 shrink-0 flex-col gap-3">
          <Skeleton className="h-3 w-28" />
          {SKELETON_QUEUE_ROWS.map((id) => (
            <div
              className="flex items-stretch gap-3 rounded-[6px] border border-line bg-paper p-2.5"
              key={id}
            >
              <Skeleton className="size-[60px] shrink-0 rounded-[4px]" />
              <div className="flex flex-1 flex-col gap-1.5 pt-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-[18px]">
          <div className="flex items-baseline justify-between gap-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="aspect-[57/40] w-full rounded-[6px]" />
          <div className="flex items-stretch gap-[18px]">
            <div className="flex flex-[1.3] flex-col gap-3 rounded-[6px] border border-line bg-paper p-[18px]">
              <Skeleton className="h-3 w-40" />
              {SKELETON_FLOORPLAN_ROWS.map((id) => (
                <Skeleton className="h-4 w-full" key={id} />
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-3 rounded-[6px] border border-line bg-paper p-[18px]">
              <Skeleton className="h-3 w-24" />
              <div className="flex gap-3">
                {SKELETON_STAT_CELLS.map((id) => (
                  <div className="flex flex-1 flex-col gap-1.5" key={id}>
                    <Skeleton className="h-2.5 w-12" />
                    <Skeleton className="h-6 w-10" />
                    <Skeleton className="h-2.5 w-10" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <aside className="flex w-[280px] shrink-0 flex-col gap-4">
          <Skeleton className="h-[140px] w-full rounded-[6px]" />
          <Skeleton className="h-[200px] w-full rounded-[6px]" />
          <Skeleton className="h-12 w-full rounded-[6px]" />
          <Skeleton className="h-[86px] w-full rounded-[6px]" />
        </aside>
      </div>
    </AdminSidebar>
  );
}

/**
 * Mobile counterpart of {@link DesktopReviewSkeleton}. Shown inside the
 * existing `lg:hidden` shell so the bottom nav stays anchored.
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

function formatPrice(priceMonthly: number | null): string {
  if (priceMonthly == null) {
    return "—";
  }
  return `£${priceMonthly.toLocaleString("en-GB")}`;
}

/**
 * "Avail now" when the listing is flagged available-immediately or the
 * move-in date is today/past, else "Avail 12 Jun" (year added only when
 * it's not this year). Null when we know neither — the card omits the chip.
 */
function formatAvailability(
  value: string | Date | null,
  availableNow = false
): string | null {
  if (!value) {
    return availableNow ? "Avail now" : null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return availableNow ? "Avail now" : null;
  }
  const today = new Date();
  // Compare on calendar day, not the timestamp, so "available today" reads
  // as "now" rather than a future date later the same day.
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  if (date.getTime() <= startOfToday.getTime()) {
    return "Avail now";
  }
  const sameYear = date.getFullYear() === today.getFullYear();
  const label = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `Avail ${label}`;
}

const FURNISHED_LABELS: Record<string, string> = {
  furnished: "Furnished",
  unfurnished: "Unfurnished",
  part_furnished: "Part furnished",
};
function formatFurnished(value: string | null): string | null {
  return value ? (FURNISHED_LABELS[value] ?? null) : null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Days until move-in for the queue's move-in facet: 0 when the listing is
 * flagged available now or its date is today/past, a positive day count
 * for a future date, null when we know neither (so the facet can drop it).
 */
function availableInDays(
  iso: string | null,
  availableNow: boolean
): number | null {
  if (availableNow) {
    return 0;
  }
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  return Math.max(0, Math.ceil((date.getTime() - startOfToday.getTime()) / MS_PER_DAY));
}

/**
 * Normalise a raw queue item into the shape the queue filter reads. The
 * filter's furnishing facet compares against the same formatted labels the
 * rail renders, so we reuse the same formatter.
 */
function queueFilterable(item: ReviewQueueItem): QueueFilterable {
  return {
    beds: item.bedrooms,
    bathrooms: item.bathrooms,
    furnished: formatFurnished(item.furnished),
    availableInDays: availableInDays(item.availableFrom, item.availableNow),
    outcode: item.outcode,
    propertyKind: item.propertyKind,
    councilTaxBand: item.councilTaxBand,
    epcBand: item.epcBand,
    commuteMinutes: item.commuteMinutes,
    fttp: item.fttp,
    portalCount: item.portalCount,
    priceValue: item.priceMonthly,
  };
}

/**
 * Mobile counterpart of the desktop rail's "no matches" state — shown
 * when the active filter leaves no listing to swipe. Mirrors
 * {@link ReviewEmpty}'s card so the two empty states read the same.
 */
function MobileFilterEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="px-5 pt-8">
      <EmptyState
        action={
          <button
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-semibold text-[14px] text-white"
            onClick={onClear}
            type="button"
          >
            Clear filters
          </button>
        }
        body="Nothing in your queue matches these filters. Loosen them to see more."
        eyebrow="Queue · filtered"
        title="No listings match"
      />
    </div>
  );
}

/**
 * Used when a listing has no photo rows yet — keeps the rail from
 * rendering a broken-image icon while the scrape catches up.
 */
const FALLBACK_PHOTO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23E8E2D6'/></svg>";
