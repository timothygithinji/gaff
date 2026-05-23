/**
 * Multi-transport-target editor.
 *
 * Each row captures: "max X [mode] minutes to the nearest [amenity class]".
 * Amenity classes are tube_station / train_station / bus_stop / tram_stop;
 * modes mirror commute (walk / cycle / transit / drive). Both pickers
 * default to a sensible starting choice (tube_station + walk) so a row
 * is immediately editable to a number.
 *
 * Styling follows the rest of the search form's vocabulary — pill
 * groups via the existing `bg-muted` chrome and a dashed "+ Add"
 * affordance matching `OutcodeChips` / `CommuteTargetRow`.
 */
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type TransportAmenity =
  | "tube_station"
  | "train_station"
  | "bus_stop"
  | "tram_stop";

export type TransportMode = "walk" | "cycle" | "transit" | "drive";

export type TransportTarget = {
  amenity: TransportAmenity;
  mode: TransportMode;
  maxMinutes: number;
};

const AMENITY_OPTIONS: Array<{ id: TransportAmenity; label: string }> = [
  { id: "tube_station", label: "Tube station" },
  { id: "train_station", label: "Train station" },
  { id: "bus_stop", label: "Bus stop" },
  { id: "tram_stop", label: "Tram stop" },
];

const MODE_OPTIONS: Array<{ id: TransportMode; label: string }> = [
  { id: "walk", label: "Walk" },
  { id: "cycle", label: "Cycle" },
  { id: "transit", label: "Bus/Tube" },
  { id: "drive", label: "Drive" },
];

const DEFAULT_TARGET: TransportTarget = {
  amenity: "tube_station",
  mode: "walk",
  maxMinutes: 10,
};

type Props = {
  value: TransportTarget[];
  onChange: (next: TransportTarget[]) => void;
};

export function TransportTargetsList({ value, onChange }: Props) {
  const append = () => {
    onChange([...value, { ...DEFAULT_TARGET }]);
  };

  const replaceAt = (idx: number, patch: Partial<TransportTarget>) => {
    onChange(value.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  if (value.length === 0) {
    return (
      <button
        className="inline-flex items-center gap-1 rounded-full border border-primary/60 border-dashed px-3 py-1.5 text-primary text-sm"
        onClick={append}
        type="button"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
        <span>Add transport target</span>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {value.map((target, idx) => (
        // Index-keyed: the list is append-only (no reorder), so no
        // stable id is needed on each target.
        <div className="space-y-3 rounded-2xl bg-muted p-4" key={idx}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
              Transport · max {target.maxMinutes || "—"} min
            </p>
            <button
              aria-label="Remove transport target"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
              onClick={() => removeAt(idx)}
              type="button"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
              Nearest
            </p>
            <div className="flex flex-wrap gap-1.5">
              {AMENITY_OPTIONS.map((opt) => (
                <button
                  className={
                    opt.id === target.amenity
                      ? "rounded-full bg-primary/15 px-3 py-1 text-foreground text-xs"
                      : "rounded-full border border-border bg-card px-3 py-1 text-muted-foreground text-xs hover:text-foreground"
                  }
                  key={opt.id}
                  onClick={() => replaceAt(idx, { amenity: opt.id })}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
              By
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MODE_OPTIONS.map((opt) => (
                <button
                  className={
                    opt.id === target.mode
                      ? "rounded-full bg-primary/15 px-3 py-1 text-foreground text-xs"
                      : "rounded-full border border-border bg-card px-3 py-1 text-muted-foreground text-xs hover:text-foreground"
                  }
                  key={opt.id}
                  onClick={() => replaceAt(idx, { mode: opt.id })}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label
              className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]"
              htmlFor={`transport-max-${idx}`}
            >
              Max minutes
            </label>
            <input
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm outline-none focus:border-primary/60"
              id={`transport-max-${idx}`}
              max={120}
              min={1}
              onChange={(e) =>
                replaceAt(idx, {
                  maxMinutes: Math.max(
                    1,
                    Math.min(120, Number(e.target.value) || 1)
                  ),
                })
              }
              type="number"
              value={target.maxMinutes || ""}
            />
          </div>
        </div>
      ))}
      <button
        className="inline-flex items-center gap-1 rounded-full border border-primary/60 border-dashed px-3 py-1.5 text-primary text-sm"
        onClick={append}
        type="button"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
        <span>Add transport target</span>
      </button>
    </div>
  );
}
