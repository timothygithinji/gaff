/**
 * Shared EPC resolution — the single source of truth for "what EPC band
 * do we show for this building", used by both the listing-detail page
 * (`getListingDetail`) and the review swipe card (`getNextReviewCard`).
 *
 * We surface an EPC band ONLY when it's specific to this building:
 *   - The band the agent published on the portal listing itself
 *     (`rawJson.epcRating`). Zoopla and OpenRent hand over a clean A–G
 *     letter; Rightmove exposes it as an image/PDF URL (useless as a
 *     letter) so we filter to A–G only.
 *   - An EXACT match in the `enrichments.epc` blob (`source: "exact"`) —
 *     the EPC register certificate for this exact address.
 *
 * Postcode-level *estimates* (the old `source: "estimate"` blobs) are NOT
 * surfaced: a neighbourhood-typical band is too unreliable for a specific
 * home (two flats in one block can be a C and an F). When we have neither
 * a portal band nor an exact match, the UI shows "Unknown" rather than a
 * guess. `parseEnrichmentEpc` therefore drops anything that isn't exact.
 *
 * Keeping this in one module means the card and the detail page can
 * never drift — a building that reads "C" on the card reads "C" on the
 * detail page.
 */

/** A clean EPC band letter — what the UI can render directly. */
export const EPC_LETTER_RE = /^[A-G]$/;

export type ResolvedEpc = {
  rating: string;
  potential?: string;
  expiresOn?: string;
  /** Total floor area in m² from the certificate, when the register exposed it. */
  floorAreaSqM?: number;
  /**
   * Provenance. "exact" = matched this building's certificate via the
   * EPC register; "portal" = the band the agent published on the listing
   * (also building-specific). These are the only two we ever surface.
   */
  source: "exact" | "portal";
};

/**
 * The building's own EPC band as published on a portal listing. Scans
 * every listing in the cluster, not just the cheapest headline, because
 * the band frequently sits on a sibling portal (OpenRent never publishes
 * one). Returns null when no listing exposed a usable A–G letter.
 */
export function pickPortalEpcRating(
  clusterListings: { rawJson: unknown }[]
): string | null {
  for (const l of clusterListings) {
    if (!l.rawJson || typeof l.rawJson !== "object") {
      continue;
    }
    const raw = (l.rawJson as Record<string, unknown>).epcRating;
    const letter = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (EPC_LETTER_RE.test(letter)) {
      return letter;
    }
  }
  return null;
}

/**
 * Parse the polymorphic `enrichments.epc` jsonb blob into a typed EPC,
 * surfacing ONLY exact register matches. Returns undefined for absent
 * blobs, blobs with no `currentRating`, and postcode-level estimates
 * (which we no longer show).
 */
export function parseEnrichmentEpc(value: unknown): ResolvedEpc | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const obj = value as {
    currentRating?: unknown;
    potentialRating?: unknown;
    expiresOn?: unknown;
    source?: unknown;
    totalFloorAreaSqM?: unknown;
  };
  if (obj.source !== "exact" || typeof obj.currentRating !== "string") {
    return;
  }
  const floorAreaSqM =
    typeof obj.totalFloorAreaSqM === "number" &&
    Number.isFinite(obj.totalFloorAreaSqM) &&
    obj.totalFloorAreaSqM > 0
      ? obj.totalFloorAreaSqM
      : undefined;
  return {
    rating: obj.currentRating,
    potential:
      typeof obj.potentialRating === "string" ? obj.potentialRating : undefined,
    expiresOn: typeof obj.expiresOn === "string" ? obj.expiresOn : undefined,
    source: "exact",
    ...(floorAreaSqM != null ? { floorAreaSqM } : {}),
  };
}

/**
 * Decide which EPC reading to surface. An exact register match keeps its
 * `potential` / `expiresOn` detail and wins; otherwise the portal's own
 * published band. Returns undefined (→ "Unknown" in the UI) when we have
 * neither — we never fall back to a postcode estimate.
 */
export function resolveEpc(
  portalRating: string | null,
  enrichmentEpc: ResolvedEpc | undefined
): ResolvedEpc | undefined {
  if (enrichmentEpc) {
    return enrichmentEpc;
  }
  if (portalRating) {
    return { rating: portalRating, source: "portal" };
  }
  return undefined;
}
