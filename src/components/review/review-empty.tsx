/**
 * "All caught up" empty state for the mobile review queue.
 *
 * Rendered when `getNextReviewCard` returns `null` — no active searches
 * yet, or every cluster has been swiped. Maritime card on the ground
 * background with a nudge toward `/searches`.
 */
import { Link } from "@tanstack/react-router";

export function ReviewEmpty() {
  return (
    <div className="px-5 pt-12">
      <div className="rounded-[2px] border border-line bg-paper p-8 text-center">
        <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
          Queue · empty
        </p>
        <h2 className="mt-2 font-semibold text-[20px] text-navy tracking-[-0.01em]">
          You're all caught up
        </h2>
        <p className="mt-2 text-[13px] text-slate">
          New listings will land here as your searches keep scraping your
          watched outcodes.
        </p>
        <Link
          className="mt-6 inline-flex items-center justify-center rounded-full bg-navy px-6 py-3 font-semibold text-[14px] text-white"
          to="/searches"
        >
          Tune your searches
        </Link>
      </div>
    </div>
  );
}
