import { useEffect, useState } from "react";
/**
 * Two-thumb rent range slider, styled to the Paper "Price & size" RENT
 * row: a bordered white card with a small-caps "RENT · /MO" label, an
 * inline editable "£lo to £hi" value, and a copper range/thumbs track.
 *
 * Each value renders as an inline `<input>` so the user can drag the
 * slider or type a number directly. Both share the same form state.
 *
 * Bounds enforcement is loose: each input clamps to `[0, max]`. We
 * don't enforce `lo ≤ hi` in real-time (it would block lowering `hi`
 * below `lo`). The server's superRefine catches `min > max` on submit.
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
    <div className="flex h-full flex-col gap-2.5 rounded-md border border-line bg-paper px-4.5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate uppercase tracking-[0.14em]">
          Rent · /mo
        </span>
        <div className="flex items-baseline gap-1 text-[13px] text-navy">
          <PriceInput max={max} onChange={(n) => onChange([n, hi])} value={lo} />
          <span className="text-slate">to</span>
          <PriceInput max={max} onChange={(n) => onChange([lo, n])} value={hi} />
        </div>
      </div>
      <Slider
        className="mt-1 [&_[data-slot=slider-range]]:bg-copper [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-copper [&_[data-slot=slider-track]]:h-1"
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
  // text back. Re-sync whenever the parent value changes (e.g. drag).
  const [text, setText] = useState(formatGbp(value));
  useEffect(() => {
    setText(formatGbp(value));
  }, [value]);

  return (
    <label className="inline-flex items-baseline text-[13px] text-navy">
      <span aria-hidden>£</span>
      {/* biome-ignore lint/nursery/noStaticElementInteractions: <input> is intrinsically interactive */}
      <input
        aria-label="Rent value"
        className="-mx-1 w-[58px] rounded-sm bg-transparent px-1 text-right outline-none focus:bg-mist"
        inputMode="numeric"
        onBlur={() => setText(formatGbp(value))}
        onChange={(e) => {
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

function formatGbp(n: number): string {
  return n.toLocaleString("en-GB");
}
