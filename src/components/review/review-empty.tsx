/**
 * "You're all caught up" empty state for the review queue.
 *
 * Rendered when `getNextReviewCard` returns `null` — either because the
 * household has no active searches yet, or because every cluster has
 * been swiped or skipped. Bone card on a ground background with a
 * gentle nudge towards `/searches`.
 */
import { Link } from "@tanstack/react-router";

export function ReviewEmpty() {
  return (
    <div className="px-5 pt-12">
      <div className="rounded-2xl bg-muted p-8 text-center">
        <p className="font-serif text-2xl text-foreground">
          You're all caught up
        </p>
        <p className="mt-2 text-muted-foreground text-sm">
          0 left today. New listings will land here as the scraper sweeps your
          watched outcodes.
        </p>
        <Link
          className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground text-sm"
          to="/searches"
        >
          Tune your searches
        </Link>
      </div>
    </div>
  );
}
