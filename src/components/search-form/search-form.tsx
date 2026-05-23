/**
 * The shared Search create / edit form.
 *
 * `/searches/new` and `/searches/$id` both mount this with different
 * `mode` + `initial` props. State now lives in TanStack Form — the cost
 * estimate, CTA disabled-ness, etc. stay reactive via `form.useStore`
 * (no `form.watch()` indirection); per-field Zod validators provide the
 * client-side guard rails (the server function will re-validate
 * authoritatively).
 *
 * The layout mirrors the "Search create" Paper artboard:
 * eyebrow + tap-to-edit headline → Postcodes (INCLUDE + EXCLUDE chips)
 * → Price slider + Bed/Bath pills → Commute targets → Transport targets
 * → Portals → Re-scrape cadence → sticky CTA footer.
 *
 * Sub-components remain plain controlled inputs that take `value` +
 * `onChange` — `form.Field` adapts cleanly to that shape so we don't
 * need a `Controller` indirection on the way down.
 */
import { Cancel01Icon, MapPinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm, useStore } from "@tanstack/react-form";
import { useEffect } from "react";
import { z } from "zod";
import { type Portal, estimateCost } from "../../lib/cost-estimate";
import { findCadenceById } from "../../lib/cron-presets";
import {
  BATH_OPTIONS,
  BED_OPTIONS,
  type BathOption,
  type BedOption,
  PillGroup,
} from "./bed-bath-pills";
import { CadencePicker } from "./cadence-picker";
import type { CommuteTarget } from "./commute-target-row";
import { CommuteTargetsList } from "./commute-targets-list";
import { CostEstimate } from "./cost-estimate";
import { OutcodeChips } from "./outcode-chips";
import { PortalToggles } from "./portal-toggles";
import { PriceSlider } from "./price-slider";
import {
  type TransportTarget,
  TransportTargetsList,
} from "./transport-targets-list";

export type SearchFormValues = {
  name: string;
  outcodesInclude: string[];
  outcodesExclude: string[];
  minPrice: number;
  maxPrice: number;
  bedsId: string;
  bathsId: string;
  commuteTargets: CommuteTarget[];
  transportTargets: TransportTarget[];
  portals: Portal[];
  cadenceId: string;
};

export const DEFAULT_FORM_VALUES: SearchFormValues = {
  name: "A flat in North London",
  outcodesInclude: [],
  outcodesExclude: [],
  minPrice: 2000,
  maxPrice: 2800,
  bedsId: "2+",
  bathsId: "1+",
  commuteTargets: [],
  transportTargets: [],
  portals: ["rightmove", "zoopla", "openrent"],
  cadenceId: "daily",
};

const DEFAULT_BED: BedOption = { id: "2+", label: "2+", min: 2, max: null };
const DEFAULT_BATH: BathOption = { id: "1+", label: "1+", min: 1, max: null };

export function bedOptionFor(id: string): BedOption {
  return BED_OPTIONS.find((b) => b.id === id) ?? DEFAULT_BED;
}

export function bathOptionFor(id: string): BathOption {
  return BATH_OPTIONS.find((b) => b.id === id) ?? DEFAULT_BATH;
}

// -----------------------------------------------------------------------------
// Per-field Zod validators
// -----------------------------------------------------------------------------
//
// The server function re-validates with its own schema (see
// `src/server/functions/searches.ts`) so these are client-side guard
// rails only. They surface inline errors / disable the CTA while the
// user is still inside the form.

const nameSchema = z.string().trim().min(1, "Give the search a name");
const outcodesIncludeSchema = z
  .array(z.string())
  .min(1, "Pick at least one outcode");
const portalsSchema = z
  .array(z.enum(["rightmove", "zoopla", "openrent"]))
  .min(1, "Pick at least one portal");

type Props = {
  mode: "create" | "edit";
  initial?: Partial<SearchFormValues>;
  pending?: boolean;
  onCancel?: () => void;
  onReset?: () => void;
  onSubmit: (values: SearchFormValues) => void;
  /**
   * Fires whenever a tracked field changes (outcodes / portals /
   * cadence / price / name / commute / transport / etc.). Used by the
   * desktop wrapper to power a live estimate panel that lives outside
   * the form's render tree.
   */
  onValuesChange?: (values: SearchFormValues) => void;
  /**
   * `"mobile"` (default) renders the single-column, sticky-header
   * variant. `"desktop"` drops the mobile chrome (close-X / title /
   * Reset header are owned by the desktop breadcrumb) and lays the
   * field sections out in a two-column grid.
   */
  layout?: "mobile" | "desktop";
};

