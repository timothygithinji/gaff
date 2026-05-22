/**
 * Desktop chrome around the existing `SearchForm` — used by both
 * `/searches/new` and `/searches/$id`. Shown above the `md` breakpoint.
 *
 *   - LEFT  : the standard `AdminSidebar`.
 *   - CENTER: the existing mobile `SearchForm` (centred, `max-w-md`).
 *             Rebuilding the form to a multi-column desktop layout is a
 *             larger refactor; the wrapping chrome unlocks the desktop
 *             experience without rewriting field-by-field.
 *   - RIGHT : a sticky "Estimate · weekly" card derived from the seed
 *             form values (real numbers via `estimateListingsPerWeek` /
 *             `estimateCost`). In edit mode, a "Danger zone" card sits
 *             below it with pause/resume + delete actions.
 *
 * The estimate currently reflects the *seed* (saved) values, not the
 * user's in-progress edits, because `SearchForm` owns its own form
 * store. The wrapper holds a live copy via `onValuesChange` so the
 * estimate panel re-renders as the user types.
 */
import { type ReactNode, useState } from "react";
import {
  type Portal,
  estimateCost,
  estimateListingsPerWeek,
  formatUsd,
} from "../../lib/cost-estimate";
import { findCadenceById } from "../../lib/cron-presets";
import { AdminSidebar } from "../layout/admin-sidebar";
import {
  DEFAULT_FORM_VALUES,
  SearchForm,
  type SearchFormValues,
} from "./search-form";

type ActionState = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type Props = {
  mode: "create" | "edit";
  initial?: Partial<SearchFormValues>;
  pending?: boolean;
  onCancel?: () => void;
  onReset?: () => void;
  onSubmit: (values: SearchFormValues) => void;
  /** Edit-mode-only — pause / resume the active schedule. */
  pauseAction?: ActionState;
  /** Edit-mode-only — delete the search + schedule. */
  deleteAction?: ActionState;
};

export function DesktopSearchCreate(props: Props) {
  const seed: SearchFormValues = { ...DEFAULT_FORM_VALUES, ...props.initial };
  // Mirror SearchForm's live values into local state so the estimate
  // panel can recompute on every keystroke. We seed with the same
  // initial values the form uses so the first paint matches.
  const [liveValues, setLiveValues] = useState<SearchFormValues>(seed);
  return (
    <AdminSidebar mode="desktop-only">
      <Breadcrumb mode={props.mode} onCancel={props.onCancel} />
      <div className="flex min-w-0 flex-1 gap-6 px-10 py-7">
        <div className="flex min-w-0 flex-1 justify-center">
          <SearchForm {...props} onValuesChange={setLiveValues} />
        </div>
        <EstimateRail
          deleteAction={props.deleteAction}
          mode={props.mode}
          pauseAction={props.pauseAction}
          values={liveValues}
        />
      </div>
    </AdminSidebar>
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
    </header>
  );
}

function EstimateRail({
  values,
  mode,
  pauseAction,
  deleteAction,
}: {
  values: SearchFormValues;
  mode: "create" | "edit";
  pauseAction?: ActionState;
  deleteAction?: ActionState;
}) {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-3.5">
      <EstimateHero values={values} />
      {mode === "edit" && (pauseAction || deleteAction) ? (
        <DangerZoneCard deleteAction={deleteAction} pauseAction={pauseAction} />
      ) : null}
    </aside>
  );
}

function EstimateHero({ values }: { values: SearchFormValues }) {
  const cadence = findCadenceById(values.cadenceId);
  const outcodeCount = values.outcodesInclude.length;
  const portals = values.portals as Portal[];
  const perWeek = estimateListingsPerWeek({ outcodeCount, portals });
  const cost = estimateCost({
    outcodeCount,
    portals,
    scrapesPerDay: cadence.scrapesPerDay,
  });
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
            {perWeek === 0 ? "—" : `~${perWeek}`}
          </span>
          <span className="text-[13px] text-white/55">listings / week</span>
        </div>
        <p className="text-[12px] text-white/55 leading-[17px]">
          {perWeek === 0
            ? "Add outcodes + portals to see an estimate."
            : `Across ${outcodeCount} outcode${outcodeCount === 1 ? "" : "s"} on ${portals.length} portal${portals.length === 1 ? "" : "s"}. ${cadence.label} cadence.`}
        </p>
      </div>
      <CostRow cost={cost} />
    </article>
  );
}

function CostRow({
  cost,
}: {
  cost: ReturnType<typeof estimateCost>;
}) {
  return (
    <div className="flex items-center justify-between border-white/10 border-t pt-3.5 text-[11px]">
      <div className="flex flex-col gap-0.5">
        <span className="text-bone/55">Per day</span>
        <span className="font-semibold text-bone">
          {formatUsd(cost.perDayUsd)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-bone/55">Per week</span>
        <span className="font-semibold text-bone">
          {formatUsd(cost.perWeekUsd)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-bone/55">Per scrape</span>
        <span className="font-semibold text-bone">
          {formatUsd(cost.perScrapeUsd)}
        </span>
      </div>
    </div>
  );
}

function DangerZoneCard({
  pauseAction,
  deleteAction,
}: {
  pauseAction?: ActionState;
  deleteAction?: ActionState;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4.5 py-4">
      <Eyebrow>Danger zone</Eyebrow>
      {pauseAction ? (
        <button
          className="rounded-md border border-border px-3 py-2 text-left font-medium text-muted-foreground text-xs disabled:opacity-50"
          disabled={pauseAction.disabled}
          onClick={pauseAction.onClick}
          type="button"
        >
          {pauseAction.label}
        </button>
      ) : null}
      {deleteAction ? (
        <button
          className="rounded-md bg-[#B05A38]/10 px-3 py-2 text-left font-medium text-[#B05A38] text-xs disabled:opacity-50"
          disabled={deleteAction.disabled}
          onClick={deleteAction.onClick}
          type="button"
        >
          {deleteAction.label}
        </button>
      ) : null}
    </article>
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
