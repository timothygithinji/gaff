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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
import { requireSession } from "../lib/auth-guard";
import { queryKeys } from "../lib/query-keys";
import {
  type RecentSwipeEntry,
  type ReviewCard,
  type ReviewQueue,
  type ReviewQueueItem,
  type TodayReviewStats,
  getNextReviewCard,
  getReviewQueue,
  getTodayReviewStats,
  listMyRecentSwipes,
  recordSwipe,
  undoLastSwipe,
} from "../server/functions/review";
import { readAiRules } from "../server/functions/searches";

const reviewCardQueryOptions = {
  queryKey: queryKeys.reviewNext(),
  queryFn: () => getNextReviewCard(),
  // Always re-fetch on focus — a household member swiping on another
  // device can change what's at the top of our queue.
  staleTime: 0,
};

const reviewQueueQueryOptions = {
  queryKey: queryKeys.reviewQueue(),
  queryFn: () => getReviewQueue(),
  staleTime: 0,
};

const reviewTodayStatsQueryOptions = {
  queryKey: queryKeys.reviewTodayStats(),
  queryFn: () => getTodayReviewStats(),
  staleTime: 0,
};

const reviewRecentSwipesQueryOptions = {
  queryKey: queryKeys.reviewRecentSwipes(),
  queryFn: () => listMyRecentSwipes(),
  staleTime: 0,
};

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/");
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(reviewCardQueryOptions),
      context.queryClient.ensureQueryData(reviewQueueQueryOptions),
      context.queryClient.ensureQueryData(reviewTodayStatsQueryOptions),
      context.queryClient.ensureQueryData(reviewRecentSwipesQueryOptions),
    ]),
  component: ReviewPage,
});

function ReviewPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cardQuery = useQuery(reviewCardQueryOptions);
  const queueQuery = useQuery(reviewQueueQueryOptions);
  const todayStatsQuery = useQuery(reviewTodayStatsQueryOptions);
  const recentSwipesQuery = useQuery(reviewRecentSwipesQueryOptions);
  const card = cardQuery.data;
  const queue = queueQuery.data;
  const todayStats = todayStatsQuery.data;
  const recentSwipes = recentSwipesQuery.data;
  const [error, setError] = useState<string | null>(null);
  // Surface the first query error we see so silent failures stop
  // masquerading as "empty queue" via the placeholder fallback.
  const queryError =
    cardQuery.error?.message ??
    queueQuery.error?.message ??
    todayStatsQuery.error?.message ??
    recentSwipesQuery.error?.message ??
    null;

  const swipe = useMutation({
    mutationFn: (args: {
      clusterId: string;
      searchId: string;
      outcome: "keep" | "skip" | "shortlist";
    }) => recordSwipe({ data: args }),
    // Optimistic: snapshot the current card, blank the cache so the
    // skeleton paints, then invalidate to fetch the next one.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: reviewCardQueryOptions.queryKey });
      const previous = qc.getQueryData<ReviewCard | null>(
        reviewCardQueryOptions.queryKey
      );
      qc.setQueryData<ReviewCard | null>(reviewCardQueryOptions.queryKey, null);
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData<ReviewCard | null>(
          reviewCardQueryOptions.queryKey,
          ctx.previous
        );
      }
      setError(e.message ?? "Couldn't record swipe");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: reviewCardQueryOptions.queryKey });
      qc.invalidateQueries({ queryKey: reviewQueueQueryOptions.queryKey });
      qc.invalidateQueries({
        queryKey: reviewTodayStatsQueryOptions.queryKey,
      });
      qc.invalidateQueries({
        queryKey: reviewRecentSwipesQueryOptions.queryKey,
      });
    },
  });

  const undo = useMutation({
    mutationFn: () => undoLastSwipe(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: reviewCardQueryOptions.queryKey });
      const previous = qc.getQueryData<ReviewCard | null>(
        reviewCardQueryOptions.queryKey
      );
      // Force a refetch on the next tick so the un-swiped card comes
      // back to the top of the queue.
      qc.setQueryData<ReviewCard | null>(reviewCardQueryOptions.queryKey, null);
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData<ReviewCard | null>(
          reviewCardQueryOptions.queryKey,
          ctx.previous
        );
      }
      setError(e.message ?? "Couldn't undo");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: reviewCardQueryOptions.queryKey });
      qc.invalidateQueries({ queryKey: reviewQueueQueryOptions.queryKey });
      qc.invalidateQueries({
        queryKey: reviewTodayStatsQueryOptions.queryKey,
      });
      qc.invalidateQueries({
        queryKey: reviewRecentSwipesQueryOptions.queryKey,
      });
    },
  });

  const pending = swipe.isPending || undo.isPending;

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
    });
  }, [card, navigate]);

  const doSelectQueueItem = useCallback(
    (clusterId: string) => {
      navigate({
        to: "/listings/$clusterId",
        params: { clusterId },
      });
    },
    [navigate]
  );

  const doChangeSearch = useCallback(() => {
    navigate({ to: "/searches" });
  }, [navigate]);

  // Keyboard shortcuts mirroring the on-screen hints:
  //   ← Skip   → Keep   S Shortlist   Z Undo   I Details
  // Skip the listener when the user is typing into a field.
  useEffect(() => {
    function isTextEntry(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }
      return target.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) {
        return;
      }
      switch (e.key) {
        case "ArrowLeft": {
          e.preventDefault();
          doSkip();
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          doKeep();
          break;
        }
        case "s":
        case "S": {
          e.preventDefault();
          doShortlist();
          break;
        }
        case "z":
        case "Z": {
          e.preventDefault();
          doUndo();
          break;
        }
        case "i":
        case "I": {
          e.preventDefault();
          doOpenDetail();
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSkip, doKeep, doShortlist, doUndo, doOpenDetail]);

  const banner = error ?? queryError;
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

      {card ? (
        <DesktopReview
          data={desktopData(card, queue, todayStats, recentSwipes)}
          disabled={pending}
          onChangeSearch={doChangeSearch}
          onKeep={doKeep}
          onOpenDetail={doOpenDetail}
          onSelectQueueItem={doSelectQueueItem}
          onShortlist={doShortlist}
          onSkip={doSkip}
          onUndo={doUndo}
        />
      ) : (
        <DesktopReviewEmpty hasQueryError={Boolean(queryError)} />
      )}

      <div className="mx-auto min-h-screen max-w-md bg-background pb-24 md:hidden">
        <ReviewHeader
          leftToday={card?.leftToday ?? 0}
          searchPill={card?.searchPill}
        />

        {card ? (
          <main className="space-y-4 pb-4">
            <ReviewCardView aiRules={aiRules} card={card} />
            <ActionButtons
              clusterId={card.cluster.id}
              disabled={pending}
              onKeep={doKeep}
              onShortlist={doShortlist}
              onSkip={doSkip}
              onUndo={doUndo}
            />
          </main>
        ) : (
          <ReviewEmpty />
        )}

        <BottomNav />
      </div>
    </>
  );
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
  recentSwipes: RecentSwipeEntry[] | null | undefined
): DesktopReviewData {
  const reviewedToday = todayStats?.reviewed ?? 0;
  const keptToday = todayStats?.kept ?? 0;
  const skippedToday = todayStats?.skipped ?? 0;
  return {
    searchPill: card.searchPill,
    headline: card.headlineListing.title,
    leftToday: card.leftToday,
    reviewedToday,
    keptToday,
    skippedToday,
    totalToday: card.leftToday + reviewedToday,
    queue: buildQueueData(card, queue),
    hero: buildHeroData(card),
    activity: buildActivity(recentSwipes ?? []),
    tip: undefined,
  };
}

