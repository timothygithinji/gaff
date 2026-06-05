/**
 * Queue filter — narrows the desktop Review "Up next" rail by bedrooms,
 * furnishing, availability, location (postcode area + outcode), and a
 * max-price ceiling.
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

/** How soon a listing is available — the move-in facet's choices. */
export type MoveInWindow = "any" | "now" | "1m" | "2m";

export type QueueFilters = {
  /** Selected bedroom counts; `4` stands for "4+". Empty = any. */
  beds: number[];
  /** Selected bathroom counts; `3` stands for "3+". Empty = any. */
  bathrooms: number[];
  /** Selected furnishing labels ("Furnished" / …). Empty = any. */
  furnished: string[];
  /** Move-in window; "any" = no restriction. */
  moveIn: MoveInWindow;
  /** Selected postcode-area prefixes ("SE", "N", …). Empty = any. */
  areas: string[];
  /** Selected full outcodes ("SE15", "N1", …). Empty = any. */
  outcodes: string[];
  /** Selected property kinds ("flat" / "house" / …). Empty = any. */
  types: string[];
  /** Drop house-shares / rooms in a shared house when true. */
  hideShares: boolean;
  /** Selected council-tax bands ("A"–"H"). Empty = any. */
  councilTax: string[];
  /** Selected EPC bands ("A"–"G"). Empty = any. */
  epc: string[];
  /** Inclusive commute-minutes ceiling; null = no ceiling. */
  maxCommute: number | null;
  /** Restrict to gigabit/FTTP-capable postcodes when true. */
  fttpOnly: boolean;
  /** Restrict to clusters listed on more than one portal when true. */
  crossListedOnly: boolean;
  /** Inclusive monthly-rent floor; null = no floor. */
  minPrice: number | null;
  /** Inclusive monthly-rent ceiling; null = no ceiling. */
  maxPrice: number | null;
};

export const EMPTY_QUEUE_FILTERS: QueueFilters = {
  beds: [],
  bathrooms: [],
  furnished: [],
  moveIn: "any",
  areas: [],
  outcodes: [],
  types: [],
  hideShares: false,
  councilTax: [],
  epc: [],
  maxCommute: null,
  fttpOnly: false,
  crossListedOnly: false,
  minPrice: null,
  maxPrice: null,
};

// `4` is the open-ended "4+" bucket; the others match exactly.
const BED_OPTIONS = [1, 2, 3, 4] as const;
// `3` is the open-ended "3+" bucket.
const BATH_OPTIONS = [1, 2, 3] as const;
// Mirrors the labels `formatFurnished` writes onto each queue item.
const FURNISHED_OPTIONS = [
  "Furnished",
  "Unfurnished",
  "Part furnished",
] as const;
// Move-in window chips ("any" is the cleared state, so it has no chip).
const MOVE_IN_OPTIONS: ReadonlyArray<{ value: MoveInWindow; label: string }> = [
  { value: "now", label: "Now" },
  { value: "1m", label: "≤ 1 month" },
  { value: "2m", label: "≤ 2 months" },
];
// Property-kind chip labels + render order. "share" has no chip — it's
// governed by the dedicated "Hide shares" toggle instead.
const TYPE_ORDER = ["flat", "house", "studio", "other"] as const;
const TYPE_LABELS: Record<string, string> = {
  flat: "Flat",
  house: "House",
  studio: "Studio",
  other: "Other",
};

/** How many facets are actively narrowing the queue (drives the badge). */
export function activeFilterCount(f: QueueFilters): number {
  return (
    (f.beds.length > 0 ? 1 : 0) +
    (f.bathrooms.length > 0 ? 1 : 0) +
    (f.furnished.length > 0 ? 1 : 0) +
    (f.moveIn !== "any" ? 1 : 0) +
    (f.areas.length > 0 ? 1 : 0) +
    (f.outcodes.length > 0 ? 1 : 0) +
    (f.types.length > 0 ? 1 : 0) +
    (f.hideShares ? 1 : 0) +
    (f.councilTax.length > 0 ? 1 : 0) +
    (f.epc.length > 0 ? 1 : 0) +
    (f.maxCommute != null ? 1 : 0) +
    (f.fttpOnly ? 1 : 0) +
    (f.crossListedOnly ? 1 : 0) +
    (f.minPrice != null ? 1 : 0) +
    (f.maxPrice != null ? 1 : 0)
  );
}

