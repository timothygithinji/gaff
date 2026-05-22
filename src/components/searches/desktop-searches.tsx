/**
 * Desktop Searches — portfolio view shown above the `md` breakpoint:
 *
 *   - HEADER  : "Your watch list" eyebrow + page title + New search CTA;
 *               a four-up metric strip beneath (active / listings this
 *               week / in queue / spend) — all from live aggregations.
 *   - LEFT    : 2-up card grid, one card per active `SearchRow` — name,
 *               status eyebrow, outcode chips, price band, portal pills,
 *               and a footer stats row (listings/wk · in queue · kept ·
 *               last run) from the portfolio payload. Paused searches
 *               use a warmer card surface so they read as inactive.
 *   - RIGHT   : "This week" pulse card with a 7-day mini bar chart from
 *               real day-bucketed listings; an archived snippet showing
 *               searches with `active=false`.
 *
 * Per-search cadence labels aren't included in the portfolio payload —
 * they live on Trigger.dev. v1 surfaces a coarse "Active" / "Paused"
 * eyebrow and defers a cadence-resolution step to a later pass.
 */
import { Add01Icon, Edit02Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
  const activeSearches = searches.filter((s) => s.active);
  const archivedSearches = searches.filter((s) => !s.active);
  return (
    <AdminSidebar mode="desktop-only">
      <PageHeader />
      <MetricStrip totals={portfolio.totals} />
      <div className="flex min-w-0 flex-1 gap-6 px-10 py-6">
        <div className="flex min-w-0 flex-1 flex-wrap content-start gap-4">
          {searches.length === 0 ? (
            <EmptyState />
          ) : (
            activeSearches.map((s) => (
              <SearchCard
                cadenceLabel={cadenceBySearch.get(s.id) ?? null}
                key={s.id}
                search={s}
                stats={statsBySearch.get(s.id) ?? null}
              />
            ))
          )}
        </div>
        <aside className="flex w-[300px] shrink-0 flex-col gap-3.5">
          <PulseCard
            deltaPct={portfolio.totals.listingsThisWeekDeltaPct}
            pulse={portfolio.pulseLast7Days}
            total={portfolio.totals.listingsThisWeek}
          />
          {archivedSearches.length > 0 ? (
            <ArchivedCard searches={archivedSearches} />
          ) : null}
        </aside>
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Header + metrics ---------------- */

function PageHeader() {
  return (
    <header className="flex items-end justify-between px-10 pt-9 pb-4">
      <div className="flex flex-col gap-1">
        <Eyebrow>Your watch list</Eyebrow>
        <h1 className="font-serif text-[40px] text-foreground leading-[44px] tracking-tight">
          Searches
        </h1>
      </div>
      <Link
        className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-bone text-xs"
        to="/searches/new"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
        <span className="font-semibold">New search</span>
      </Link>
    </header>
  );
}

function MetricStrip({
  totals,
}: {
  totals: SearchesPortfolio["totals"];
}) {
  const deltaLabel = formatDelta(totals.listingsThisWeekDeltaPct);
  const spendPct =
    totals.spendCapUsd === 0
      ? 0
      : Math.round((totals.spendThisMonthUsd / totals.spendCapUsd) * 100);
  return (
    <div className="mx-10 flex items-stretch border-bone border-y">
      <Metric
        label="Active"
        meta={`of ${totals.totalSearches} ${totals.totalSearches === 1 ? "search" : "searches"}`}
        value={totals.activeSearches}
      />
      <span className="w-px self-stretch bg-bone" />
      <Metric
        accent={deltaLabel ? deltaLabel.color : undefined}
        accentMeta={deltaLabel?.label}
        label="Listings · this week"
        value={totals.listingsThisWeek}
      />
      <span className="w-px self-stretch bg-bone" />
      <Metric
        label="In your queue"
        meta="to review"
        value={totals.inQueueTotal}
      />
      <span className="w-px self-stretch bg-bone" />
      <Metric
        label="Spend · this month"
        meta={`${spendPct}% of $${totals.spendCapUsd.toFixed(0)} cap`}
        rawValue={`$${totals.spendThisMonthUsd.toFixed(2)}`}
      />
    </div>
  );
}

function formatDelta(pct: number): { label: string; color: string } | null {
  if (!Number.isFinite(pct) || pct === 0) {
    return null;
  }
  const arrow = pct >= 0 ? "▲" : "▼";
  const color = pct >= 0 ? "text-[#5D7A4A]" : "text-[#B05A38]";
  return { label: `${arrow} ${Math.abs(Math.round(pct))}%`, color };
}

function Metric({
  label,
  value,
  rawValue,
  meta,
  accentMeta,
  accent,
}: {
  label: string;
  value?: number;
  rawValue?: string;
  meta?: string;
  accentMeta?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1 py-4 first:pr-1 [&:not(:first-child)]:pl-6">
      <Eyebrow strong>{label}</Eyebrow>
      <div className="flex items-baseline gap-1.5">
        <span className="font-serif text-[30px] text-foreground">
          {rawValue ?? value}
        </span>
        {accentMeta ? (
          <span
            className={cn(
              "font-semibold text-[11px]",
              accent ?? "text-primary"
            )}
          >
            {accentMeta}
          </span>
        ) : null}
        {meta ? (
          <span className="text-[11px] text-muted-foreground">{meta}</span>
        ) : null}
      </div>
    </div>
  );
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
  const visibleOutcodes = search.outcodes.slice(0, 4);
  const overflow = search.outcodes.length - visibleOutcodes.length;
  return (
    <Link
      className={cn(
        "flex w-[calc(50%-0.5rem)] flex-col gap-3.5 rounded-2xl border px-[22px] py-5",
        paused ? "border-bone bg-[#FBF8EF]" : "border-border bg-card"
      )}
      params={{ id: search.id }}
      to="/searches/$id"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <StatusEyebrow
            cadenceLabel={cadenceLabel}
            lastRunAt={stats?.lastRunAt ?? null}
            paused={paused}
          />
          <h2 className="font-serif text-[22px] text-foreground leading-[26px]">
            {search.name}
          </h2>
        </div>
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"
        >
          <HugeiconsIcon
            icon={paused ? PlayIcon : Edit02Icon}
            size={13}
            strokeWidth={1.6}
          />
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visibleOutcodes.map((code) => (
          <OutcodeChip key={code}>{code}</OutcodeChip>
        ))}
        {overflow > 0 ? (
          <OutcodeChip muted>+{overflow} more</OutcodeChip>
        ) : null}
      </div>
      <div className="flex items-center gap-3.5">
        <span className="font-serif text-[16px] text-foreground">
          {priceBand(search.minPrice, search.maxPrice)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {bedLabel(search.minBedrooms, search.maxBedrooms)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {search.portals.map((p) => (
          <PortalChip key={p}>{portalLabel(p)}</PortalChip>
        ))}
      </div>
      <CardStats stats={stats} />
    </Link>
  );
}

function StatusEyebrow({
  paused,
  lastRunAt,
  cadenceLabel,
}: {
  paused: boolean;
  lastRunAt: Date | null;
  cadenceLabel: string | null;
}) {
  const runLabel = lastRunAt
    ? `last scrape ${relativeShort(lastRunAt)}`
    : "no runs yet";
  const cadencePart =
    !paused && cadenceLabel ? `${cadenceLabel.toLowerCase()} · ` : "";
  if (paused) {
    return (
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        Paused · {runLabel}
      </span>
    );
  }
  return (
    <span className="font-semibold text-[#5D7A4A] text-[10px] uppercase tracking-[0.12em]">
      Active · {cadencePart}
      {runLabel}
    </span>
  );
}

function OutcodeChip({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[11px]",
        muted ? "bg-bone text-muted-foreground" : "bg-[#F0E6D2] text-foreground"
      )}
    >
      {children}
    </span>
  );
}

function PortalChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-1 font-semibold text-[11px] text-white">
      {children}
    </span>
  );
}

