/**
 * Cross-portal cluster matching key.
 *
 * The original clusterer matched on EXACT equality of the normalised
 * address string (see `normalise.ts`). That works within a portal but
 * fails across portals, because Rightmove / Zoopla / OpenRent format the
 * same physical property differently:
 *
 *   rightmove  "2 Bedroom Flat – Linden Way, London, N14"
 *   zoopla     "Linden Way, London N14"
 *   openrent   "2 Bed Flat, Linden Way, N14"
 *
 * Those three never produce the same normalised string, so the same flat
 * lands in three clusters and the user sees it three times. This module
 * derives a portal-AGNOSTIC key plus the corroboration helpers used to
 * decide that two listings/clusters are the same property:
 *
 *   block      = outcode + bedroom count   (cheap pre-filter)
 *   streetKey  = road/building name (+ unit, if the address names one)
 *   price      = must corroborate (same property ≈ same rent across portals)
 *
 * Validated read-only against prod: street-key + outcode + bedrooms +
 * price-corroboration, cross-portal only, collapses the real duplicates
 * with zero false positives in the current data set. Kept deliberately
 * conservative — see the guards (`isDegenerateStreetKey`, the null-price
 * rule in `priceCorroborates`) which were added after a dry run merged a
 * parser-junk "House" address and bridged distinct house-shares on a null
 * price.
 */

/** Words that end a UK street name — used to locate the road token. */
const STREET_TYPES = new Set([
  "road", "rd", "street", "st", "avenue", "ave", "lane", "ln", "close",
  "grove", "gardens", "court", "drive", "dr", "way", "place", "pl", "hill",
  "terrace", "crescent", "walk", "mews", "row", "broadway", "parade", "rise",
  "square", "gate", "green", "park", "villas", "vale", "field", "fields",
]);

/** Filler tokens that carry no road identity. */
const NOISE = new Set([
  "london", "the", "at", "to", "let", "for", "rent", "in", "of", "and", "with",
]);

/**
 * A street base so generic it can't identify a property on its own — when
 * a parser fails it often emits just "House" or "Flat". Never merge on
 * these alone.
 */
const DEGENERATE = new Set([
  "house", "flat", "apartment", "property", "the", "room", "studio",
  "maisonette", "bungalow",
]);

const OUTCODE_RE = /\b([a-z]{1,2}\d{1,2}[a-z]?)\b/;
const OUTCODE_RE_G = /\b([a-z]{1,2}\d{1,2}[a-z]?)\b/g;
const BED_PREFIX_RE =
  /^\s*\d+\s*(bed|bedroom)s?\s*(flat|house|maisonette|apartment|studio|property|room|bungalow)?\b/;
const UNIT_RE = /\b(flat|apartment|apt|unit|suite)\s*([0-9]+[a-z]?)\b/;
const MARKETING_TAIL_RE = /\s[-–]\s/;
const PUNCTUATION_RE = /[^a-z0-9\s]/g;
const WHITESPACE_RE = /\s+/;
const HOUSE_NUMBER_RE = /^\d+[a-z]?$/;

/**
 * The postal outcode (e.g. "n14") — from the postcode column if present,
 * else sniffed out of the raw address. Lowercased. "" when neither has one.
 */
export function addressOutcode(
  postcode: string | null,
  addressRaw: string
): string {
  const fromPc = (postcode ?? "").split(" ")[0]?.toLowerCase() ?? "";
  if (fromPc) {
    return fromPc;
  }
  const m = addressRaw.toLowerCase().match(OUTCODE_RE);
  return m?.[1] ?? "";
}

/** Significant tokens after stripping portal noise (bed prefix, outcode, filler). */
function significantTokens(addressRaw: string): string[] {
  let a = addressRaw.toLowerCase();
  a = a.split(MARKETING_TAIL_RE)[0] ?? a; // drop marketing tail after " - "
  a = a.replace(PUNCTUATION_RE, " ");
  a = a.replace(BED_PREFIX_RE, " "); // "2 bed flat", "3 bedroom maisonette"
  a = a.replace(OUTCODE_RE_G, " "); // postcode / outcode tokens
  return a.split(WHITESPACE_RE).filter((t) => t && !NOISE.has(t));
}

/**
 * Unit designator that keeps Flat 1 / Flat 2 apart. Runs on the
 * noise-stripped tokens so a leading "2 Bed Flat" doesn't leak the bedroom
 * count as a phantom house number.
 */
function unitDesignator(addressRaw: string, tokens: string[]): string {
  const m = addressRaw.toLowerCase().match(UNIT_RE);
  if (m) {
    return `${m[1]}${m[2]}`;
  }
  const first = tokens[0];
  if (first && HOUSE_NUMBER_RE.test(first)) {
    return first; // leading house number, e.g. "13 Cannon Hill"
  }
  return "";
}

/**
 * Portal-agnostic street/building key, of the form `"<name>|<unit>"`:
 *
 *   "Linden Way, London, N14"        → "linden way|"
 *   "2 Bed Flat, Linden Way, N14"    → "linden way|"
 *   "13 Cannon Hill N14"             → "cannon hill|13"
 *   "Flat 2, 22 Elm Street, NW3"     → "elm street|flat2"
 *
 * Name = up to two tokens before the first street-type word, else the
 * first two significant tokens (building name). Empty/degenerate bases are
 * intentionally preserved here verbatim — callers must gate them with
 * {@link isDegenerateStreetKey} rather than this function guessing.
 */
export function streetKey(addressRaw: string): string {
  const tokens = significantTokens(addressRaw);
  const unit = unitDesignator(addressRaw, tokens);
  const idx = tokens.findIndex((t) => STREET_TYPES.has(t));
  const base =
    idx > 0
      ? `${tokens.slice(Math.max(0, idx - 2), idx).join(" ")} ${tokens[idx]}`
      : tokens.slice(0, 2).join(" ");
  return `${base.trim()}|${unit}`;
}

/** True when a street key is too generic to merge on (parser junk). */
export function isDegenerateStreetKey(key: string): boolean {
  const base = key.split("|")[0]?.trim() ?? "";
  return base === "" || (!base.includes(" ") && DEGENERATE.has(base));
}

/**
 * True when a street key carries a unit/house-number (the part after "|"),
 * e.g. "elm street|flat2" or "cannon hill|13" — but NOT "turnpike lane|".
 *
 * A unit pins the key to one specific home; without it the key names only a
 * road, and every flat on that road shares it. Callers use this to decide
 * how much corroboration a merge needs: a unit-bearing key can merge on
 * price (rents pin a specific home across portals), but a road-only key
 * must NOT — every flat on the road rents about the same, so price proves
 * nothing. Road-only keys require coordinate agreement instead.
 */
export function streetKeyHasUnit(key: string): boolean {
  return (key.split("|")[1] ?? "").trim() !== "";
}

/**
 * Two rents corroborate "same property" when they're within ~4% (floor
 * £75). A null on EITHER side does NOT corroborate — we require a positive
 * price match on the loose cross-portal tier, because a null price was
 * observed bridging genuinely distinct listings in a dry run.
 */
export function priceCorroborates(
  a: number | null,
  b: number | null
): boolean {
  if (a == null || b == null) {
    return false;
  }
  return Math.abs(a - b) <= Math.max(75, 0.04 * Math.max(a, b));
}
