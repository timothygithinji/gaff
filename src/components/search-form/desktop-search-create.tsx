/**
 * Desktop Search create — desktop chrome around the existing
 * `SearchForm`. Shown above the `md` breakpoint. Mirrors the
 * `Desktop · Search create` artboard's structural beats:
 *
 *   - LEFT  : the standard `AdminSidebar`.
 *   - CENTER: the existing mobile `SearchForm` (centred, `max-w-md`).
 *             Rebuilding the form to a multi-column desktop layout is a
 *             larger refactor; the wrapping chrome unlocks the desktop
 *             experience without rewriting field-by-field.
 *   - RIGHT : a sticky "Estimate · weekly" hero card + inspiration +
 *             schedule placeholders, matching the artboard's right rail.
 *
 * The estimate panel currently shows placeholder values — wire it to
 * `estimateListingsPerWeek` once `SearchForm` exposes its live cost
 * state via a render prop or context.
 */
import { AiMagicIcon, BulbIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { AdminSidebar } from "../layout/admin-sidebar";
import { SearchForm, type SearchFormValues } from "./search-form";

type Props = {
  mode: "create" | "edit";
  initial?: Partial<SearchFormValues>;
  pending?: boolean;
  onCancel?: () => void;
  onReset?: () => void;
  onSubmit: (values: SearchFormValues) => void;
};

export function DesktopSearchCreate(props: Props) {
  return (
    <div className="hidden min-h-screen bg-ground md:flex">
      <AdminSidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Breadcrumb mode={props.mode} onCancel={props.onCancel} />
        <div className="flex min-w-0 flex-1 gap-6 px-10 py-7">
          <div className="flex min-w-0 flex-1 justify-center">
            <SearchForm {...props} />
          </div>
          <EstimateRail />
        </div>
      </main>
    </div>
  );
}

function Breadcrumb({
  mode,
  onCancel,
}: {
  mode: "create" | "edit";
  onCancel?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-bone border-b px-10 py-5">
      <div className="flex items-center gap-3.5">
        <button
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card font-medium text-foreground text-xs"
          onClick={onCancel}
          type="button"
        >
          ✕
        </button>
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-2 text-xs"
        >
          <span className="text-muted-foreground">Searches</span>
          <span className="text-[#B5A893]">/</span>
          <span className="font-semibold text-foreground">
            {mode === "create" ? "New search" : "Edit search"}
          </span>
        </nav>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          Sync runs every 4 hours · ~$0.18 / day
        </span>
      </div>
    </header>
  );
}

function EstimateRail() {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-3.5">
      <EstimateHero />
      <InspirationCard />
      <ScheduleCard />
    </aside>
  );
}

function EstimateHero() {
  return (
    <article className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-foreground px-6 py-5">
      <div
        aria-hidden="true"
        className="-right-8 -top-8 absolute h-36 w-36 rounded-full bg-primary/25"
      />
      <Eyebrow tone="onDark">Estimate · weekly</Eyebrow>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif text-[48px] text-bone leading-none tracking-tight">
            ~140
          </span>
          <span className="text-[13px] text-white/55">listings / week</span>
        </div>
        <p className="text-[12px] text-white/55 leading-[17px]">
          Around 8 reach your Review queue per day after AI filters.
        </p>
      </div>
      <FunnelBar />
      <FunnelLegend />
    </article>
  );
}

function FunnelBar() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 flex-[6] rounded-full bg-primary" />
      <span className="h-1.5 flex-[3] rounded-full bg-[#C7A87C]" />
      <span className="h-1.5 flex-[1] rounded-full bg-white/15" />
    </div>
  );
}

function FunnelLegend() {
  return (
    <div className="flex items-center justify-between">
      <FunnelStat
        color="bg-primary"
        label="~84 scraped"
        meta="Hit AI floor plan"
      />
      <FunnelStat color="bg-[#C7A87C]" label="~42 pass" meta="Match rules" />
      <FunnelStat color="bg-white/50" label="~14 review" meta="Reach you" />
    </div>
  );
}

function FunnelStat({
  color,
  label,
  meta,
}: {
  color: string;
  label: string;
  meta: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={`h-1 w-1 rounded-full ${color}`} />
        <span className="font-semibold text-[11px] text-bone">{label}</span>
      </div>
      <span className="text-[10px] text-white/55">{meta}</span>
    </div>
  );
}

function InspirationCard() {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4.5 py-4">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon
          className="text-primary"
          icon={AiMagicIcon}
          size={12}
          strokeWidth={2}
        />
        <Eyebrow tone="primary">From your last search</Eyebrow>
      </div>
      <p className="text-[13px] text-foreground leading-[18px]">
        You kept 4 / 6 listings under £2,500. Drop the cap to{" "}
        <span className="font-semibold">£2,500</span> and you'd skip ~18
        viewings.
      </p>
      <div className="flex items-center gap-2.5">
        <button
          className="font-semibold text-[11px] text-primary"
          type="button"
        >
          Apply
        </button>
        <span className="text-[#B5A893] text-[11px]">·</span>
        <button className="text-[11px] text-muted-foreground" type="button">
          Dismiss
        </button>
      </div>
    </article>
  );
}

function ScheduleCard() {
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-4.5 py-4">
      <Eyebrow>Schedule</Eyebrow>
      <Row label="Re-scrape" meta="Every 4 hours">
        <HugeiconsIcon
          className="text-muted-foreground"
          icon={BulbIcon}
          size={14}
          strokeWidth={1.6}
        />
      </Row>
      <span className="h-px bg-[#F2EBDE]" />
      <Row label="Quiet hours" meta="21:00 → 07:00">
        <ToggleDot on />
      </Row>
    </article>
  );
}

function Row({
  label,
  meta,
  children,
}: {
  label: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-[13px] text-foreground">
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground">{meta}</span>
      </div>
      {children}
    </div>
  );
}

function ToggleDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative h-5 w-9 rounded-full ${on ? "bg-primary" : "bg-border"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${on ? "right-0.5" : "left-0.5"}`}
      />
    </span>
  );
}

function Eyebrow({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "onDark";
}) {
  const palette = eyebrowPalette(tone);
  return (
    <span
      className={`font-semibold text-[11px] uppercase tracking-[0.12em] ${palette}`}
    >
      {children}
    </span>
  );
}

function eyebrowPalette(tone: "muted" | "primary" | "onDark"): string {
  if (tone === "onDark") {
    return "text-bone/65";
  }
  if (tone === "primary") {
    return "text-primary";
  }
  return "text-muted-foreground";
}