/**
 * Shown above the `md` breakpoint when there's no current card —
 * either the queue is genuinely empty (all caught up, or no listings
 * yet) or one of the review queries errored. Keeps the sidebar shell
 * so the rest of the app's chrome stays consistent.
 */
function DesktopReviewEmpty({ hasQueryError }: { hasQueryError: boolean }) {
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
          <p className="mt-3 text-muted-foreground text-sm">
            {hasQueryError
              ? "Check the banner top-right for the underlying error. Refresh once it's resolved."
              : "Nothing left to swipe right now. New listings will land here as your searches keep scraping."}
          </p>
        </div>
      </div>
    </AdminSidebar>
  );
}

function buildActivity(
  entries: RecentSwipeEntry[]
): DesktopReviewData["activity"] {
  return entries.map((e) => ({
    verb: outcomeVerb(e.outcome),
    target: e.clusterTitle,
    meta: relativeTimeShort(e.createdAt),
    tone: e.outcome === "skip" ? "muted" : "primary",
  }));
}

function outcomeVerb(
  outcome: RecentSwipeEntry["outcome"]
): DesktopReviewData["activity"][number]["verb"] {
  if (outcome === "skip") {
    return "Skipped";
  }
  // Shortlist + Keep both surface as "Kept" in the rail. Shortlists
  // get their own surface on /shortlist so the rail doesn't need a
  // separate verb for them.
  return "Kept";
}

function relativeTimeShort(date: Date): string {
  const d = date instanceof Date ? date : new Date(date as unknown as string);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
  const listedPart = `Listed ${relativeListedAt(firstSeenAt)}`;
  return `${outcodePart} · ${listedPart}`;
}

function relativeListedAt(firstSeenAt: Date): string {
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
  const current = queueItemFromCard(card);
  if (!queue) {
    return {
      current,
      upcoming: [],
      remaining: card.leftToday,
    };
  }
  return {
    current,
    upcoming: queue.upcoming.map(queueItemFromReviewQueueItem),
    remaining: queue.remaining,
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
    // No `peareaceFlag` — blind review means we don't surface peer
    // outcomes until there's a mutual match. `suffix` shows "·N" when
    // the cluster appears on more than one portal.
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