function CardStats({ stats }: { stats: SearchesPerSearchStats | null }) {
  return (
    <div className="flex items-stretch gap-2 border-[#F2EBDE] border-t pt-3">
      <StatCell
        label="Listings · wk"
        value={stats ? String(stats.listingsThisWeek) : "—"}
      />
      <StatCell
        accent="text-primary"
        label="In queue"
        value={stats ? String(stats.inQueue) : "—"}
      />
      <StatCell
        label="Kept · 30d"
        value={stats ? String(stats.keptLast30d) : "—"}
      />
      <StatCell
        label="Last run"
        value={stats?.lastRunAt ? relativeShort(stats.lastRunAt) : "—"}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  meta,
  accent,
}: {
  label: string;
  value: string;
  meta?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={cn("font-serif text-[18px]", accent ?? "text-foreground")}
        >
          {value}
        </span>
        {meta ? (
          <span className="text-[10px] text-muted-foreground">{meta}</span>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Right rail ---------------- */

function PulseCard({
  pulse,
  total,
  deltaPct,
}: {
  pulse: number[];
  total: number;
  deltaPct: number;
}) {
  // Compute the bar labels relative to today. Index 0 is 6 days ago,
  // index 6 is today — render shortest 1-letter day labels so the
  // column stays narrow.
  const dayLabels = computeDayLabels(7);
  const todayIndex = 6;
  const max = Math.max(1, ...pulse);
  const delta = formatDelta(deltaPct);
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <Eyebrow>This week · all searches</Eyebrow>
        {delta ? (
          <span className={cn("font-semibold text-[11px]", delta.color)}>
            {delta.label}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-serif text-[38px] text-foreground leading-none tracking-tight">
          {total}
        </span>
        <span className="text-[12px] text-muted-foreground">
          new listing{total === 1 ? "" : "s"} reached you
        </span>
      </div>
      <div className="flex h-14 items-end gap-1">
        {pulse.map((count, i) => {
          // Always paint a thin sliver even at zero so the chart's
          // baseline stays visible — otherwise empty days vanish.
          const pct = max === 0 ? 0 : (count / max) * 100;
          const minPct = 6;
          return (
            <span
              className={cn(
                "flex-1 rounded-sm",
                i === todayIndex ? "bg-primary" : "bg-[#F0E6D2]"
              )}
              key={dayLabels[i]}
              style={{ height: `${Math.max(minPct, pct)}%` }}
              title={`${count} listing${count === 1 ? "" : "s"}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        {dayLabels.map((d, i) => (
          <span
            className={cn(
              "text-[10px]",
              i === todayIndex ? "font-semibold text-primary" : "text-[#B5A893]"
            )}
            key={`${d}-${i}`}
          >
            {d}
          </span>
        ))}
      </div>
    </article>
  );
}

function ArchivedCard({ searches }: { searches: SearchRow[] }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-[18px] py-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Archived · {searches.length}</Eyebrow>
      </div>
      <div className="flex flex-col">
        {searches.map((s, i) => (
          <ArchivedRow
            ageLabel={`Paused ${relativeShort(s.updatedAt)}`}
            id={s.id}
            isLast={i === searches.length - 1}
            key={s.id}
            name={s.name}
          />
        ))}
      </div>
    </article>
  );
}

function ArchivedRow({
  name,
  ageLabel,
  id,
  isLast = false,
}: {
  name: string;
  ageLabel: string;
  id: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2",
        !isLast && "border-[#F2EBDE] border-b"
      )}
    >
      <div className="flex flex-col gap-px">
        <span className="font-serif text-[13px] text-foreground">{name}</span>
        <span className="text-[10px] text-muted-foreground">{ageLabel}</span>
      </div>
      <Link
        className="text-[11px] text-primary"
        params={{ id }}
        to="/searches/$id"
      >
        Manage
      </Link>
    </div>
  );
}

/**
 * Day-of-week labels for the last `count` days ending today. Returns
 * 1-letter labels (`M`, `T`, `W`, etc.) in chronological order so the
 * pulse chart's index 6 is always today.
 */
function computeDayLabels(count: number): string[] {
  const labels: string[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    labels.push(
      d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 1)
    );
  }
  return labels;
}

/**
 * Compact relative-time formatter — "12m" / "3h" / "2d" / "5w". Used
 * inside chip-sized stats and archived rows.
 */
function relativeShort(date: Date): string {
  const d = date instanceof Date ? date : new Date(date as unknown as string);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w`;
  }
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

/* ---------------- Empty state ---------------- */

function EmptyState() {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-border bg-card px-8 py-12 text-center">
      <p className="font-serif text-[24px] text-foreground">No searches yet</p>
      <p className="max-w-[420px] text-[13px] text-muted-foreground">
        Start watching a corner of the rental market. Pick your outcodes, beds,
        and budget — we'll tell you what's worth a viewing.
      </p>
      <Link
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 font-semibold text-[12px] text-primary-foreground"
        to="/searches/new"
      >
        <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} />
        Create your first search
      </Link>
    </div>
  );
}

/* ---------------- Atoms + helpers ---------------- */

function Eyebrow({
  children,
  tone = "muted",
  strong = false,
}: {
  children: ReactNode;
  tone?: "muted" | "primary";
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-semibold uppercase",
        strong
          ? "text-[10px] tracking-[0.12em]"
          : "text-[11px] tracking-[0.12em]",
        tone === "primary" ? "text-primary" : "text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function priceBand(min: number | null, max: number | null): string {
  if (min === null && max === null) {
    return "Any price";
  }
  const lo = min === null ? "—" : `£${min.toLocaleString("en-GB")}`;
  const hi = max === null ? "—" : `£${max.toLocaleString("en-GB")}`;
  return `${lo}–${hi}`;
}

function bedLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) {
    return "Any size · 1+ bath";
  }
  if (min === 0 && max === 0) {
    return "Studio · 1+ bath";
  }
  if (min !== null && max !== null && min === max) {
    return `${min} bed · 1+ bath`;
  }
  if (min !== null && max !== null) {
    return `${min}-${max} bed · 1+ bath`;
  }
  if (min !== null) {
    return `${min}+ bed · 1+ bath`;
  }
  return `Up to ${max} bed · 1+ bath`;
}

function portalLabel(portal: string): string {
  if (portal === "rightmove") {
    return "Rightmove";
  }
  if (portal === "zoopla") {
    return "Zoopla";
  }
  if (portal === "openrent") {
    return "OpenRent";
  }
  return portal;
}
