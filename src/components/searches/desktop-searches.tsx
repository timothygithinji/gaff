/**
 * Desktop Searches — portfolio view shown above the `md` breakpoint.
 * Mirrors the `Desktop · Searches` artboard:
 *
 *   - HEADER  : "Your watch list" eyebrow + page title + Sort + New
 *               search CTA; a four-up metric strip beneath (active /
 *               listings this week / in queue / spend).
 *   - LEFT    : 2x2 card grid, one card per `SearchRow` — name, status
 *               eyebrow, outcode chips, price band, portal pills, and
 *               a footer stats row (listings/wk · in queue · kept ·
 *               last run). Paused searches use a warmer card surface
 *               so they read as inactive.
 *   - RIGHT   : "This week" pulse card with a 7-day mini bar chart,
 *               AI suggestions ("Drop the cap", "Drop E5", …), and an
 *               archived snippet with restore actions.
 *
 * Real data flows: the per-card name, outcodes, price band, beds, and
 * portals are sourced from the live `SearchRow`. Cadence labels, stats,
 * suggestions, the pulse chart, and the archived list are placeholder
 * fixtures — those features don't have server functions yet.
 */
import {
  Add01Icon,
  AiMagicIcon,
  Edit02Icon,
  PauseIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { SearchRow } from "../../server/functions/searches";
import { AdminSidebar } from "../layout/admin-sidebar";

type Props = {
  searches: SearchRow[];
};

export function DesktopSearches({ searches }: Props) {
  const activeCount = searches.filter((s) => s.active).length;
  return (
    <div className="hidden min-h-screen bg-ground md:flex">
      <AdminSidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <PageHeader />
        <MetricStrip activeCount={activeCount} totalCount={searches.length} />
        <div className="flex min-w-0 flex-1 gap-6 px-10 py-6">
          <div className="flex min-w-0 flex-1 flex-wrap content-start gap-4">
            {searches.length === 0 ? (
              <EmptyState />
            ) : (
              searches.map((s) => <SearchCard key={s.id} search={s} />)
            )}
          </div>
          <aside className="flex w-[300px] shrink-0 flex-col gap-3.5">
            <PulseCard />
            <SuggestionsCard />
            <ArchivedCard />
          </aside>
        </div>
      </main>
    </div>
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
      <div className="flex items-center gap-2.5">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-foreground text-xs"
          type="button"
        >
          <span className="font-medium">Sort · most active</span>
        </button>
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-bone text-xs"
          to="/searches/new"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
          <span className="font-semibold">New search</span>
        </Link>
      </div>
    </header>
  );
}

function MetricStrip({
  activeCount,
  totalCount,
}: {
  activeCount: number;
  totalCount: number;
}) {
  return (
    <div className="mx-10 flex items-stretch border-bone border-y">
      <Metric
        label="Active"
        meta={`of ${totalCount} ${totalCount === 1 ? "search" : "searches"}`}
        value={activeCount}
      />
      <span className="w-px self-stretch bg-bone" />
      <Metric
        accent="text-[#5D7A4A]"
        accentMeta="▲ 18%"
        label="Listings · this week"
        value={312}
      />
      <span className="w-px self-stretch bg-bone" />
      <Metric label="In your queue" meta="to review today" value={23} />
      <span className="w-px self-stretch bg-bone" />
      <Metric label="Spend · this month" meta="of $15 cap" rawValue="$8.42" />
    </div>
  );
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

function SearchCard({ search }: { search: SearchRow }) {
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
          <StatusEyebrow paused={paused} />
          <h2 className="font-serif text-[22px] text-foreground leading-[26px]">
            {search.name}
          </h2>
        </div>
        <CardActions paused={paused} />
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
      <CardStats lastRunMinutes={paused ? -1 : 12} />
    </Link>
  );
}

function StatusEyebrow({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        Paused · last scrape 2 days ago
      </span>
    );
  }
  return (
    <span className="font-semibold text-[#5D7A4A] text-[10px] uppercase tracking-[0.12em]">
      Active · scrapes every 4h
    </span>
  );
}

