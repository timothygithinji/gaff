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
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BottomNav } from "../components/layout/bottom-nav";
import { ActionButtons } from "../components/review/action-buttons";
import {
  DESKTOP_REVIEW_PLACEHOLDER,
  DesktopReview,
  type DesktopReviewData,
} from "../components/review/desktop-review";
import { ReviewCardView } from "../components/review/review-card";
import { ReviewEmpty } from "../components/review/review-empty";
import { ReviewHeader } from "../components/review/review-header";
import { requireSession } from "../lib/auth-guard";
import { queryKeys } from "../lib/query-keys";
import {
  type ReviewCard,
  getNextReviewCard,
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

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/");
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(reviewCardQueryOptions),
  component: ReviewPage,
});

function ReviewPage() {
  const qc = useQueryClient();
  const { data: card } = useQuery(reviewCardQueryOptions);
  const [error, setError] = useState<string | null>(null);

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
    },
  });

  const pending = swipe.isPending || undo.isPending;

  // The aiRules on the card's search are read by the FeaturePills
  // filter. We don't fetch the full search server-side — we just send
  // the relevant pill keys with the card payload. Until that wire
  // change lands, fall back to "show all" by passing an empty rules
  // list.
  const aiRules = readAiRules({ rules: [], excludeOutcodes: [] });

  return (
    <>
      {error ? (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-foreground px-4 py-3 text-primary-foreground text-sm shadow-lg"
        >
          {error}
        </div>
      ) : null}

      <DesktopReview data={desktopData(card)} />

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
              onKeep={() =>
                swipe.mutate({
                  clusterId: card.cluster.id,
                  searchId: card.searchId,
                  outcome: "keep",
                })
              }
              onShortlist={() =>
                swipe.mutate({
                  clusterId: card.cluster.id,
                  searchId: card.searchId,
                  outcome: "shortlist",
                })
              }
              onSkip={() =>
                swipe.mutate({
                  clusterId: card.cluster.id,
                  searchId: card.searchId,
                  outcome: "skip",
                })
              }
              onUndo={() => undo.mutate()}
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
 * Overlay the real card's `searchPill` and `leftToday` onto the desktop
 * placeholder so the header isn't lying. The queue / Partner-activity
 * panels stay on the placeholder fixture until those features land
 * (separate server functions, not in this PR).
 */
function desktopData(card: ReviewCard | null | undefined): DesktopReviewData {
  if (!card) {
    return DESKTOP_REVIEW_PLACEHOLDER;
  }
  return {
    ...DESKTOP_REVIEW_PLACEHOLDER,
    searchPill: card.searchPill,
    leftToday: card.leftToday,
  };
}
