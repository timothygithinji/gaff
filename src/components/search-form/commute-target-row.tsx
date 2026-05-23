/**
 * Commute target row.
 *
 * One named destination ("22 Bishopsgate · EC2N") + a transport mode +
 * a max-minutes cap. The address is captured via Google Places
 * Autocomplete (`useGoogleMaps` loads the JS API once per session); on
 * place selection we pull `geometry.location.lat() / lng()` plus
 * `formatted_address` and stuff them into draft state. The user never
 * sees lat/lng — they're an implementation detail of the commute
 * enrichment task.
 *
 * Modes mirror the transport-target picker for visual + semantic
 * consistency (walk / cycle / transit / drive).
 */
import { ArrowRight01Icon, Building02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useGoogleMaps } from "../../hooks/use-google-maps";

export type CommuteTarget = {
  label: string;
  lat: number;
  lng: number;
  maxMinutes: number;
  mode: string;
};

type CommuteMode = "walk" | "cycle" | "transit" | "drive";

const MODE_OPTIONS: Array<{ id: CommuteMode; label: string }> = [
  { id: "walk", label: "Walk" },
  { id: "cycle", label: "Cycle" },
  { id: "transit", label: "Bus/Tube" },
  { id: "drive", label: "Drive" },
];

const DEFAULT_DRAFT: CommuteTarget = {
  label: "",
  lat: 0,
  lng: 0,
  maxMinutes: 35,
  mode: "transit",
};

type Props = {
  value: CommuteTarget | null;
  onChange: (next: CommuteTarget | null) => void;
};

export function CommuteTargetRow({ value, onChange }: Props) {
  const [editing, setEditing] = useState(value === null);
  const [draft, setDraft] = useState<CommuteTarget>(value ?? DEFAULT_DRAFT);

  if (!editing && value) {
    return (
      <button
        className="flex w-full items-center justify-between rounded-2xl bg-muted px-4 py-4 text-left"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        type="button"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <HugeiconsIcon icon={Building02Icon} size={18} strokeWidth={1.8} />
          </span>
          <span>
            <span className="block text-foreground text-sm">{value.label}</span>
            <span className="block text-muted-foreground text-xs">
              max {value.maxMinutes} min · {modeLabel(value.mode)}
            </span>
          </span>
        </span>
        <HugeiconsIcon
          className="text-muted-foreground"
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={2}
        />
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-muted p-5">
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          Address
        </p>
        {value && (
          <p className="text-muted-foreground text-xs">
            Current: <span className="text-foreground">{value.label}</span> ·
            pick a new place to change it.
          </p>
        )}
        <PlacesAutocompleteInput
          onSelect={(picked) => setDraft({ ...draft, ...picked })}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          Mode
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MODE_OPTIONS.map((opt) => {
            const active = draft.mode === opt.id;
            return (
              <button
                className={
                  active
                    ? "rounded-full bg-foreground px-3 py-1.5 font-medium text-background text-xs"
                    : "rounded-full bg-card px-3 py-1.5 text-muted-foreground text-xs"
                }
                key={opt.id}
                onClick={() => setDraft({ ...draft, mode: opt.id })}
                type="button"
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <label
          className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]"
          htmlFor="commute-max"
        >
          Max minutes
        </label>
        <input
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm outline-none focus:border-primary/60"
          id="commute-max"
          max={240}
          min={1}
          onChange={(e) =>
            setDraft({ ...draft, maxMinutes: Number(e.target.value) || 0 })
          }
          type="number"
          value={draft.maxMinutes || ""}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          className="text-muted-foreground text-xs underline-offset-2 hover:underline"
          onClick={() => {
            onChange(null);
            setEditing(false);
          }}
          type="button"
        >
          Remove
        </button>
        <div className="flex gap-2">
          {value && (
            <Button
              onClick={() => setEditing(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          )}
          <Button
            disabled={!(draft.label.trim() && draft.maxMinutes && draft.lat)}
            onClick={() => {
              onChange(draft);
              setEditing(false);
            }}
            size="sm"
            type="button"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function modeLabel(mode: string): string {
  return MODE_OPTIONS.find((m) => m.id === mode)?.label ?? mode;
}

type PlacesProps = {
  onSelect: (next: { label: string; lat: number; lng: number }) => void;
};

/**
 * Modern Google Places autocomplete via `PlaceAutocompleteElement` —
 * a web component (`<gmp-place-autocomplete>`) that bundles its own
 * input + dropdown. Google deprecated the legacy `Autocomplete`
 * widget for new customers (March 2025); this is the recommended
 * replacement.
 *
 * The element is instantiated programmatically and appended to a
 * container `<div>` rather than rendered as JSX — that way we don't
 * need to teach the JSX runtime about the custom element. Cleanup on
 * unmount removes the appended child.
 *
 * Events: `gmp-select` fires when the user picks a prediction. The
 * event carries a `placePrediction` whose `.toPlace()` returns a
 * Place that has to be populated via `fetchFields()` before its
 * `displayName`, `formattedAddress`, and `location` are readable.
 */
function PlacesAutocompleteInput({ onSelect }: PlacesProps) {
  const status = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      status !== "ready" ||
      !containerRef.current ||
      !window.google?.maps?.places
    ) {
      return;
    }
    const el = new window.google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ["gb"],
    });
    containerRef.current.appendChild(el);

    const handler = async (event: Event) => {
      const detail = (event as PlaceSelectEvent).placePrediction;
      if (!detail) {
        return;
      }
      const place = detail.toPlace();
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"],
      });
      const lat = place.location?.lat();
      const lng = place.location?.lng();
      const label = place.displayName ?? place.formattedAddress ?? "";
      if (typeof lat === "number" && typeof lng === "number" && label) {
        onSelect({ label, lat, lng });
      }
    };
    el.addEventListener("gmp-select", (event: Event) => {
      handler(event).catch(() => {
        // fetchFields() can reject if the place lookup fails; swallow
        // and let the user re-pick. The Save CTA stays disabled until
        // the parent has a valid lat from a successful selection.
      });
    });

    return () => {
      el.remove();
    };
  }, [status, onSelect]);

  if (status === "error") {
    return (
      <p className="text-destructive text-xs">
        Address search failed to load. Reload the page or check the GCP API key
        has Places API (New) enabled.
      </p>
    );
  }

  if (status !== "ready") {
    return (
      <div className="h-10 w-full animate-pulse rounded-md bg-card" aria-hidden />
    );
  }

  return <div className="w-full" ref={containerRef} />;
}

// Inline the event type from use-google-maps so we don't re-export it.
type PlaceSelectEvent = Event & {
  placePrediction: {
    toPlace: () => {
      displayName?: string;
      formattedAddress?: string;
      location?: { lat: () => number; lng: () => number };
      fetchFields: (opts: { fields: string[] }) => Promise<void>;
    };
  };
};
