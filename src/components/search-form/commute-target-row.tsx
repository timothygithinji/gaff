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
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { PlacesAutocompleteInput } from "../places-autocomplete-input";

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
        className="flex w-full items-center gap-3 rounded-md bg-mist px-3.5 py-3 text-left"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        type="button"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper text-slate">
          <HugeiconsIcon icon={Building02Icon} size={14} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[13px] text-navy">
            {value.label}
          </span>
          <span className="block text-[11px] text-slate">
            Max {value.maxMinutes} min · {modeLabel(value.mode)}
          </span>
        </span>
        <HugeiconsIcon
          className="shrink-0 text-slate-2"
          icon={ArrowRight01Icon}
          size={14}
          strokeWidth={2}
        />
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-line bg-paper p-4">
      <div className="space-y-1">
        <p className="text-[10px] text-slate uppercase tracking-[0.14em]">
          Address
        </p>
        {value && (
          <p className="text-muted-foreground text-xs">
            Current: <span className="text-foreground">{value.label}</span> ·
            pick a new place to change it.
          </p>
        )}
        <PlacesAutocompleteInput
          onSelect={({ label, lat, lng }) =>
            setDraft({ ...draft, label, lat, lng })
          }
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
