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

import { Cancel01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
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
      onChange({ ...loc, coveringOutcodes: result.outcodes });
    } catch {
      // Network blip — empty list short-circuits the chip render and
      // the save-path resolver falls back to its single-ref behaviour.
      onChange({ ...loc, coveringOutcodes: [] });
    }
  };

  const removeOutcode = (oc: string) => {
    if (!value?.coveringOutcodes) {
      return;
    }
    onChange({
      ...value,
      coveringOutcodes: value.coveringOutcodes.filter((c) => c !== oc),
    });
  };

  const isArea = value !== null && value.type !== "postal_code";
  const chips = value?.coveringOutcodes ?? null;
  const resolving = isArea && resolveOutcodes.isPending;
  const allRemoved = isArea && chips !== null && chips.length === 0;

  let chipCount = 0;
  if (isArea && chips) {
    chipCount = chips.length;
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
              allRemoved={allRemoved}
              chips={chips}
              loading={resolving}
              onRemove={removeOutcode}
            />
          ) : null}
        </div>
      ) : (
        <PlaceAutocomplete
          onSelect={(loc) => {
            handlePick(loc).catch(() => {
              // handlePick already swallows resolver errors internally;
              // this guards the floating-promise lint rule.
            });
          }}
          placeholder="Postcode, area, or town…"
        />
      )}
    </div>
  );
}

/**
 * Covering-outcodes chip list for area-typed picks. Each chip is a
 * removable pill — clicking the × drops it from the location's
 * `coveringOutcodes`, which `stampPortalRefs` then honours at save
 * time. Renders a single-row placeholder while the server function
 * resolves, and a warning row if the user has dropped every outcode
 * (the search would scrape nothing).
 */
function AreaOutcodes({
  chips,
  loading,
  allRemoved,
  onRemove,
}: {
  chips: readonly string[] | null;
  loading: boolean;
  allRemoved: boolean;
  onRemove: (outcode: string) => void;
}) {
  if (loading) {
    return (
      <p className="text-[11px] text-slate">Resolving covering postcodes…</p>
    );
  }
  if (allRemoved) {
    return (
      <p className="text-[11px] text-copper">
        No postcodes selected — add some back or pick a different area to
        scrape anything.
      </p>
    );
  }
  if (!chips || chips.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] text-slate uppercase tracking-[0.14em]">
        Covers {chips.length} postcode{chips.length === 1 ? "" : "s"}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((oc) => (
          <button
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1.5 text-[12px] text-navy"
            key={oc}
            onClick={() => onRemove(oc)}
            type="button"
          >
            <span>{oc}</span>
            <HugeiconsIcon
              aria-hidden
              className="text-slate-2"
              icon={Cancel01Icon}
              size={11}
              strokeWidth={2}
            />
            <span className="sr-only">Remove {oc}</span>
          </button>
        ))}
      </div>
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
