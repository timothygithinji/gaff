/**
 * "N deferred" affordance for the mobile review header — a self-contained
 * link to the `/deferred` tray so parked listings stay discoverable from
 * the screen they were parked on. Renders nothing when none are deferred,
 * so it never clutters an empty queue. Shares the `/deferred` page's query
 * cache, so the count and the page agree.
 */
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { deferralsQueryOptions } from "../../lib/deferrals-query";

export function DeferredHeaderLink() {
  const { data } = useQuery(deferralsQueryOptions);
  const count = data?.length ?? 0;
  if (count === 0) {
    return null;
  }
  return (
    <Link
      className="flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 font-semibold text-[11px] text-slate transition-colors hover:text-navy"
      to="/deferred"
    >
      <HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={1.8} />
      {count} deferred
    </Link>
  );
}