/** The minimal item shape the filter reads — a subset of the rail item. */
export type QueueFilterable = {
  beds: number | null;
  bathrooms: number | null;
  furnished: string | null;
  /** Days until move-in; 0 = available now/immediately, null = unknown. */
  availableInDays: number | null;
  /** Outcode, e.g. "SE15"; null = unknown. Backs the area + postcode facets. */
  outcode: string | null;
  /** Coarse property kind ("flat" / "house" / "studio" / "share" / "other"). */
  propertyKind: string | null;
  councilTaxBand: string | null;
  epcBand: string | null;
  commuteMinutes: number | null;
  /** Gigabit/FTTP available; null = unknown. */
  fttp: boolean | null;
  /** Distinct portals this cluster is listed on. */
  portalCount: number;
  priceValue: number | null;
};

/** Leading-letters of an outcode — the postcode area, e.g. "SE15" → "SE". */
const OUTCODE_AREA_RE = /^[A-Z]+/;

/**
 * Postcode-area prefix of an outcode — the leading letters, e.g. "SE15" →
 * "SE", "N1" → "N", "EC1A" → "EC". This is the standard London "postcode
 * area" and groups every outcode under it (all of South-East under "SE").
 */
export function outcodeArea(outcode: string): string {
  const upper = outcode.toUpperCase();
  const match = upper.match(OUTCODE_AREA_RE);
  return match ? match[0] : upper;
}

/**
 * Distinct postcode areas + outcodes present across the (unfiltered) queue,
 * each sorted for stable chip order. Built from the rows the rail already
 * holds so the option lists only ever show locations that are actually in
 * the queue — same client-side, no-refetch contract as {@link queuePriceBounds}.
 */
export function queueLocationOptions(
  outcodes: Array<string | null>
): { areas: string[]; outcodes: string[] } {
  const seen = outcodes.filter((o): o is string => Boolean(o)).map((o) =>
    o.toUpperCase()
  );
  const areas = [...new Set(seen.map(outcodeArea))].sort();
  const uniqueOutcodes = [...new Set(seen)].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true })
  );
  return { areas, outcodes: uniqueOutcodes };
}

/**
 * True when an item survives every active facet. A facet with no
 * selection is a no-op. Items missing the field a facet narrows on are
 * dropped (you asked for 2-beds; a bed-less row isn't a 2-bed) — except
 * price, where a null follows the codebase's "unknown price is kept"
 * convention so a missing rent never silently hides a listing. Each facet
 * is its own predicate so the whole thing reads as a flat AND.
 */
export function matchesQueueFilters(
  item: QueueFilterable,
  f: QueueFilters
): boolean {
  return (
    matchesCount(item.beds, f.beds, 4) &&
    matchesCount(item.bathrooms, f.bathrooms, 3) &&
    matchesFurnished(item.furnished, f.furnished) &&
    matchesMoveIn(item.availableInDays, f.moveIn) &&
    matchesLocation(item.outcode, f) &&
    matchesType(item.propertyKind, f) &&
    matchesBand(item.councilTaxBand, f.councilTax) &&
    matchesBand(item.epcBand, f.epc) &&
    matchesCommute(item.commuteMinutes, f.maxCommute) &&
    matchesFttp(item.fttp, f.fttpOnly) &&
    (!f.crossListedOnly || item.portalCount > 1) &&
    matchesPrice(item.priceValue, f.minPrice, f.maxPrice)
  );
}

/** Bed/bath count facet; `plus` is the open-ended top bucket ("4+"/"3+"). */
function matchesCount(
  value: number | null,
  selected: number[],
  plus: number
): boolean {
  if (selected.length === 0) {
    return true;
  }
  if (value == null) {
    return false;
  }
  return selected.some((n) => (n === plus ? value >= plus : value === n));
}

function matchesFurnished(value: string | null, selected: string[]): boolean {
  if (selected.length === 0) {
    return true;
  }
  return Boolean(value && selected.includes(value));
}

/** Move-in window — unknown availability drops once a window is chosen. */
function matchesMoveIn(days: number | null, w: MoveInWindow): boolean {
  if (w === "any") {
    return true;
  }
  if (days == null) {
    return false;
  }
  if (w === "now") {
    return days <= 0;
  }
  return days <= (w === "1m" ? 31 : 62);
}

