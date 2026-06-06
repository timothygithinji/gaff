/** Coarse property kind for the Type facet (review queue + pipeline). */
export type PropertyKind = "flat" | "house" | "studio" | "share" | "other";

/**
 * Regex source for "house share / room in a shared place". Shared verbatim
 * by the SQL exclusion predicate (Postgres `~*`, see `EXCLUSION_PATTERNS`
 * in the review server function) and the JS classifier below, so a listing
 * is classed as a share identically at the DB and in memory.
 */
export const HOUSE_SHARE_PATTERN =
  "house\\s*share|flat\\s*share|room\\s+in\\s+a?\\s*shared|shared\\s+(?:accommodation|flat|house|room|living|apartment)";

const HOUSE_SHARE_RE = new RegExp(HOUSE_SHARE_PATTERN, "i");
const STUDIO_RE = /studio/i;
const FLAT_RE = /\b(?:flat|apartment|maisonette)\b/i;
const HOUSE_RE =
  /\b(?:house|bungalow|cottage|terrace[d]?|detached|semi|mews|town\s*house)\b/i;

/**
 * Bucket a listing into a coarse kind for the Type filter. Matched against
 * `property_type || ' ' || title`. Tested share → studio → flat → house so
 * the specific labels win over a generic "house" hiding in the title.
 */
export function classifyPropertyKind(
  propertyType: string | null,
  title: string
): PropertyKind {
  const hay = `${propertyType ?? ""} ${title}`;
  if (HOUSE_SHARE_RE.test(hay)) {
    return "share";
  }
  if (STUDIO_RE.test(hay)) {
    return "studio";
  }
  if (FLAT_RE.test(hay)) {
    return "flat";
  }
  if (HOUSE_RE.test(hay)) {
    return "house";
  }
  return "other";
}

/**
 * Human-readable label for the coarse property kind we classify clusters into
 * (see {@link classifyPropertyKind}). Returns `null` for "other"/unknown so
 * callers can simply omit it from a subtitle rather than printing a
 * meaningless "Other".
 */
export function propertyKindLabel(
  kind: string | null | undefined
): string | null {
  switch (kind) {
    case "flat":
      return "Flat";
    case "house":
      return "House";
    case "studio":
      return "Studio";
    case "share":
      return "House share";
    default:
      return null;
  }
}
