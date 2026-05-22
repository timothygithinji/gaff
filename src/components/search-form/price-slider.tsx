/**
 * Two-thumb rent range slider.
 *
 * Numbers render in Fraunces (serif) at a display weight to match the
 * editorial typography elsewhere in the form. Slider styling comes from
 * the shadcn Slider primitive — track/thumb colours follow `--primary`.
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
          <span className="text-foreground text-xl">
            £{lo.toLocaleString()}
          </span>
          <span className="text-muted-foreground text-sm">to</span>
          <span className="text-foreground text-xl">
            £{hi.toLocaleString()}
          </span>
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
