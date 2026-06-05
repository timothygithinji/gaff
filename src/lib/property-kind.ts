/**
 * Human-readable label for the coarse property kind we classify clusters into
 * (see `classifyPropertyKind` in the review server function). Returns `null`
 * for "other"/unknown so callers can simply omit it from a subtitle rather
 * than printing a meaningless "Other".
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
