/**
 * Desktop Searches — portfolio view shown at the `lg` breakpoint and up,
 * rebuilt to match the Paper "Searches · Desktop" artboard (3D8-0).
 *
 *   - HEADER : "N watching · M paused · ~$X/day est." eyebrow + the
 *     "Searches" page title (Inter 600, 40px) + a navy "New search" CTA.
 *   - GRID   : a 3-up card grid (one card per `SearchRow`) followed by a
 *     dashed "Add another search" tile that spans the full row. Each
 *     card carries a status row (copper dot + ACTIVE / slate dot +
 *     PAUSED), the search name, a `2-bed · £x–y · N outcodes` subline, a
 *     three-cell stat strip (New/wk · In queue · Kept 30d) over a
 *     hairline, and a footer "Every Nhr · ran Xm ago" with a clock icon.
 *     Paused cards drop the stat strip and footer for a "Paused …" line
 *     plus a "Resume watching" affordance.
 *
 * Relative-time labels render an absolute date on the server / first
 * paint, then swap to the friendly relative string after mount, so SSR
 * and first client render agree (no hydration drift).
 */
import { Add01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import type {
  SearchRow,
  SearchesPerSearchStats,
  SearchesPortfolio,
} from "../../server/functions/searches";
import { AdminSidebar } from "../layout/admin-sidebar";

type Props = {
  searches: SearchRow[];
  portfolio: SearchesPortfolio;
  cadenceBySearch: Map<string, string>;
};

export function DesktopSearches({
  searches,
  portfolio,
  cadenceBySearch,
}: Props) {
  const statsBySearch = new Map(
    portfolio.perSearch.map((s) => [s.searchId, s])
  );
  return (
    <AdminSidebar mode="desktop-only">
      <PageHeader totals={portfolio.totals} />
      <div className="grid w-full grid-cols-1 gap-5 px-6 pb-10 sm:grid-cols-2 lg:grid-cols-3 lg:px-10">
        {searches.length === 0 ? (
          <EmptyState full />
        ) : (
          <>
            {searches.map((s) => (
              <SearchCard
                cadenceLabel={cadenceBySearch.get(s.id) ?? null}
                key={s.id}
                search={s}
                stats={statsBySearch.get(s.id) ?? null}
              />
            ))}
          </>
        )}
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Header ---------------- */

function PageHeader({ totals }: { totals: SearchesPortfolio["totals"] }) {
  return (
    <header className="flex items-end justify-between gap-4 px-6 pt-5 pb-7 lg:px-10">
      <div className="flex flex-col gap-1.5">
        <p className="font-normal text-[11px] text-slate uppercase tracking-[0.14em]">
          {summaryEyebrow(totals)}
        </p>
        <h1 className="font-semibold text-[40px] text-navy leading-[48px] tracking-[-0.025em]">
          Searches
        </h1>
      </div>
      <Link
        className='inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-[22px] py-3 font-medium text-[#eef1f4] text-[13px]'
        to="/searches/new"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
        <span>New search</span>
      </Link>
    </header>
  );
}

function summaryEyebrow(totals: SearchesPortfolio["totals"]): string {
  const paused = Math.max(0, totals.totalSearches - totals.activeSearches);
  const parts = [`${totals.activeSearches} watching`];
  if (paused > 0) {
    parts.push(`${paused} paused`);
  }
  return parts.join(" · ");
}

/* ---------------- Search card ---------------- */

function SearchCard({
  search,
  stats,
  cadenceLabel,
}: {
  search: SearchRow;
  stats: SearchesPerSearchStats | null;
  cadenceLabel: string | null;
}) {
  const paused = !search.active;
  return (
    <Link
      className="flex flex-col gap-4 rounded-lg border border-line bg-paper p-6"
      params={{ id: search.id }}
      to="/searches/$id"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <StatusRow paused={paused} />
        <h2 className="truncate font-semibold text-[19px] text-navy leading-6">
          {search.name}
        </h2>
        <p className="truncate text-[12px] text-slate leading-4">
          {subline(search)}
        </p>
      </div>
      {paused ? (
        <PausedFooter search={search} stats={stats} />
      ) : (
        <>
          <StatStrip stats={stats} />
          <RunFooter cadenceLabel={cadenceLabel} stats={stats} />
        </>
      )}
    </Link>
  );
}

function StatusRow({ paused }: { paused: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          paused ? "bg-slate-2" : "bg-copper"
        )}
      />
      <span
        className={cn(
          "font-semibold text-[10px] uppercase tracking-[0.14em]",
          paused ? "text-slate-2" : "text-copper"
        )}
      >
        {paused ? "Paused" : "Active"}
      </span>
    </span>
  );
}

function StatStrip({ stats }: { stats: SearchesPerSearchStats | null }) {
  return (
    <div className="flex border-mist border-t pt-3.5">
      <StatCell
        first
        label="New / wk"
        value={stats ? String(stats.listingsThisWeek) : "—"}
      />
      <StatCell
        label="In queue"
        value={stats ? String(stats.inQueue) : "—"}
      />
      <StatCell
        label="Kept 30d"
        last
        value={stats ? String(stats.keptLast30d) : "—"}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  first,
  last,
}: {
  label: string;
  value: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-0.5",
        first && "border-mist border-r pr-2.5",
        !(first || last) && "border-mist border-r px-2.5",
        last && "pl-2.5"
      )}
    >
      <span className="text-[9px] text-slate uppercase tracking-[0.14em]">
        {label}
      </span>
      <span className="font-medium text-[22px] text-navy leading-7">
        {value}
      </span>
    </div>
  );
}

