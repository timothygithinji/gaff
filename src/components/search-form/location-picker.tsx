/**
 * Form pickers for SearchLocation values, built on `PlaceAutocomplete`.
 *
 *   - `SingleLocationPicker` (INCLUDE side): one slot. When empty,
 *     renders the autocomplete input. When filled, renders the place
 *     as a primary-coloured chip with × to clear.
 *   - `LocationsList` (EXCLUDE side): a list of place chips with ×
 *     per item, plus the autocomplete to add more. Render style mirrors
 *     the old `OutcodeChips` exclude variant — muted background, line-
 *     through text — so the visual language for "kill this area" carries
 *     over from the postcode-only world.
 *
 * Both delegate place selection to `PlaceAutocomplete`, which is the
 * single source of truth for what a valid {@link SearchLocation} looks
 * like (UK-only, primary types limited, fields fetched, portalRefs
 * empty pending server stamp).
 */

import {
  Cancel01Icon,
  Location01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { LONDON_AREA_PRESETS, presetToSearchLocation } from "../../lib/london-areas";
import type { SearchLocation } from "../../lib/search-location";
import { resolveAreaOutcodes } from "../../server/functions/searches";
import { PlaceAutocomplete } from "./place-autocomplete";

// -----------------------------------------------------------------------------
// Single (include)
// -----------------------------------------------------------------------------

type SingleProps = {
  value: SearchLocation | null;
  onChange: (next: SearchLocation | null) => void;
};

export function SingleLocationPicker({ value, onChange }: SingleProps) {
  // Covering outcodes are resolved at pick-time from inside `handlePick`
  // below — keeps the side-effect at the source (user selects a place →
  // we fetch) instead of in a useEffect that fires off whatever the
  // parent's identity-stability happens to be. The mutation is also
  // available here so the chip list can show a "Resolving…" row while
  // it's in flight.
  const resolveOutcodes = useMutation({
    mutationFn: resolveAreaOutcodes,
  });

  const handlePick = async (loc: SearchLocation) => {
    // Postcode picks: the `name` already IS the outcode; nothing to
    // resolve. Stamp directly.
    if (loc.type === "postal_code") {
      onChange(loc);
      return;
    }
    // Show the pill immediately with an undefined `coveringOutcodes`
    // sentinel — `AreaOutcodes` renders the "Resolving…" message until
    // the mutation settles.
    onChange(loc);
    try {
      const result = await resolveOutcodes.mutateAsync({
        data: { lat: loc.lat, lng: loc.lng, bounds: loc.bounds },
      });
      // Active set + full set both start as everything resolved; toggling
      // off later removes from `coveringOutcodes` but keeps `allOutcodes`.
      onChange({
        ...loc,
        coveringOutcodes: result.outcodes,
        allOutcodes: result.outcodes,
      });
    } catch {
      // Network blip — empty list short-circuits the chip render and
      // the save-path resolver falls back to its single-ref behaviour.
      onChange({ ...loc, coveringOutcodes: [], allOutcodes: [] });
    }
  };

  // Flip a single outcode on/off. The full resolved set lives in
  // `allOutcodes` so a switched-off outcode stays visible and can be
  // switched back on; `coveringOutcodes` (the scraped set) stays ordered
  // as a filtered view of that superset.
  const toggleOutcode = (oc: string) => {
    if (!value) {
      return;
    }
    const all = value.allOutcodes ?? value.coveringOutcodes ?? [];
    const active = new Set(value.coveringOutcodes ?? []);
    if (active.has(oc)) {
      active.delete(oc);
    } else {
      active.add(oc);
    }
    onChange({
      ...value,
      allOutcodes: all,
      coveringOutcodes: all.filter((c) => active.has(c)),
    });
  };

  const isArea = value !== null && value.type !== "postal_code";
  const allOutcodes = value?.allOutcodes ?? value?.coveringOutcodes ?? null;
  const activeOutcodes = value?.coveringOutcodes ?? [];
  const resolving = isArea && resolveOutcodes.isPending;
  const allRemoved =
    isArea &&
    allOutcodes !== null &&
    allOutcodes.length > 0 &&
    activeOutcodes.length === 0;

  let chipCount = 0;
  if (isArea && allOutcodes) {
    chipCount = activeOutcodes.length;
  } else if (value) {
    chipCount = 1;
  }

  return (
    <div className="space-y-2">
      <span className="text-[10px] text-slate uppercase tracking-[0.14em]">
        Include{chipCount > 0 ? ` · ${chipCount} area${chipCount === 1 ? "" : "s"}` : ""}
      </span>
      {value ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1.5 text-left"
              onClick={() => onChange(null)}
              type="button"
            >
              <HugeiconsIcon
                aria-hidden
                className="shrink-0 text-slate"
                icon={Location01Icon}
                size={12}
                strokeWidth={1.8}
              />
              <span className="text-[12px] text-navy">{value.name}</span>
              <HugeiconsIcon
                aria-hidden
                className="text-slate-2"
                icon={Cancel01Icon}
                size={12}
                strokeWidth={2}
              />
              <span className="sr-only">Clear {value.name}</span>
            </button>
          </div>
          {isArea ? (
            <AreaOutcodes
              active={activeOutcodes}
              allRemoved={allRemoved}
              chips={allOutcodes}
              loading={resolving}
              onToggle={toggleOutcode}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <PlaceAutocomplete
            onSelect={(loc) => {
              handlePick(loc).catch(() => {
                // handlePick already swallows resolver errors internally;
                // this guards the floating-promise lint rule.
              });
            }}
            placeholder="Postcode, area, or town…"
          />
          <LondonAreaPresets
            onPick={(loc) => {
              handlePick(loc).catch(() => {
                // see above — resolver errors are swallowed inside handlePick.
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Quick-pick row for the colloquial London regions Google can't supply
 * (see `london-areas.ts`). Each chip builds the same area-typed
 * SearchLocation a real Google pick would, so selecting one drops into
 * the identical outcode fan-out + trim flow.
 */
function LondonAreaPresets({
  onPick,
}: {
  onPick: (loc: SearchLocation) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] text-slate uppercase tracking-[0.14em]">
        Or pick a region
      </span>
      <div className="flex flex-wrap gap-1.5">
        {LONDON_AREA_PRESETS.map((preset) => (
          <button
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1.5 text-[12px] text-navy"
            key={preset.id}
            onClick={() => onPick(presetToSearchLocation(preset))}
            type="button"
          >
            <HugeiconsIcon
              aria-hidden
              className="shrink-0 text-slate"
              icon={Location01Icon}
              size={12}
              strokeWidth={1.8}
            />
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Covering-outcodes chip list for area-typed picks. Renders the full
 * resolved set (`chips`); each pill is a toggle — switched-on outcodes
 * are solid with a ×, switched-off ones are muted with a +. Toggling
 * never drops an outcode from the list, so a mistaken switch-off is one
 * click to undo. `active` is what `stampPortalRefs` actually scrapes.
 * Renders a placeholder while the server resolves, and a warning row if
 * every outcode is switched off (the search would scrape nothing).
 */
function AreaOutcodes({
  chips,
  active,
  loading,
  allRemoved,
  onToggle,
}: {
  chips: readonly string[] | null;
  active: readonly string[];
  loading: boolean;
  allRemoved: boolean;
  onToggle: (outcode: string) => void;
}) {
  if (loading) {
    return (
      <p className="text-[11px] text-slate">Resolving covering postcodes…</p>
    );
  }
  if (!chips || chips.length === 0) {
    return null;
  }
  const activeSet = new Set(active);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] text-slate uppercase tracking-[0.14em]">
        Covers {active.length} of {chips.length} postcode
        {chips.length === 1 ? "" : "s"} · tap to toggle
      </span>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((oc) => {
          const on = activeSet.has(oc);
          return (
            <button
              className={
                on
                  ? "inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1.5 text-[12px] text-navy"
                  : "inline-flex items-center gap-1.5 rounded-full border border-line border-dashed bg-transparent px-2.5 py-1.5 text-[12px] text-slate"
              }
              key={oc}
              onClick={() => onToggle(oc)}
              type="button"
            >
              <span className={on ? "" : "line-through decoration-slate/60"}>
                {oc}
              </span>
              <HugeiconsIcon
                aria-hidden
                className="text-slate-2"
                icon={on ? Cancel01Icon : PlusSignIcon}
                size={11}
                strokeWidth={2}
              />
              <span className="sr-only">
                {on ? `Switch off ${oc}` : `Switch on ${oc}`}
              </span>
            </button>
          );
        })}
      </div>
      {allRemoved ? (
        <p className="text-[11px] text-copper">
          All postcodes switched off — tap to switch some back on, or this
          search will scrape nothing.
        </p>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// List (exclude)
// -----------------------------------------------------------------------------

type ListProps = {
  values: SearchLocation[];
  onChange: (next: SearchLocation[]) => void;
};

export function LocationsList({ values, onChange }: ListProps) {
  /**
   * Dedup on Google placeId. The autocomplete never returns the same
   * placeId twice in a single picker session, but the form can survive
   * a hot-reload mid-edit and we don't want to render duplicate chips.
   */
  const add = (loc: SearchLocation) => {
    if (values.some((v) => v.placeId === loc.placeId)) {
      return;
    }
    onChange([...values, loc]);
  };
  const remove = (placeId: string) => {
    onChange(values.filter((v) => v.placeId !== placeId));
  };

  return (
    <div className="space-y-2">
      <span className="text-[10px] text-slate uppercase tracking-[0.14em]">
        Exclude{values.length > 0 ? ` · ${values.length} area${values.length === 1 ? "" : "s"}` : ""}
      </span>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1.5"
              key={v.placeId || v.name}
              onClick={() => remove(v.placeId || v.name)}
              type="button"
            >
              <span className="text-[12px] text-slate line-through decoration-slate/70">
                {v.name}
              </span>
              <HugeiconsIcon
                className="text-slate-2"
                icon={Cancel01Icon}
                size={11}
                strokeWidth={2}
              />
              <span className="sr-only">Remove {v.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      <PlaceAutocomplete onSelect={add} placeholder="Add a place to skip…" />
    </div>
  );
}
