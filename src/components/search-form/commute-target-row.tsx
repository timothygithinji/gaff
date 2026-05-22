/**
 * Commute target row.
 *
 * v1 supports a single commute target — the design hints at multi-row
 * but ships single. Mode is fixed to "transit" (TfL bias); a richer
 * picker lands when PR 9 wires the Google Maps Embed for the detail
 * view.
 *
 * TODO: replace with Google Places Autocomplete once wired. For now
 * the row accepts plain label + lat + lng inputs so we can persist
 * a real `commuteTargets[]` shape without the API dependency.
 */
import { ArrowRight01Icon, Building02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "../../components/ui/button";

export type CommuteTarget = {
  label: string;
  lat: number;
  lng: number;
  maxMinutes: number;
  mode: string;
};

type Props = {
  value: CommuteTarget | null;
  onChange: (next: CommuteTarget | null) => void;
};

export function CommuteTargetRow({ value, onChange }: Props) {
  const [editing, setEditing] = useState(value === null);
  const [draft, setDraft] = useState<CommuteTarget>(
    value ?? { label: "", lat: 0, lng: 0, maxMinutes: 35, mode: "transit" }
  );

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
              Show commute · max {value.maxMinutes} min
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
    <div className="space-y-3 rounded-2xl bg-muted p-5">
      <div className="space-y-1">
        <label
          className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]"
          htmlFor="commute-label"
        >
          Address
        </label>
        <input
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm outline-none focus:border-primary/60"
          id="commute-label"
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="22 Bishopsgate · EC2N"
          value={draft.label}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]"
            htmlFor="commute-lat"
          >
            Lat
          </label>
          <input
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm outline-none focus:border-primary/60"
            id="commute-lat"
            onChange={(e) =>
              setDraft({ ...draft, lat: Number(e.target.value) || 0 })
            }
            step="0.000001"
            type="number"
            value={draft.lat || ""}
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]"
            htmlFor="commute-lng"
          >
            Lng
          </label>
          <input
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm outline-none focus:border-primary/60"
            id="commute-lng"
            onChange={(e) =>
              setDraft({ ...draft, lng: Number(e.target.value) || 0 })
            }
            step="0.000001"
            type="number"
            value={draft.lng || ""}
          />
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
          Skip commute
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
            disabled={!draft.label.trim() || !draft.maxMinutes}
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
