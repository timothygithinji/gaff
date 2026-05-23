import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "../../lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  let _values: number[];
  if (Array.isArray(value)) {
    _values = value;
  } else if (Array.isArray(defaultValue)) {
    _values = defaultValue;
  } else {
    _values = [min, max];
  }

  return (
    <SliderPrimitive.Root
      className={cn(
        "data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full",
        className
      )}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow select-none overflow-hidden rounded-full bg-foreground/15 data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="select-none bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="after:-inset-2 relative block size-3 shrink-0 select-none rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] after:absolute hover:ring-3 focus-visible:outline-hidden focus-visible:ring-3 active:ring-3 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