export function SearchForm({
  mode,
  initial,
  pending,
  onCancel,
  onReset,
  onSubmit,
  onValuesChange,
  layout = "mobile",
}: Props) {
  const defaults: SearchFormValues = { ...DEFAULT_FORM_VALUES, ...initial };
  const form = useForm({
    defaultValues: defaults,
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  // Live-derived values via TanStack Form's `useStore`. Each selector
  // returns a primitive (or stable reference) so React's bailouts kick
  // in when unrelated parts of the form change.
  const outcodesInclude = useStore(form.store, (s) => s.values.outcodesInclude);
  const portals = useStore(form.store, (s) => s.values.portals);
  const cadenceId = useStore(form.store, (s) => s.values.cadenceId);
  const minPrice = useStore(form.store, (s) => s.values.minPrice);
  const maxPrice = useStore(form.store, (s) => s.values.maxPrice);
  const name = useStore(form.store, (s) => s.values.name);

  // Mirror the full form values out to interested parents on every
  // change. We read straight from the store so the broadcast picks up
  // fields the cost panel doesn't render directly (e.g. transport).
  const allValues = useStore(form.store, (s) => s.values);
  useEffect(() => {
    onValuesChange?.(allValues);
  }, [allValues, onValuesChange]);

  const cadence = findCadenceById(cadenceId);
  const cost = estimateCost({
    outcodeCount: outcodesInclude.length,
    portals,
    scrapesPerDay: cadence.scrapesPerDay,
  });

  const canSubmit =
    outcodesInclude.length > 0 &&
    portals.length > 0 &&
    name.trim().length > 0 &&
    minPrice <= maxPrice;

  const isDesktop = layout === "desktop";

  const headlineSection = (
    <section>
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
        WHAT WE'RE LOOKING FOR
      </p>
      <form.Field name="name" validators={{ onChange: nameSchema }}>
        {(field) => (
          <input
            className={`-mx-1 mt-2 w-full bg-transparent px-1 font-serif text-foreground leading-[1.05] outline-none placeholder:text-muted-foreground/50 focus:bg-muted/60 ${
              isDesktop ? "text-5xl" : "text-4xl"
            }`}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            placeholder="A flat in North London"
            type="text"
            value={field.state.value}
          />
        )}
      </form.Field>
      <p className="mt-2 text-muted-foreground text-xs italic">
        {isDesktop ? "click to rename" : "tap to rename"}
      </p>
    </section>
  );

  const postcodesSection = (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-2xl text-foreground">Postcodes</h2>
        <button
          className="inline-flex items-center gap-1 text-primary text-xs"
          onClick={() => {
            /* Map view deferred — PR 8 / 9.5 territory. */
          }}
          type="button"
        >
          <HugeiconsIcon icon={MapPinIcon} size={12} strokeWidth={2} />
          Map
        </button>
      </div>
      <p className="-mt-3 text-muted-foreground text-sm">
        Include what you want, kill what you don't.
      </p>
      <form.Field
        name="outcodesInclude"
        validators={{ onChange: outcodesIncludeSchema }}
      >
        {(field) => (
          <OutcodeChips
            countLabel={
              field.state.value.length > 0
                ? `${field.state.value.length} ${field.state.value.length === 1 ? "AREA" : "AREAS"}`
                : undefined
            }
            onChange={(next) => field.handleChange(next)}
            values={field.state.value}
            variant="include"
          />
        )}
      </form.Field>
      <form.Field name="outcodesExclude">
        {(field) => (
          <OutcodeChips
            countLabel={
              field.state.value.length > 0
                ? `${field.state.value.length} ${field.state.value.length === 1 ? "AREA" : "AREAS"}`
                : undefined
            }
            onChange={(next) => field.handleChange(next)}
            values={field.state.value}
            variant="exclude"
          />
        )}
      </form.Field>
    </section>
  );

  const priceSizeSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Price & size</h2>
      <form.Field name="minPrice">
        {(minField) => (
          <form.Field name="maxPrice">
            {(maxField) => (
              <PriceSlider
                max={5000}
                min={0}
                onChange={([lo, hi]) => {
                  minField.handleChange(lo);
                  maxField.handleChange(hi);
                }}
                value={[minField.state.value, maxField.state.value]}
              />
            )}
          </form.Field>
        )}
      </form.Field>
      <div className="flex gap-3">
        <form.Field name="bedsId">
          {(field) => (
            <PillGroup
              onChange={(id) => field.handleChange(id)}
              options={BED_OPTIONS}
              selectedId={field.state.value}
              title="BEDS"
            />
          )}
        </form.Field>
        <form.Field name="bathsId">
          {(field) => (
            <PillGroup
              onChange={(id) => field.handleChange(id)}
              options={BATH_OPTIONS}
              selectedId={field.state.value}
              title="BATHS"
            />
          )}
        </form.Field>
      </div>
    </section>
  );

  const commuteSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Commute to</h2>
      <p className="-mt-1 text-muted-foreground text-sm">
        Specific places you need to reach — office, family, anywhere.
      </p>
      <form.Field name="commuteTargets">
        {(field) => (
          <CommuteTargetsList
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </section>
  );

  const transportSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Transport nearby</h2>
      <p className="-mt-1 text-muted-foreground text-sm">
        How close to the nearest tube, train, bus, or tram you need to be.
      </p>
      <form.Field name="transportTargets">
        {(field) => (
          <TransportTargetsList
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </section>
  );

  const portalsSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Portals to watch</h2>
      <form.Field name="portals" validators={{ onChange: portalsSchema }}>
        {(field) => (
          <PortalToggles
            onChange={(next) => field.handleChange(next)}
            selected={field.state.value}
          />
        )}
      </form.Field>
    </section>
  );

  const cadenceSection = (
    <section className="space-y-3">
      <form.Field name="cadenceId">
        {(field) => (
          <CadencePicker
            onChange={(id) => field.handleChange(id)}
            perDayUsd={cost.perDayUsd}
            selectedId={field.state.value}
          />
        )}
      </form.Field>
    </section>
  );

  const costEstimate = (
    <CostEstimate
      ctaLabel={mode === "create" ? "Start watching" : "Save changes"}
      disabled={!canSubmit || Boolean(pending)}
      onSubmit={() => form.handleSubmit()}
      pending={pending}
    />
  );

  if (isDesktop) {
    return (
      <form
        className="flex w-full min-w-0 flex-1 flex-col bg-background"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="flex-1 space-y-10 px-10 pt-7 pb-8">
          {/* Headline + Reset, full width */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">{headlineSection}</div>
            <button
              className="mt-7 shrink-0 text-primary text-sm hover:underline"
              onClick={() => {
                form.reset(DEFAULT_FORM_VALUES);
                onReset?.();
              }}
              type="button"
            >
              Reset
            </button>
          </div>

          {/* Two-column field grid. Postcodes own the wider left column
              (they're the heaviest input — INCLUDE + EXCLUDE chip rows
              + the map affordance). The right column carries price, the
              two location-targeting sections (commute + transport), then
              portals and cadence. */}
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-10">{postcodesSection}</div>
            <div className="space-y-10">
              {priceSizeSection}
              {commuteSection}
              {transportSection}
              {portalsSection}
              {cadenceSection}
            </div>
          </div>
        </div>

        {costEstimate}
      </form>
    );
  }

  return (
    <form
      className="mx-auto flex min-h-screen max-w-md flex-col bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      {/* Header — close + title + reset */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-border border-b bg-card px-4 py-3">
        <button
          aria-label="Close"
          className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-muted"
          onClick={onCancel}
          type="button"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
        </button>
        <h1 className="font-medium text-foreground text-sm">
          {mode === "create" ? "New search" : "Edit search"}
        </h1>
        <button
          className="text-primary text-sm"
          onClick={() => {
            form.reset(DEFAULT_FORM_VALUES);
            onReset?.();
          }}
          type="button"
        >
          Reset
        </button>
      </header>

      <div className="flex-1 space-y-8 px-5 pt-6 pb-8">
        {headlineSection}
        {postcodesSection}
        {priceSizeSection}
        {commuteSection}
        {transportSection}
        {portalsSection}
        {cadenceSection}
      </div>

      {costEstimate}
    </form>
  );
}
