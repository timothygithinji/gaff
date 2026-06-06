/**
 * "All caught up" empty state for the mobile review queue.
 *
 * Rendered when `getNextReviewCard` returns `null` — no active searches
 * yet, or every cluster has been swiped. Uses the shared {@link EmptyState}
 * (card variant) with a nudge toward `/searches`.
 */
import { Link } from "@tanstack/react-router";
import { EmptyState } from "../ui/patterns/empty-state";

export function ReviewEmpty() {
  return (
    <div className="px-5 pt-12">
      <EmptyState
        action={
          <Link
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-semibold text-[14px] text-white"
            to="/searches"
          >
            Tune your searches
          </Link>
        }
        body="New listings will land here as your searches keep scraping your watched outcodes."
        eyebrow="Queue · empty"
        title="You're all caught up"
      />
    </div>
  );
}
