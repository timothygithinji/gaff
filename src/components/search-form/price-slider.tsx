import { useEffect, useState } from "react";
/**
 * Two-thumb rent range slider with editable number inputs.
 *
 * Each value renders as an inline `<input>` styled to look like the
 * serif display text — the user can either drag the slider or click
 * a number to type it directly. Both surfaces share the same form
 * state, so dragging updates the typed value and vice versa.
 *
 * Bounds enforcement is loose: each input clamps to `[0, max]`
 * absolute. We don't enforce `lo ≤ hi` in real-time because that
 * blocks the user from ever lowering `hi` below the current `lo`
 * (or vice versa) without doing it in the "right" order. The form's
 * server-side superRefine catches `min > max` on submit.
 */
import { Slider } from "../../components/ui/slider";

type Props = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
};

export function PriceSlider({ min, max, step = 50, value, onChange }: Props) {
  const [lo, hi] = value;

  return (
    <div className="rounded-2xl bg-muted px-5 py-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          RENT · /MO
        </span>
        <div className="flex items-baseline gap-2 font-serif">
          <PriceInput
            max={max}
            onChange={(n) => onChange([n, hi])}
            value={lo}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <PriceInput
            max={max}
            onChange={(n) => onChange([lo, n])}
            value={hi}
          />
        </div>
      </div>
      <Slider
        className="mt-5"
        max={max}
        min={min}
        minStepsBetweenValues={1}
        onValueChange={(next) => {
          if (Array.isArray(next) && next.length === 2) {
            onChange([next[0] as number, next[1] as number]);
          }
        }}
        step={step}
        value={value}
      />
    </div>
  );
}

type PriceInputProps = {
  value: number;
  max: number;
  onChange: (next: number) => void;
};

function PriceInput({ value, max, onChange }: PriceInputProps) {
  // Local string state so the field can briefly hold partial input
  // (empty, "5", "50") without the parent's numeric value snapping the
  // text back. We re-sync whenever the parent value changes (e.g. the
  // user dragged the slider).
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <label className="inline-flex items-baseline text-foreground text-xl">
      <span aria-hidden>£</span>
      {/* biome-ignore lint/nursery/noStaticElementInteractions: <input> is intrinsically interactive */}
      <input
        aria-label="Rent value"
        className="-mx-1 w-20 rounded bg-transparent px-1 text-right text-xl outline-none focus:bg-card/60"
        inputMode="numeric"
        onChange={(e) => {
          // Strip everything that isn't a digit. Empty string is fine
          // mid-edit — we commit 0 to the parent so the slider stays
          // in sync but the input stays blank-looking.
          const stripped = e.target.value.replace(/[^0-9]/g, "");
          setText(stripped);
          const n = stripped === "" ? 0 : Number(stripped);
          onChange(Math.min(Math.max(n, 0), max));
        }}
        onFocus={(e) => e.target.select()}
        value={text}
      />
    </label>
  );
}