function RunFooter({
  cadenceLabel,
  stats,
}: {
  cadenceLabel: string | null;
  stats: SearchesPerSearchStats | null;
}) {
  const ran = useRelativeTime(stats?.lastRunAt ?? null);
  const cadence = cadenceLabel ? cadenceLabel : "On demand";
  return (
    <div className="flex items-center gap-1.5">
      <HugeiconsIcon
        className="shrink-0 text-slate"
        icon={Clock01Icon}
        size={12}
        strokeWidth={1.6}
      />
      <span className="text-[11px] text-slate leading-[14px]">
        {cadence}
        {ran ? ` · ran ${ran}` : ""}
      </span>
    </div>
  );
}

function PausedFooter({
  search,
  stats,
}: {
  search: SearchRow;
  stats: SearchesPerSearchStats | null;
}) {
  const since = useRelativeTime(search.updatedAt);
  const queue = stats?.inQueue ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-slate leading-4">
        {since ? `Paused ${since}` : "Paused"}
        {queue > 0 ? ` · ${queue} still in queue when you stopped` : ""}
      </p>
      <span className="inline-flex w-fit items-center rounded-md border border-line bg-paper px-3.5 py-2 text-[12px] text-navy">
        Resume watching
      </span>
    </div>
  );
}

/* ---------------- Empty state ---------------- */

function EmptyState({ full }: { full?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-line bg-paper px-8 py-12 text-center",
        full && "col-span-full"
      )}
    >
      <p className="font-semibold text-[20px] text-navy">No searches yet</p>
      <p className="max-w-[420px] text-[13px] text-slate">
        Start watching a corner of the rental market. Pick your area, beds, and
        budget — we'll tell you what's worth a viewing.
      </p>
      <Link
        className='mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 font-medium text-[#eef1f4] text-[13px]'
        to="/searches/new"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
        Create your first search
      </Link>
    </div>
  );
}

/* ---------------- Shared helpers ---------------- */

export function subline(search: SearchRow): string {
  const beds = bedLabel(search.minBedrooms, search.maxBedrooms);
  const price = priceBand(search.minPrice, search.maxPrice);
  const outcodes = outcodeCount(search);
  return [beds, price, outcodes].filter(Boolean).join(" · ");
}

function outcodeCount(search: SearchRow): string {
  const covering = search.location.coveringOutcodes;
  if (covering && covering.length > 0) {
    return `${covering.length} outcode${covering.length === 1 ? "" : "s"}`;
  }
  // Postcode-typed searches are a single outcode.
  return "1 outcode";
}

function priceBand(min: number | null, max: number | null): string {
  if (min === null && max === null) {
    return "Any price";
  }
  if (min === 0 && max !== null) {
    return `< £${max.toLocaleString("en-GB")}`;
  }
  const lo = min === null ? "—" : `£${min.toLocaleString("en-GB")}`;
  const hi = max === null ? "—" : max.toLocaleString("en-GB");
  return `${lo}–${hi}`;
}

function bedLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) {
    return "Any size";
  }
  if (min === 0) {
    return "Studio";
  }
  if (min !== null && max !== null && min === max) {
    return `${min}-bed`;
  }
  if (min !== null) {
    return `${min}-bed`;
  }
  return `Up to ${max}-bed`;
}

/**
 * Compact relative-time label — "32m" / "3h" / "2d" / "5w". Renders an
 * empty string on the server / first paint, then the relative string
 * after mount, so SSR and first client render agree.
 */
function useRelativeTime(date: Date | null): string {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!(mounted && date)) {
    return "";
  }
  return relativeShort(date);
}

function relativeShort(date: Date): string {
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
    return `${hours}hr ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