/** Type chips AND with the "hide shares" toggle (shares have no chip). */
function matchesType(kind: string | null, f: QueueFilters): boolean {
  if (f.hideShares && kind === "share") {
    return false;
  }
  if (f.types.length === 0) {
    return true;
  }
  return Boolean(kind && f.types.includes(kind));
}

/** Council-tax / EPC band facet; bands compared case-insensitively. */
function matchesBand(band: string | null, selected: string[]): boolean {
  if (selected.length === 0) {
    return true;
  }
  return Boolean(band && selected.includes(band.toUpperCase()));
}

function matchesCommute(mins: number | null, max: number | null): boolean {
  if (max == null) {
    return true;
  }
  return mins != null && mins <= max;
}

function matchesFttp(fttp: boolean | null, only: boolean): boolean {
  if (!only) {
    return true;
  }
  return fttp === true;
}

function matchesPrice(
  price: number | null,
  min: number | null,
  max: number | null
): boolean {
  if (price == null) {
    return true;
  }
  if (min != null && price < min) {
    return false;
  }
  if (max != null && price > max) {
    return false;
  }
  return true;
}

/**
 * Area + outcode facets. They share the "drop when unknown" rule with beds
 * — you asked for SE15; a row with no outcode can't be vouched for — and
 * AND together (area narrows the region, outcode pins a district).
 */
