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
 * eyebrow + tap-to-edit headline → Where (single place + exclude
 * list, both via Google Places autocomplete) → Price slider + Bed/Bath
 * pills → Commute targets → Transport targets → Portals → Re-scrape
 * cadence → sticky CTA footer.
 *
 * Sub-components remain plain controlled inputs that take `value` +
 * `onChange` — `form.Field` adapts cleanly to that shape so we don't
 * need a `Controller` indirection on the way down.
 */
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { type Portal, estimateCost } from "../../lib/cost-estimate";
import { findCadenceById } from "../../lib/cron-presets";
import type { SearchLocation } from "../../lib/search-location";
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
import { type ExclusionValue, ExclusionsToggles } from "./exclusions-toggles";
import { FurnishedPicker, type FurnishedValue } from "./furnished-picker";
import { LocationsList, SingleLocationPicker } from "./location-picker";
import { type MustHaveValue, MustHavesToggles } from "./must-haves-toggles";
import { PortalToggles } from "./portal-toggles";
import { PriceSlider } from "./price-slider";
import { PropertyTypePills } from "./property-type-pills";
import { RadiusSlider } from "./radius-slider";
import {
  type TransportTarget,
  TransportTargetsList,
} from "./transport-targets-list";

export type SearchFormValues = {
  name: string;
  location: SearchLocation | null;
  excludeLocations: SearchLocation[];
  radiusMiles: number;
  minPrice: number;
  maxPrice: number;
  bedsId: string;
  bathsId: string;
  propertyTypes: string[];
  furnished: FurnishedValue;
  mustHaves: MustHaveValue[];
  exclusions: ExclusionValue[];
  commuteTargets: CommuteTarget[];
  transportTargets: TransportTarget[];
  portals: Portal[];
  cadenceId: string;
};

export const DEFAULT_FORM_VALUES: SearchFormValues = {
  // Name is left blank by default so the form auto-fills it from the
  // picked location on create. The placeholder ("A flat in North
  // London") shows until either auto-fill or user typing populates it.
  name: "",
  location: null,
  excludeLocations: [],
  // `0` = "this area only". Rightmove + Zoopla honour `radius=0`
  // strictly; OpenRent's URL builder will floor to its 2km UI minimum.
  radiusMiles: 0,
  minPrice: 0,
  maxPrice: 2800,
  bedsId: "2+",
  bathsId: "1+",
  propertyTypes: [],
  furnished: null,
  mustHaves: [],
  // Student lets, retirement homes, and house shares are hidden by
  // default — most renters don't want them in results. Users can
  // re-enable any category via the Hide toggles.
  exclusions: ["student", "retirement", "house_share"],
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
  const location = useStore(form.store, (s) => s.values.location);
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

  // Auto-mirror the picked location into the search name until the user
  // takes ownership by typing. Initialised true on edit mode (where the
  // saved name is already meaningful) and on any create with a
  // pre-populated name, so we never clobber human input.
  const userTouchedName = useRef<boolean>(defaults.name.trim().length > 0);
  useEffect(() => {
    if (location && !userTouchedName.current) {
      form.setFieldValue("name", location.name);
    }
  }, [location, form]);

  const cadence = findCadenceById(cadenceId);
  const _cost = estimateCost({
    outcodeCount: location ? 1 : 0,
    portals,
    scrapesPerDay: cadence.scrapesPerDay,
  });

  const canSubmit =
    location !== null &&
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
            onChange={(e) => {
              // Mark the name as user-owned so the location → name
              // auto-mirror stops. Stays true for the rest of this
              // form instance even if the user clears the field.
              userTouchedName.current = true;
              field.handleChange(e.target.value);
            }}
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
      <h2 className="font-serif text-2xl text-foreground">Where</h2>
      <p className="-mt-3 text-muted-foreground text-sm">
        Pick the postcode, area, or town you want — and any places to skip
        inside it.
      </p>
      <form.Field name="location">
        {(field) => (
          <SingleLocationPicker
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
      <form.Field name="radiusMiles">
        {(field) => (
          <RadiusSlider
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
      <form.Field name="excludeLocations">
        {(field) => (
          <LocationsList
            onChange={(next) => field.handleChange(next)}
            values={field.state.value}
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

  const propertyTypeSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Property type</h2>
      <p className="-mt-1 text-muted-foreground text-sm">
        Tap to add — leave empty for any.
      </p>
      <form.Field name="propertyTypes">
        {(field) => (
          <PropertyTypePills
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </section>
  );

  const furnishedSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Furnishing</h2>
      <form.Field name="furnished">
        {(field) => (
          <FurnishedPicker
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </section>
  );

  const mustHavesSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Must-haves</h2>
      <p className="-mt-1 text-muted-foreground text-sm">
        Hard filters at scrape time — anything without these is hidden.
      </p>
      <form.Field name="mustHaves">
        {(field) => (
          <MustHavesToggles
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </section>
  );

  const exclusionsSection = (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl text-foreground">Hide</h2>
      <p className="-mt-1 text-muted-foreground text-sm">
        Listing types to skip entirely.
      </p>
      <form.Field name="exclusions">
        {(field) => (
          <ExclusionsToggles
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
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
      <h2 className="font-serif text-2xl text-foreground">Scrape schedule</h2>
      <form.Field name="cadenceId">
        {(field) => (
          <CadencePicker
            onChange={(id) => field.handleChange(id)}
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
        <div className="flex-1 space-y-10 px-6 pt-7 pb-8 lg:px-10">
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

          {/* Operational row sits ABOVE the criteria grid so the
              cadence picker (most-tweaked setting) is visible without
              a scroll. Portals + cadence are set-once-then-forget for
              most users — surfacing them upfront also frames the cost
              estimate before the user dives into criteria. */}
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
            {portalsSection}
            {cadenceSection}
          </div>

          {/* Criteria grid — two columns, kept roughly height-balanced
              so the left doesn't stall out halfway down. Left reads as
              "where you'll live and what it'll cost" (location + price
              + how you get places); right is "what the place itself
              is" (shape + furnishings + dealbreakers). Price sits on
              the left because it's adjacent to "Where" in users' minds
              — and putting it there evens the visual weight (4 vs 4). */}
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
            <div className="space-y-10">
              {postcodesSection}
              {priceSizeSection}
              {commuteSection}
              {transportSection}
            </div>
            <div className="space-y-10">
              {propertyTypeSection}
              {furnishedSection}
              {mustHavesSection}
              {exclusionsSection}
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
        {propertyTypeSection}
        {furnishedSection}
        {mustHavesSection}
        {exclusionsSection}
        {commuteSection}
        {transportSection}
        {portalsSection}
        {cadenceSection}
      </div>

      {costEstimate}
    </form>
  );
}
