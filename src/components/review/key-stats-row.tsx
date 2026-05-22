/**
 * Three-column stat strip beneath the price + address. Beds · Bath · Sqft.
 *
 * Each cell:
 *   - Thin icon glyph on the left (text fallback — we don't ship an
 *     icon set yet, so a Unicode glyph stands in for the design's
 *     stroke-icon).
 *   - Big number in Fraunces.
 *   - Tiny all-caps label below.
 *
 * `null` numbers render as "—" so the row still aligns.
 */

type Props = {
  bedrooms: number | null;
  bathrooms: number | null;
  /** Gross internal area in sq ft, if known. */
  sqft: number | null;
};

export function KeyStatsRow({ bedrooms, bathrooms, sqft }: Props) {
  return (
    <dl className="grid grid-cols-3 gap-3 border-brass/15 border-y py-3">
      <Stat glyph="⌂" value={bedrooms} label="Beds" />
      <Stat glyph="◧" value={bathrooms} label="Bath" />
      <Stat glyph="⤢" value={sqft} label="Sq ft" />
    </dl>
  );
}

function Stat({
  glyph,
  value,
  label,
}: {
  glyph: string;
  value: number | null;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="text-brass text-lg">
        {glyph}
      </span>
      <div className="leading-tight">
        <dt className="sr-only">{label}</dt>
        <dd className="font-serif text-ink text-xl">
          {value === null ? "—" : value}
        </dd>
        <p className="font-medium text-[10px] text-brass uppercase tracking-wider">
          {label}
        </p>
      </div>
    </div>
  );
}