function CardActions({ paused }: { paused: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        aria-label="Edit search"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-foreground"
        onClick={(e) => e.preventDefault()}
        type="button"
      >
        <HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={1.6} />
      </button>
      <button
        aria-label={paused ? "Resume search" : "Pause search"}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-foreground"
        onClick={(e) => e.preventDefault()}
        type="button"
      >
        <HugeiconsIcon
          icon={paused ? PlayIcon : PauseIcon}
          size={13}
          strokeWidth={1.6}
        />
      </button>
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

function CardStats({ lastRunMinutes }: { lastRunMinutes: number }) {
  return (
    <div className="flex items-stretch gap-2 border-[#F2EBDE] border-t pt-3">
      <StatCell label="Listings · wk" value="142" />
      <StatCell accent="text-primary" label="In queue" value="22" />
      <StatCell label="Kept · 30d" value="3" />
      <StatCell
        label="Last run"
        meta="ago"
        value={lastRunMinutes < 0 ? "2d" : `${lastRunMinutes}m`}
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

function PulseCard() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const heights = [30, 45, 38, 65, 80, 55, 72];
  const todayIndex = 4;
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <Eyebrow>This week · all searches</Eyebrow>
        <span className="font-semibold text-[#5D7A4A] text-[11px]">▲ 18%</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-serif text-[38px] text-foreground leading-none tracking-tight">
          312
        </span>
        <span className="text-[12px] text-muted-foreground">
          new listings reached you
        </span>
      </div>
      <div className="flex h-14 items-end gap-1">
        {heights.map((h, i) => (
          <span
            className={cn(
              "flex-1 rounded-sm",
              i === todayIndex ? "bg-primary" : "bg-[#F0E6D2]"
            )}
            key={days[i]}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        {days.map((d, i) => (
          <span
            className={cn(
              "text-[10px]",
              i === todayIndex ? "font-semibold text-primary" : "text-[#B5A893]"
            )}
            key={d}
          >
            {d}
          </span>
        ))}
      </div>
    </article>
  );
}

function SuggestionsCard() {
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-[18px] py-4">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon
          className="text-primary"
          icon={AiMagicIcon}
          size={12}
          strokeWidth={2}
        />
        <Eyebrow tone="primary">Tune your searches</Eyebrow>
      </div>
      <ul className="flex flex-col gap-3">
        <Suggestion
          body="You kept 4 / 6 under that — saves ~18 viewings."
          tone="primary"
          title="North London cap to £2,500"
        />
        <Suggestion
          body="0 keeps in 30 days. 12 listings drifted past."
          tone="muted"
          title="East London · drop E5"
        />
        <Suggestion
          body="No keeps since you toggled it on."
          tone="muted"
          title="Pause the studio search?"
        />
      </ul>
    </article>
  );
}

function Suggestion({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "primary" | "muted";
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "primary" ? "bg-primary" : "bg-[#C7A87C]"
        )}
      />
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-[12px] text-foreground leading-4">
          {title}
        </p>
        <p className="text-[11px] text-muted-foreground leading-[15px]">
          {body}
        </p>
      </div>
    </li>
  );
}

function ArchivedCard() {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-[18px] py-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Archived · 2</Eyebrow>
        <button className="font-medium text-[11px] text-primary" type="button">
          See all
        </button>
      </div>
      <div className="flex flex-col">
        <ArchivedRow age="6 weeks ago" name="South London · 2-bed" />
        <ArchivedRow age="3 months ago" isLast name="SW18 ground-floor" />
      </div>
    </article>
  );
}

function ArchivedRow({
  name,
  age,
  isLast = false,
}: {
  name: string;
  age: string;
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
        <span className="text-[10px] text-muted-foreground">
          Archived {age}
        </span>
      </div>
      <button className="text-[11px] text-primary" type="button">
        Restore
      </button>
    </div>
  );
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
