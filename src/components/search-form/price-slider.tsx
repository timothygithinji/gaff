/**
 * Two-thumb rent range slider.
 *
 * Numbers render in Fraunces (serif) at a display weight to match the
 * editorial typography elsewhere in the form. The track + thumbs use
 * the copper palette to match the rest of the form's selected states.
 */
import * as Slider from "@radix-ui/react-slider";

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
    <div className="rounded-2xl bg-bone px-5 py-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-brass uppercase tracking-[0.14em]">
          RENT · /MO
        </span>
        <div className="flex items-baseline gap-2 font-serif">
          <span className="text-ink text-xl">£{lo.toLocaleString()}</span>
          <span className="text-brass text-sm">to</span>
          <span className="text-ink text-xl">£{hi.toLocaleString()}</span>
        </div>
      </div>
      <Slider.Root
        className="relative mt-5 flex h-5 w-full touch-none select-none items-center"
        max={max}
        min={min}
        minStepsBetweenThumbs={1}
        onValueChange={(next) => {
          if (next.length === 2) {
            onChange([next[0] as number, next[1] as number]);
          }
        }}
        step={step}
        value={value}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-copper/15">
          <Slider.Range className="absolute h-full rounded-full bg-copper" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Minimum rent"
          className="block h-5 w-5 rounded-full border border-copper/80 bg-paper shadow focus:outline-none focus:ring-2 focus:ring-copper/30"
        />
        <Slider.Thumb
          aria-label="Maximum rent"
          className="block h-5 w-5 rounded-full border border-copper/80 bg-paper shadow focus:outline-none focus:ring-2 focus:ring-copper/30"
        />
      </Slider.Root>
    </div>
  );
}
