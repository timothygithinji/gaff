/**
 * The shared Search create / edit form.
 *
 * `/searches/new` and `/searches/$id` both mount this with different
 * `mode` + `initial` props. State lives in TanStack Form; derived values
 * (listings/week estimate, CTA disabled-ness) stay reactive via
 * `form.useStore`.
 *
 * Layout mirrors the Paper "Search new" artboards:
 *   - MOBILE (3G1-0): a Cancel / title / Reset nav, a headline block,
 *     then stacked sections — Postcodes, Price & size, AI floor-plan
 *     rules (preview), Property type, Furnishing, Must-haves, Hide,
 *     Commute, Transport, Portals, Re-scrape — over a sticky estimate
 *     footer with the primary CTA.
 *   - DESKTOP (3KU-0): a two-column body. The left column holds the
 *     content-heavy cards (Postcodes, Price & size, AI rules, and the
 *     property/furnishing/must-have/hide criteria); the 360px right rail
 *     holds Commute, Transport, Portals, Re-scrape, and the navy Estimate
 *     card (which owns the desktop CTA).
 *
 * Sub-components remain plain controlled inputs (`value` + `onChange`).
 */
import { useForm, useStore } from "@tanstack/react-form";
import { type ReactNode, useEffect, useRef } from "react";
import { z } from "zod";
import type { Portal } from "../../lib/cost-estimate";
import type { SearchLocation } from "../../lib/search-location";
import { cn } from "../../lib/utils";
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
import { CostEstimateBar } from "./cost-estimate";
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
  // Blank so the form auto-fills from the picked location on create.
  name: "",
  location: null,
  excludeLocations: [],
  // `0` = "this area only".
  radiusMiles: 0,
  minPrice: 0,
  maxPrice: 2800,
  bedsId: "2+",
  bathsId: "1+",
  propertyTypes: [],
  furnished: null,
  mustHaves: [],
  exclusions: ["student", "retirement", "house_share"],
  commuteTargets: [],
  transportTargets: [],
  portals: ["rightmove", "zoopla", "openrent"],
  cadenceId: "daily",
};

const DEFAULT_BED: BedOption = { id: "2+", label: "2", min: 2, max: null };
const DEFAULT_BATH: BathOption = { id: "1+", label: "1+", min: 1, max: null };

export function bedOptionFor(id: string): BedOption {
  return BED_OPTIONS.find((b) => b.id === id) ?? DEFAULT_BED;
}

export function bathOptionFor(id: string): BathOption {
  return BATH_OPTIONS.find((b) => b.id === id) ?? DEFAULT_BATH;
}

// Per-field client-side guard rails (the server re-validates).
const nameSchema = z.string().trim().min(1, "Give the search a name");
const portalsSchema = z
  .array(z.enum(["rightmove", "zoopla", "openrent"]))
  .min(1, "Pick at least one portal");

/** Rough listings/week heuristic — outcodes × portals. Directional only. */
function listingsPerWeekEstimate(values: SearchFormValues): number {
  const areas = Math.max(
    1,
    values.location?.coveringOutcodes?.length ?? (values.location ? 1 : 0)
  );
  const perPortalWeekly = 20;
  return Math.round(areas * values.portals.length * perPortalWeekly);
}

/**
 * id of the desktop `<form>`. The desktop primary CTA lives outside the
 * form — up in the breadcrumb header (see `DesktopSearchCreate`) — so its
 * button uses `type="submit" form={DESKTOP_FORM_ID}` to submit natively.
 */
export const DESKTOP_FORM_ID = "search-form-desktop";

