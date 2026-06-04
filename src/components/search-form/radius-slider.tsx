/**
 * Search-radius picker.
 *
 * Discrete slider matching Rightmove's canonical vocab —
 * `[0, 0.25, 0.5, 1, 3, 5, 10, 15, 20, 30, 40]` miles. Index `0` means
 * "this area only" (no buffer); the URL builders honour this strictly
 * on Rightmove + Zoopla (both accept `radius=0`). OpenRent's UI floor
 * is 2km, so anything ≤1mi rounds to 2km at URL-build time — see
 * `openrentSearchUrl` in `src/lib/portal-urls.ts`.
 *
 * The slider's `value` / `step` work in step *index* (integer 0..N-1)
 * rather than the underlying mile value because the steps aren't
 * evenly spaced. Snapping is therefore exact and we never store an
 * off-vocab value.
 */
import { Slider } from "../../components/ui/slider";

export const RADIUS_STEPS_MILES = [
  0, 0.25, 0.5, 1, 3, 5, 10, 15, 20, 30, 40,
] as const;

function formatMiles(miles: number): string {
  if (miles === 0) {
    return "This area only";
  }
  if (miles === 0.25) {
    return "Within ¼ mile";
  }
  if (miles === 0.5) {
    return "Within ½ mile";
  }
  if (miles === 1) {
    return "Within 1 mile";
  }
  return `Within ${miles} miles`;
}

function indexFor(value: number): number {
  const idx = RADIUS_STEPS_MILES.indexOf(
    value as (typeof RADIUS_STEPS_MILES)[number]
  );
  return idx === -1 ? 0 : idx;
}

type Props = {
  value: number;
  onChange: (next: number) => void;
};

export function RadiusSlider({ value, onChange }: Props) {
  const idx = indexFor(value);
  const maxIdx = RADIUS_STEPS_MILES.length - 1;

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-line bg-paper px-4.5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate uppercase tracking-[0.14em]">
          Radius
        </span>
        <span className="text-[13px] text-navy">{formatMiles(value)}</span>
      </div>
      <Slider
        className="mt-1 [&_[data-slot=slider-range]]:bg-copper [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-copper [&_[data-slot=slider-track]]:h-1"
        max={maxIdx}
        min={0}
        onValueChange={(next) => {
          if (Array.isArray(next) && next.length === 1) {
            const nextIdx = next[0] as number;
            const miles = RADIUS_STEPS_MILES[nextIdx];
            if (typeof miles === "number") {
              onChange(miles);
            }
          }
        }}
        step={1}
        value={[idx]}
      />
    </div>
  );
}
