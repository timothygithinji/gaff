/**
 * Queue filter — narrows the desktop Review "Up next" rail by bedrooms,
 * furnishing, availability, and a max-price ceiling.
 *
 * Purely client-side over the already-loaded queue: it transforms the
 * `items` the rail already has, so there's no refetch and the server
 * queue ranking + swipe pipeline stay untouched. Built on the shadcn
 * Popover so the panel inherits the app's focus-trap / keyboard / dismiss
 * behaviour for free.
 *
 * The filter is intentionally rail-scoped — it changes what's visible in
 * "Up next", not which card the server hands back as the hero. The header
 * count ("N of M") signals when a filter is hiding rows.
 */
import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Slider } from "../ui/slider";

export type QueueFilters = {
  /** Selected bedroom counts; `4` stands for "4+". Empty = any. */
  beds: number[];
  /** Selected furnishing labels ("Furnished" / …). Empty = any. */
  furnished: string[];
  /** Restrict to "Avail now" listings when true. */
  availableNow: boolean;
  /** Inclusive monthly-rent ceiling; null = no ceiling. */
  maxPrice: number | null;
};

export const EMPTY_QUEUE_FILTERS: QueueFilters = {
  beds: [],
  furnished: [],
  availableNow: false,
  maxPrice: null,
};

// `4` is the open-ended "4+" bucket; the others match exactly.
const BED_OPTIONS = [1, 2, 3, 4] as const;
// Mirrors the labels `formatFurnished` writes onto each queue item.
const FURNISHED_OPTIONS = [
  "Furnished",
  "Unfurnished",
  "Part furnished",
] as const;

/** How many facets are actively narrowing the queue (drives the badge). */
export function activeFilterCount(f: QueueFilters): number {
  return (
    (f.beds.length > 0 ? 1 : 0) +
    (f.furnished.length > 0 ? 1 : 0) +
    (f.availableNow ? 1 : 0) +
    (f.maxPrice != null ? 1 : 0)
  );
}

/** The minimal item shape the filter reads — a subset of the rail item. */
export type QueueFilterable = {
  beds: number | null;
  furnished: string | null;
  availability: string | null;
  priceValue: number | null;
};

/**
 * True when an item survives every active facet. A facet with no
 * selection is a no-op. Items missing the field a facet narrows on are
 * dropped (you asked for 2-beds; a bed-less row isn't a 2-bed) — except
 * price, where a null follows the codebase's "unknown price is kept"
 * convention so a missing rent never silently hides a listing.
 */
export function matchesQueueFilters(
  item: QueueFilterable,
  f: QueueFilters
): boolean {
  if (f.beds.length > 0) {
    const beds = item.beds;
    if (beds == null) {
      return false;
    }
    const hit = f.beds.some((b) => (b === 4 ? beds >= 4 : beds === b));
    if (!hit) {
      return false;
    }
  }
  if (f.furnished.length > 0 && !(item.furnished && f.furnished.includes(item.furnished))) {
      return false;
    }
  if (f.availableNow && item.availability !== "Avail now") {
    return false;
  }
  if (
    f.maxPrice != null &&
    item.priceValue != null &&
    item.priceValue > f.maxPrice
  ) {
    return false;
  }
  return true;
}

/**
 * Min/max across a set of (possibly-null) monthly rents, snapped to £50
 * so the slider lands on round numbers. Null when there's no usable
 * spread (fewer than two priced rows, or every priced row the same) — the
 * filter then hides the price slider.
 */
export function queuePriceBounds(
  prices: Array<number | null>
): { min: number; max: number } | null {
  const real = prices.filter((p): p is number => p != null);
  if (real.length < 2) {
    return null;
  }
  const min = Math.floor(Math.min(...real) / 50) * 50;
  const max = Math.ceil(Math.max(...real) / 50) * 50;
  return max > min ? { min, max } : null;
}

type Props = {
  filters: QueueFilters;
  onChange: (next: QueueFilters) => void;
  /** Price range across the unfiltered queue; null hides the slider. */
  priceBounds: { min: number; max: number } | null;
};

export function QueueFilter({ filters, onChange, priceBounds }: Props) {
  const count = activeFilterCount(filters);

  const toggleBed = (b: number) =>
    onChange({
      ...filters,
      beds: filters.beds.includes(b)
        ? filters.beds.filter((x) => x !== b)
        : [...filters.beds, b].sort((a, z) => a - z),
    });

  const toggleFurnished = (label: string) =>
    onChange({
      ...filters,
      furnished: filters.furnished.includes(label)
        ? filters.furnished.filter((x) => x !== label)
        : [...filters.furnished, label],
    });

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[6px] border px-2 font-medium text-[11px] transition-colors",
          count > 0
            ? "border-[#0e2235] text-navy"
            : "border-line text-slate hover:border-steel/60"
        )}
      >
        <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={1.8} />
        Filter
        {count > 0 ? (
          <span className='flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#0e2235] px-1 font-semibold text-[#eef1f4] text-[9px] leading-none'>
            {count}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-3.5">
        <Section label="Bedrooms">
          <div className="flex flex-wrap gap-1.5">
            {BED_OPTIONS.map((b) => (
              <Chip
                active={filters.beds.includes(b)}
                key={b}
                onClick={() => toggleBed(b)}
              >
                {b === 4 ? "4+" : b}
              </Chip>
            ))}
          </div>
        </Section>

        <Section label="Furnishing">
          <div className="flex flex-wrap gap-1.5">
            {FURNISHED_OPTIONS.map((label) => (
              <Chip
                active={filters.furnished.includes(label)}
                key={label}
                onClick={() => toggleFurnished(label)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </Section>

        <Section label="Availability">
          <Chip
            active={filters.availableNow}
            onClick={() =>
              onChange({ ...filters, availableNow: !filters.availableNow })
            }
          >
            Available now
          </Chip>
        </Section>

        {priceBounds ? (
          <Section
            label="Max price"
            value={
              filters.maxPrice != null
                ? `£${filters.maxPrice.toLocaleString("en-GB")}`
                : "Any"
            }
          >
            <Slider
              max={priceBounds.max}
              min={priceBounds.min}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                onChange({
                  ...filters,
                  // Snap the top of the range back to "no ceiling" so the
                  // facet count + chip clear cleanly at the max.
                  maxPrice: next >= priceBounds.max ? null : next,
                });
              }}
              step={50}
              value={[filters.maxPrice ?? priceBounds.max]}
            />
          </Section>
        ) : null}

        {count > 0 ? (
          <button
            className="self-start font-medium text-[11px] text-slate underline-offset-2 transition-colors hover:text-navy hover:underline"
            onClick={() => onChange(EMPTY_QUEUE_FILTERS)}
            type="button"
          >
            Clear all
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function Section({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-[10px] text-slate uppercase leading-3 tracking-[0.14em]">
          {label}
        </span>
        {value ? (
          <span className="text-[11px] text-navy leading-3">{value}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center rounded-[6px] border px-2.5 font-medium text-[12px] transition-colors",
        active
          ? "border-[#0e2235] bg-[#0e2235] text-[#eef1f4]"
          : "border-line bg-paper text-slate hover:border-steel/60"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
