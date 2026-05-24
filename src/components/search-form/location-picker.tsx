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
import type { SearchLocation } from "../../lib/search-location";
import { PlaceAutocomplete } from "./place-autocomplete";

// -----------------------------------------------------------------------------
// Single (include)
// -----------------------------------------------------------------------------

type SingleProps = {
  value: SearchLocation | null;
  onChange: (next: SearchLocation | null) => void;
};

export function SingleLocationPicker({ value, onChange }: SingleProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          INCLUDE
        </span>
      </div>
      {value ? (
        // Card row mirroring CadencePicker's visual language so the
        // form's "single chosen value, click to change" controls stay
        // consistent. The whole row is the clear-button so the affordance
        // is obvious; the inner × is purely decorative + accessible.
        <button
          className="flex w-full items-center justify-between rounded-2xl bg-muted px-4 py-4 text-left"
          onClick={() => onChange(null)}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <HugeiconsIcon
                icon={Location01Icon}
                size={18}
                strokeWidth={1.8}
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-foreground text-sm">
                {value.name}
              </span>
              {value.formattedAddress && value.formattedAddress !== value.name ? (
                <span className="block truncate text-muted-foreground text-xs">
                  {value.formattedAddress}
                </span>
              ) : null}
            </span>
          </span>
          <HugeiconsIcon
            aria-hidden
            className="shrink-0 text-muted-foreground"
            icon={Cancel01Icon}
            size={16}
            strokeWidth={2}
          />
          <span className="sr-only">Clear {value.name}</span>
        </button>
      ) : (
        <PlaceAutocomplete
          onSelect={(loc) => onChange(loc)}
          placeholder="Postcode, area, or town…"
        />
      )}
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
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          EXCLUDE{values.length > 0 ? ` · ${values.length}` : ""}
        </span>
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-muted px-3 py-1.5 text-foreground text-sm line-through decoration-primary/60"
              key={v.placeId || v.name}
              onClick={() => remove(v.placeId || v.name)}
              type="button"
            >
              <span>{v.name}</span>
              <HugeiconsIcon
                className="text-muted-foreground"
                icon={Cancel01Icon}
                size={12}
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
