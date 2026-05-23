/**
 * Multi-commute-target editor.
 *
 * Wraps N `CommuteTargetRow` instances with add/remove controls. The
 * existing `CommuteTargetRow` is single-target (value | null + Save /
 * Skip); here we treat its `null` callback as "delete this row" and
 * compose a list around it.
 *
 * Empty state: render only the "+ Add commute target" button — no
 * placeholder row, so the form doesn't ship with a forced blank.
 */
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type CommuteTarget, CommuteTargetRow } from "./commute-target-row";

type Props = {
  value: CommuteTarget[];
  onChange: (next: CommuteTarget[]) => void;
};

export function CommuteTargetsList({ value, onChange }: Props) {
  const append = () => {
    onChange([
      ...value,
      // Inserted as a blank stub so CommuteTargetRow opens in edit mode.
      // We pass `null` via the row component's controlled value so the
      // user is prompted to fill it in before it commits. To keep state
      // simple we materialise an empty entry up front and let the row
      // overwrite it on Save.
      { label: "", lat: 0, lng: 0, maxMinutes: 35, mode: "transit" },
    ]);
  };

  const replaceAt = (idx: number, next: CommuteTarget | null) => {
    if (next === null) {
      // Skip / clear collapses to remove the row entirely.
      onChange(value.filter((_, i) => i !== idx));
      return;
    }
    onChange(value.map((t, i) => (i === idx ? next : t)));
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
        <span>Add commute target</span>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {value.map((target, idx) => (
        // The list is index-keyed (no stable id on the target). Re-
        // ordering would tear state — we only ever append/remove from
        // the ends, so this is fine in practice.
        <div className="flex items-start gap-2" key={idx}>
          <div className="min-w-0 flex-1">
            <CommuteTargetRow
              onChange={(next) => replaceAt(idx, next)}
              value={target.label ? target : null}
            />
          </div>
          <button
            aria-label="Remove commute target"
            className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => removeAt(idx)}
            type="button"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
      <button
        className="inline-flex items-center gap-1 rounded-full border border-primary/60 border-dashed px-3 py-1.5 text-primary text-sm"
        onClick={append}
        type="button"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
        <span>Add another commute</span>
      </button>
    </div>
  );
}
