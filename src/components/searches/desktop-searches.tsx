/**
 * Desktop Searches — portfolio view shown above the `md` breakpoint:
 *
 *   - HEADER : "Your watch list" eyebrow + page title + New search CTA;
 *              a four-up metric strip beneath (active / listings this
 *              week / in queue / spend) — all from live aggregations.
 *   - GRID   : 2-up card grid, one card per active `SearchRow` — name,
 *              status eyebrow, outcode chips, price band, portal pills,
 *              and a footer stats row (listings/wk · in queue · kept ·
 *              last run) from the portfolio payload. Paused searches
 *              use a warmer card surface so they read as inactive.
 *
 * Per-search cadence labels aren't included in the portfolio payload —
 * they live on Trigger.dev. v1 surfaces a coarse "Active" / "Paused"
 * eyebrow and defers a cadence-resolution step to a later pass.
 */
import {
  Add01Icon,
  Loading03Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import { type ReactNode, useEffect, useState } from "react";
import { queryKeys } from "../../lib/query-keys";
import { cn } from "../../lib/utils";
import {
  type SearchRow,
  type SearchesPerSearchStats,
  type SearchesPortfolio,
  runSearchNow,
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
  return (
    <AdminSidebar mode="desktop-only">
      <PageHeader />
      <MetricStrip totals={portfolio.totals} />
      <div className="flex min-w-0 flex-1 flex-wrap content-start gap-4 px-6 py-6 lg:px-10">
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
    </AdminSidebar>
  );
}

/* ---------------- Header + metrics ---------------- */

function PageHeader() {
  return (
    <header className="flex items-end justify-between gap-4 px-6 pt-9 pb-4 lg:px-10">
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
  const qc = useQueryClient();

  // The realtime subscription is keyed by a tag + access token returned
  // from runSearchNow. We store the latest active subscription here and
  // clear it once every spawned run reaches a terminal state. Re-clicks
  // overwrite this with a fresh tag, so the spinner never shows stale
  // status from a previous click.
  const [subscription, setSubscription] = useState<{
    tag: string;
    token: string;
  } | null>(null);

  // Each card owns its own pending state so spinners scope correctly
  // when several cards are clicked in quick succession.
  const runNow = useMutation({
    mutationFn: () => runSearchNow({ data: { id: search.id } }),
    onSuccess: (data) => {
      setSubscription({ tag: data.tag, token: data.publicAccessToken });
    },
  });

  // Subscribe to the tagged runs via Trigger.dev Realtime. The hook is
  // always mounted (rules of hooks) but `enabled: false` keeps it
  // dormant until the user actually clicks.
  const realtime = useRealtimeRunsWithTag(subscription?.tag ?? "", {
    accessToken: subscription?.token,
    enabled: Boolean(subscription),
  });

  // Treat the spawned batch as "active" until every run that's appeared
  // is in a terminal state. We also wait until at least one run shows
  // up so the spinner doesn't flicker off in the gap between mutation
  // success and the first realtime push.
  const TERMINAL: ReadonlySet<string> = new Set([
    "COMPLETED",
    "FAILED",
    "CANCELED",
    "CRASHED",
    "INTERRUPTED",
    "SYSTEM_FAILURE",
    "TIMED_OUT",
    "EXPIRED",
  ]);
  const expectedRunCount = search.portals.length;
  const runs = realtime.runs ?? [];
  const allLanded =
    runs.length >= expectedRunCount &&
    runs.every((r) => TERMINAL.has(r.status));

  // Drop the subscription once everything finishes so the hook stops
  // streaming. Also invalidate the portfolio query so stats refresh.
  useEffect(() => {
    if (subscription && allLanded) {
      setSubscription(null);
      qc.invalidateQueries({ queryKey: queryKeys.searches() });
    }
  }, [subscription, allLanded, qc]);

  const scraping = runNow.isPending || subscription !== null;
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
        {/* Run-now button. Stays in the "scraping" state from the
            moment the user clicks until every spawned per-portal run
            reaches a terminal status (subscribed live via
            useRealtimeRunsWithTag). The card itself is a <Link>, so
            onClick must stop propagation + preventDefault so clicking
            the button doesn't also navigate to the edit page. */}
        <button
          aria-label={scraping ? "Scrape in progress" : "Run scrape now"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-100"
          disabled={scraping}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runNow.mutate();
          }}
          type="button"
        >
          <HugeiconsIcon
            className={scraping ? "animate-spin text-primary" : undefined}
            icon={scraping ? Loading03Icon : Refresh01Icon}
            size={13}
            strokeWidth={1.6}
          />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <OutcodeChip>{search.location.name}</OutcodeChip>
        {search.excludeLocations.map((loc) => (
          <OutcodeChip key={loc.placeId || loc.name} muted>
            ~{loc.name}
          </OutcodeChip>
        ))}
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
        muted
          ? "bg-muted text-muted-foreground"
          : "bg-foreground/10 text-foreground"
      )}
    >
      {children}
    </span>
  );
}

function PortalChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-1 font-semibold text-[11px] text-background">
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

/**
 * Compact relative-time formatter — "12m" / "3h" / "2d" / "5w". Used
 * inside chip-sized stats.
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
