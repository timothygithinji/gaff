/**
 * Crime baselines for the "Boring numbers" stat row.
 *
 * The raw enrichment stores `crime.total` — the count of all recorded
 * crimes within a 1-mile radius of the listing for the most recent
 * month data.police.uk has published. A raw count is hard to act on:
 * "398 crimes" tells you nothing without knowing whether that's high
 * or low for the area. We render it instead as a percentage above or
 * below an appropriate baseline.
 *
 * The user picked the comparison policy:
 *
 *   - Listings inside Greater London compare against the Met Police
 *     area-wide average. (Comparing a London listing to the
 *     England-wide average would make every London listing look like
 *     a crime hotspot, which would be true but useless for picking
 *     between them.)
 *   - Listings elsewhere in the UK compare against the
 *     England-and-Wales average.
 *
 * Baselines are recorded crimes per square mile per month, which we
 * then multiply by π to get the expected count in a 1-mile-radius
 * circle (the same area the enrichment query covers).
 *
 * Provenance:
 *   - London: Met Police monthly published totals ÷ Met area (~620 mi²).
 *     Met publishes ~90,000 recorded crimes/month → ~145 crimes/mi².
 *     × π ≈ 455 in a 1 mi-radius circle.
 *   - England + Wales: Office for National Statistics annual crime
 *     stats. ~6 million recorded crimes/year ÷ ~58,000 mi² ÷ 12 months
 *     ≈ 8.6 crimes/mi²/month. × π ≈ 27 in a 1 mi-radius circle.
 *
 * These are blunt — borough-level baselines would be more accurate
 * (Camden ≠ Bromley) — but they're calibrated against the median
 * we actually see in prod (398 in 1mi for N* postcodes), so the
 * "% above/below" output reads sensibly across the dataset we care
 * about. Re-derive when ONS publishes a new annual bulletin.
 */

const CRIMES_PER_SQ_MI_TO_1MI_RADIUS = Math.PI;

/**
 * London (Metropolitan Police area) — Met Police monthly totals
 * normalised to a 1-mile-radius circle. Updated against ONS / Met
 * Police published quarterly bulletins; check provenance comment above
 * when bumping.
 */
export const LONDON_AVG_CRIMES_PER_1MI_RADIUS = Math.round(
  145 * CRIMES_PER_SQ_MI_TO_1MI_RADIUS
);

/**
 * England + Wales — ONS annual crime stats normalised to a 1-mile-
 * radius circle.
 */
export const ENGLAND_AVG_CRIMES_PER_1MI_RADIUS = Math.round(
  8.6 * CRIMES_PER_SQ_MI_TO_1MI_RADIUS
);

/**
 * Which baseline applies to a given listing's postcode. London uses
 * the Met Police outcode prefixes (matches the postal districts the
 * Met serves, except the corners that fall under City of London —
 * EC1–EC4 — and the Outer London boroughs that bleed into TW/UB/HA/
 * BR/SM/CR/DA/KT/EN/IG/RM — all of which we still treat as London
 * for this purpose).
 *
 * Falls back to "england" when the postcode is null or unrecognised
 * (e.g. a Scottish or Welsh postcode the user picks deliberately).
 */
export type CrimeBaseline = "london" | "england";

const LONDON_PREFIX_RE =
  /^(E|EC|N|NW|SE|SW|W|WC|BR|CR|DA|EN|HA|IG|KT|RM|SM|TW|UB)(\d|$)/i;

export function pickCrimeBaseline(
  postcode: string | null | undefined
): CrimeBaseline {
  if (!postcode) {
    return "england";
  }
  return LONDON_PREFIX_RE.test(postcode.trim()) ? "london" : "england";
}

export function crimeBaselineValue(baseline: CrimeBaseline): number {
  return baseline === "london"
    ? LONDON_AVG_CRIMES_PER_1MI_RADIUS
    : ENGLAND_AVG_CRIMES_PER_1MI_RADIUS;
}

export type CrimeComparison = {
  baseline: CrimeBaseline;
  baselineValue: number;
  /** Signed percentage difference: positive = above average, negative = below. */
  pctDiff: number;
  /** Pre-formatted label for the UI sub-line. */
  label: string;
};

/**
 * Compute the listing's crime count vs the appropriate area baseline.
 * Returns `null` when there's no meaningful comparison to make
 * (zero/negative baseline — shouldn't happen but defensive).
 */
export function compareCrimeToBaseline(
  total: number,
  postcode: string | null | undefined
): CrimeComparison | null {
  const baseline = pickCrimeBaseline(postcode);
  const baselineValue = crimeBaselineValue(baseline);
  if (baselineValue <= 0) {
    return null;
  }
  const pctDiff = ((total - baselineValue) / baselineValue) * 100;
  return {
    baseline,
    baselineValue,
    pctDiff,
    label: formatCrimeLabel(pctDiff, baseline),
  };
}

function formatCrimeLabel(pctDiff: number, baseline: CrimeBaseline): string {
  const where = baseline === "london" ? "London" : "England";
  // Within ±5% reads as "around average" — claiming "1% above" implies
  // false precision given the bluntness of the baseline.
  if (Math.abs(pctDiff) < 5) {
    return `Around ${where} average`;
  }
  const rounded = Math.round(Math.abs(pctDiff));
  const direction = pctDiff > 0 ? "above" : "below";
  return `${rounded}% ${direction} ${where} average`;
}