function matchesLocation(outcode: string | null, f: QueueFilters): boolean {
  if (f.areas.length === 0 && f.outcodes.length === 0) {
    return true;
  }
  if (!outcode) {
    return false;
  }
  const upper = outcode.toUpperCase();
  if (f.areas.length > 0 && !f.areas.includes(outcodeArea(upper))) {
    return false;
  }
  if (f.outcodes.length > 0 && !f.outcodes.includes(upper)) {
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

/** Commute-minute bounds, snapped to 5 min. Null when there's no spread. */
function commuteBounds(
  values: Array<number | null>
): { min: number; max: number } | null {
  const real = values.filter((v): v is number => v != null);
  if (real.length < 2) {
    return null;
  }
  const min = Math.floor(Math.min(...real) / 5) * 5;
  const max = Math.ceil(Math.max(...real) / 5) * 5;
  return max > min ? { min, max } : null;
}

/** Distinct, sorted band letters present across the queue. */
function bandsPresent(values: Array<string | null>): string[] {
  return [
    ...new Set(
      values.flatMap((v) => (v ? [v.toUpperCase()] : []))
    ),
  ].sort();
}

/** Everything the filter popover needs to know about the live queue. */
export type QueueFilterOptions = {
  areas: string[];
  outcodes: string[];
  /** Any row carries a bathroom count (gates the Bathrooms chips). */
  bathsPresent: boolean;
  /** Property kinds present, excluding "share" (ordered for chips). */
  types: string[];
  /** At least one share is in the queue (gates the "Hide shares" toggle). */
  hasShares: boolean;
  councilTax: string[];
  epc: string[];
  /** Commute slider bounds; null hides the slider. */
  commute: { min: number; max: number } | null;
  /** Any row has known broadband (gates the FTTP toggle). */
  hasFttpData: boolean;
  /** Any cluster is listed on >1 portal (gates the cross-listed toggle). */
  hasCrossListed: boolean;
  /** Price slider bounds; null hides the slider. */
  price: { min: number; max: number } | null;
};

/**
 * Derive every facet's option list from the rows the rail already holds, so
 * the popover only ever offers values that are actually in the queue (no
 * empty "EPC: A" chip when nothing is rated A). Same no-refetch contract as
 * the rest of the filter.
 */
export function queueFilterOptions(
  items: QueueFilterable[]
): QueueFilterOptions {
  const loc = queueLocationOptions(items.map((i) => i.outcode));
  const kinds = new Set(
    items.flatMap((i) => (i.propertyKind ? [i.propertyKind] : []))
  );
  return {
    areas: loc.areas,
    outcodes: loc.outcodes,
    bathsPresent: items.some((i) => i.bathrooms != null),
    types: TYPE_ORDER.filter((k) => kinds.has(k)),
    hasShares: kinds.has("share"),
    councilTax: bandsPresent(items.map((i) => i.councilTaxBand)),
    epc: bandsPresent(items.map((i) => i.epcBand)),
    commute: commuteBounds(items.map((i) => i.commuteMinutes)),
    hasFttpData: items.some((i) => i.fttp != null),
    hasCrossListed: items.some((i) => i.portalCount > 1),
    price: queuePriceBounds(items.map((i) => i.priceValue)),
  };
}

type Props = {
  filters: QueueFilters;
  onChange: (next: QueueFilters) => void;
  /** Facet option lists derived from the unfiltered queue. */
  options: QueueFilterOptions;
};

/** Add/remove `value` from a chip-set, optionally re-sorting. */
function toggle<T>(list: T[], value: T, sort?: (a: T, z: T) => number): T[] {
  const next = list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
  return sort ? next.sort(sort) : next;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a flat list of independent, self-gating facet sections — the "complexity" is breadth (one block per facet), not nested logic.
export function QueueFilter({ filters, onChange, options }: Props) {
  const count = activeFilterCount(filters);
  const set = (patch: Partial<QueueFilters>) =>
    onChange({ ...filters, ...patch });

  const toggleArea = (area: string) => {
    const on = filters.areas.includes(area);
    set({
      areas: on
        ? filters.areas.filter((x) => x !== area)
        : [...filters.areas, area].sort(),
      // Dropping an area also drops any outcode it owned, so a hidden
      // outcode chip can't keep silently narrowing the queue.
      outcodes: on
        ? filters.outcodes.filter((o) => outcodeArea(o) !== area)
        : filters.outcodes,
    });
  };

  const byOutcode = (a: string, b: string) =>
    a.localeCompare(b, "en", { numeric: true });

  // When areas are picked, the postcode list trims to those areas — the two
  // facets read as coarse → fine rather than two clashing lists.
  const visibleOutcodes =
    filters.areas.length > 0
      ? options.outcodes.filter((o) => filters.areas.includes(outcodeArea(o)))
      : options.outcodes;

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
      <PopoverContent
        align="end"
        className="max-h-[70vh] w-60 gap-3.5 overflow-y-auto"
      >
        <Section label="Bedrooms">
          <div className="flex flex-wrap gap-1.5">
            {BED_OPTIONS.map((b) => (
              <Chip
                active={filters.beds.includes(b)}
                key={b}
                onClick={() =>
                  set({ beds: toggle(filters.beds, b, (a, z) => a - z) })
                }
              >
                {b === 4 ? "4+" : b}
              </Chip>
            ))}
          </div>
        </Section>

        {options.bathsPresent ? (
          <Section label="Bathrooms">
            <div className="flex flex-wrap gap-1.5">
              {BATH_OPTIONS.map((b) => (
                <Chip
                  active={filters.bathrooms.includes(b)}
                  key={b}
                  onClick={() =>
                    set({
                      bathrooms: toggle(filters.bathrooms, b, (a, z) => a - z),
                    })
                  }
                >
                  {b === 3 ? "3+" : b}
                </Chip>
              ))}
            </div>
          </Section>
        ) : null}

        <Section label="Furnishing">
          <div className="flex flex-wrap gap-1.5">
            {FURNISHED_OPTIONS.map((label) => (
              <Chip
                active={filters.furnished.includes(label)}
                key={label}
                onClick={() => set({ furnished: toggle(filters.furnished, label) })}
              >
                {label}
              </Chip>
            ))}
          </div>
        </Section>

        {options.types.length > 0 || options.hasShares ? (
          <Section label="Type">
            <div className="flex flex-wrap gap-1.5">
              {options.types.map((kind) => (
                <Chip
                  active={filters.types.includes(kind)}
                  key={kind}
                  onClick={() => set({ types: toggle(filters.types, kind) })}
                >
                  {TYPE_LABELS[kind] ?? kind}
                </Chip>
              ))}
              {options.hasShares ? (
                <Chip
                  active={filters.hideShares}
                  onClick={() => set({ hideShares: !filters.hideShares })}
                >
                  Hide shares
                </Chip>
              ) : null}
            </div>
          </Section>
        ) : null}

        {options.areas.length > 1 ? (
          <Section label="Area">
            <div className="flex flex-wrap gap-1.5">
              {options.areas.map((area) => (
                <Chip
                  active={filters.areas.includes(area)}
                  key={area}
                  onClick={() => toggleArea(area)}
                >
                  {area}
                </Chip>
              ))}
            </div>
          </Section>
        ) : null}

        {visibleOutcodes.length > 1 ? (
          <Section label="Postcode">
            <div className="flex flex-wrap gap-1.5">
              {visibleOutcodes.map((outcode) => (
                <Chip
                  active={filters.outcodes.includes(outcode)}
                  key={outcode}
                  onClick={() =>
                    set({
                      outcodes: toggle(filters.outcodes, outcode, byOutcode),
                    })
                  }
                >
                  {outcode}
                </Chip>
              ))}
            </div>
          </Section>
        ) : null}

        <Section label="Move-in">
          <div className="flex flex-wrap gap-1.5">
            {MOVE_IN_OPTIONS.map(({ value, label }) => (
              <Chip
                active={filters.moveIn === value}
                key={value}
                onClick={() =>
                  set({ moveIn: filters.moveIn === value ? "any" : value })
                }
              >
                {label}
              </Chip>
            ))}
          </div>
        </Section>

        {options.commute ? (
          <Section
            label="Max commute"
            value={
              filters.maxCommute != null
                ? `${filters.maxCommute} min`
                : "Any"
            }
          >
            <Slider
              max={options.commute.max}
              min={options.commute.min}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                set({
                  maxCommute:
                    next >= (options.commute?.max ?? next) ? null : next,
                });
              }}
              step={5}
              value={[filters.maxCommute ?? options.commute.max]}
            />
          </Section>
        ) : null}

        {options.epc.length > 0 ? (
          <Section label="EPC">
            <div className="flex flex-wrap gap-1.5">
              {options.epc.map((band) => (
                <Chip
                  active={filters.epc.includes(band)}
                  key={band}
                  onClick={() => set({ epc: toggle(filters.epc, band) })}
                >
                  {band}
                </Chip>
              ))}
            </div>
          </Section>
        ) : null}

        {options.councilTax.length > 0 ? (
          <Section label="Council tax">
            <div className="flex flex-wrap gap-1.5">
              {options.councilTax.map((band) => (
                <Chip
                  active={filters.councilTax.includes(band)}
                  key={band}
                  onClick={() =>
                    set({ councilTax: toggle(filters.councilTax, band) })
                  }
                >
                  {band}
                </Chip>
              ))}
            </div>
          </Section>
        ) : null}

        {options.hasFttpData || options.hasCrossListed ? (
          <Section label="More">
            <div className="flex flex-wrap gap-1.5">
              {options.hasFttpData ? (
                <Chip
                  active={filters.fttpOnly}
                  onClick={() => set({ fttpOnly: !filters.fttpOnly })}
                >
                  Gigabit / FTTP
                </Chip>
              ) : null}
              {options.hasCrossListed ? (
                <Chip
                  active={filters.crossListedOnly}
                  onClick={() =>
                    set({ crossListedOnly: !filters.crossListedOnly })
                  }
                >
                  Cross-listed
                </Chip>
              ) : null}
            </div>
          </Section>
        ) : null}

        {options.price ? (
          <Section
            label="Price"
            value={priceRangeLabel(filters, options.price)}
          >
            <Slider
              max={options.price.max}
              min={options.price.min}
              onValueChange={(value) => {
                const range = Array.isArray(value) ? value : [value];
                const [lo, hi] = range;
                const bounds = options.price;
                if (!bounds) {
                  return;
                }
                set({
                  // Snap each handle back to "no bound" at the extremes so
                  // the facet count + label clear cleanly.
                  minPrice: lo <= bounds.min ? null : lo,
                  maxPrice: hi >= bounds.max ? null : hi,
                });
              }}
              step={50}
              value={[
                filters.minPrice ?? options.price.min,
                filters.maxPrice ?? options.price.max,
              ]}
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

/** "£1,200 – £2,800" / "≤ £2,800" / "≥ £1,200" / "Any" for the price header. */
function priceRangeLabel(
  f: QueueFilters,
  bounds: { min: number; max: number }
): string {
  const fmt = (n: number) => `£${n.toLocaleString("en-GB")}`;
  const lo = f.minPrice != null && f.minPrice > bounds.min ? f.minPrice : null;
  const hi = f.maxPrice != null && f.maxPrice < bounds.max ? f.maxPrice : null;
  if (lo != null && hi != null) {
    return `${fmt(lo)} – ${fmt(hi)}`;
  }
  if (hi != null) {
    return `≤ ${fmt(hi)}`;
  }
  if (lo != null) {
    return `≥ ${fmt(lo)}`;
  }
  return "Any";
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