type Props = {
  mode: "create" | "edit";
  initial?: Partial<SearchFormValues>;
  pending?: boolean;
  onCancel?: () => void;
  onReset?: () => void;
  onSubmit: (values: SearchFormValues) => void;
  onValuesChange?: (values: SearchFormValues) => void;
  /** Fires whenever the form's dirtiness (vs `initial`) changes. */
  onDirtyChange?: (dirty: boolean) => void;
  /** `"mobile"` single-column with sticky footer; `"desktop"` two-column. */
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
  onDirtyChange,
  layout = "mobile",
}: Props) {
  const defaults: SearchFormValues = { ...DEFAULT_FORM_VALUES, ...initial };
  const form = useForm({
    defaultValues: defaults,
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  const location = useStore(form.store, (s) => s.values.location);
  const portals = useStore(form.store, (s) => s.values.portals);
  const minPrice = useStore(form.store, (s) => s.values.minPrice);
  const maxPrice = useStore(form.store, (s) => s.values.maxPrice);
  const name = useStore(form.store, (s) => s.values.name);
  const allValues = useStore(form.store, (s) => s.values);

  useEffect(() => {
    onValuesChange?.(allValues);
  }, [allValues, onValuesChange]);

  // Dirty = current values differ from the baseline we hydrated with.
  // Computed by value (not TanStack's `isDirty`, which doesn't reliably
  // reset when a field is edited back to its original) so the desktop
  // Save button can disable when there's nothing to save. JSON compare is
  // safe here: `allValues` keeps the key order of `defaults`, the object
  // it was initialised from.
  const isDirty = JSON.stringify(allValues) !== JSON.stringify(defaults);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Auto-mirror the picked location into the name until the user types.
  const userTouchedName = useRef<boolean>(defaults.name.trim().length > 0);
  useEffect(() => {
    if (location && !userTouchedName.current) {
      form.setFieldValue("name", location.name);
    }
  }, [location, form]);

  const listings = listingsPerWeekEstimate(allValues);

  const canSubmit =
    location !== null &&
    portals.length > 0 &&
    name.trim().length > 0 &&
    minPrice <= maxPrice;

  const isDesktop = layout === "desktop";

  const headline = (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-slate uppercase tracking-[0.14em]">
        What we're looking for
      </p>
      <form.Field name="name" validators={{ onChange: nameSchema }}>
        {(field) => (
          <input
            className={cn(
              "-mx-1 w-full bg-transparent px-1 font-semibold text-navy leading-[1.05] tracking-[-0.025em] outline-none placeholder:text-slate-2/60 focus:bg-mist/60",
              isDesktop ? "text-[40px]" : "text-[28px] sm:text-[34px]"
            )}
            onBlur={field.handleBlur}
            onChange={(e) => {
              userTouchedName.current = true;
              field.handleChange(e.target.value);
            }}
            placeholder="A flat in North London"
            type="text"
            value={field.state.value}
          />
        )}
      </form.Field>
      <p className="text-[13px] text-slate-2">
        {isDesktop ? "Click to rename" : "Tap to rename"}
      </p>
    </div>
  );

  const postcodes = (
    <SectionCard bare={!isDesktop} title="Postcodes">
      <p className="-mt-1 text-[12px] text-slate">
        Include what you want, kill what you don't.
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
    </SectionCard>
  );

  const priceSize = (
    <SectionCard bare={!isDesktop} title="Price & size">
      {/* On desktop the beds/baths wrapper collapses to `contents`, so
          rent, beds, and baths sit as three equal columns in one row;
          on mobile rent stacks above the beds/baths row. */}
      <div className={cn("flex", isDesktop ? "items-stretch gap-2.5" : "flex-col gap-3.5")}>
        <div className={cn(isDesktop && "min-w-0 flex-1")}>
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
        </div>
        <div className={cn("flex gap-2.5", isDesktop && "contents")}>
          <form.Field name="bedsId">
            {(field) => (
              <PillGroup
                onChange={(id) => field.handleChange(id)}
                options={BED_OPTIONS}
                selectedId={field.state.value}
                title="Beds"
              />
            )}
          </form.Field>
          <form.Field name="bathsId">
            {(field) => (
              <PillGroup
                onChange={(id) => field.handleChange(id)}
                options={BATH_OPTIONS}
                selectedId={field.state.value}
                title="Baths"
              />
            )}
          </form.Field>
        </div>
      </div>
    </SectionCard>
  );

  const propertyType = (
    <Section
      bare={!isDesktop}
      subtitle="Tap to add — leave empty for any."
      title="Property type"
    >
      <form.Field name="propertyTypes">
        {(field) => (
          <PropertyTypePills
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </Section>
  );

  const furnishing = (
    <Section bare={!isDesktop} title="Furnishing">
      <form.Field name="furnished">
        {(field) => (
          <FurnishedPicker
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </Section>
  );

  const mustHaves = (
    <Section
      bare={!isDesktop}
      subtitle="Hard filters at scrape time — anything without these is hidden."
      title="Must-haves"
    >
      <form.Field name="mustHaves">
        {(field) => (
          <MustHavesToggles
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </Section>
  );

  const hide = (
    <Section
      bare={!isDesktop}
      subtitle="Listing types to skip entirely."
      title="Hide"
    >
      <form.Field name="exclusions">
        {(field) => (
          <ExclusionsToggles
            onChange={(next) => field.handleChange(next)}
            value={field.state.value}
          />
        )}
      </form.Field>
    </Section>
  );

  const commute = (
    <SectionCard bare={!isDesktop} title="Commute to">
      <p className="-mt-1 text-[12px] text-slate">
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
    </SectionCard>
  );

  const transport = (
    <SectionCard bare={!isDesktop} title="Transport nearby">
      <p className="-mt-1 text-[12px] text-slate">
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
    </SectionCard>
  );

  const portalsBlock = (
    <SectionCard bare={!isDesktop} title="Portals to watch">
      <form.Field name="portals" validators={{ onChange: portalsSchema }}>
        {(field) => (
          <PortalToggles
            onChange={(next) => field.handleChange(next)}
            selected={field.state.value}
          />
        )}
      </form.Field>
    </SectionCard>
  );

  const rescrape = (
    <SectionCard bare={!isDesktop} title="Re-scrape">
      <form.Field name="cadenceId">
        {(field) => (
          <CadencePicker
            onChange={(id) => field.handleChange(id)}
            selectedId={field.state.value}
          />
        )}
      </form.Field>
    </SectionCard>
  );

  if (isDesktop) {
    return (
      <form
        className="flex w-full min-w-0 flex-1 flex-col bg-background"
        id={DESKTOP_FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* Paper's desktop form (3KU-0) has no Reset affordance in the header —
            it's a mobile-only control. Desktop just shows the rename headline. */}
        <div className="px-10 pt-5 pb-7">{headline}</div>

        <div className="flex gap-7 px-10 pb-8">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {postcodes}
            {priceSize}
            <SectionCard title="Property & filters">
              <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
                {propertyType}
                {furnishing}
                {mustHaves}
                {hide}
              </div>
            </SectionCard>
          </div>
          <div className="flex w-[360px] shrink-0 flex-col gap-4">
            {commute}
            {transport}
            {portalsBlock}
            {rescrape}
          </div>
        </div>
      </form>
    );
  }

  return (
    <form
      className="mx-auto flex min-h-screen max-w-md flex-col bg-background sm:max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <header className="flex items-center justify-between px-5 pt-2 pb-4.5">
        <button
          className="text-[14px] text-slate"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <span className="font-semibold text-[14px] text-navy">
          {mode === "create" ? "New search" : "Edit search"}
        </span>
        <button
          className="text-[14px] text-slate"
          onClick={() => {
            form.reset(DEFAULT_FORM_VALUES);
            onReset?.();
          }}
          type="button"
        >
          Reset
        </button>
      </header>

      <div className="flex-1 space-y-6 pb-8">
        <div className="px-5">{headline}</div>
        {postcodes}
        {priceSize}
        {propertyType}
        {furnishing}
        {mustHaves}
        {hide}
        {commute}
        {transport}
        {portalsBlock}
        {rescrape}
      </div>

      <CostEstimateBar
        ctaLabel={mode === "create" ? "Start watching" : "Save changes"}
        disabled={!canSubmit}
        listingsPerWeek={listings}
        onSubmit={() => form.handleSubmit()}
        pending={pending}
      />
    </form>
  );
}

/* ---------------- Section layout helpers ---------------- */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-semibold text-[17px] text-navy leading-[22px]">
      {children}
    </h2>
  );
}

/**
 * A grouped form section. On desktop it's a bordered white card; on
 * mobile (`bare`) it's a padded column with no card chrome (matching
 * Paper's edge-to-edge mobile sections).
 */
function SectionCard({
  title,
  titleRight,
  bare,
  children,
}: {
  title: string;
  titleRight?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3.5",
        bare ? "px-5" : "rounded-lg border border-line bg-paper p-6"
      )}
    >
      <div className="flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        {titleRight}
      </div>
      {children}
    </section>
  );
}

function Section({
  title,
  subtitle,
  bare,
  children,
}: {
  title: string;
  subtitle?: string;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-2.5", bare && "px-5")}>
      <SectionTitle>{title}</SectionTitle>
      {subtitle ? <p className="-mt-1.5 text-[12px] text-slate">{subtitle}</p> : null}
      {children}
    </section>
  );
}
