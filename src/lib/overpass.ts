/**
 * Overpass API client (OpenStreetMap query language).
 *
 * **Status: stubbed.** Every public Overpass mirror we've tried
 * refuses us:
 *
 *   - `overpass-api.de` (main + lz4) → 406 Not Acceptable for our UA
 *   - `overpass.openstreetmap.fr` → 403 "only available to white-listed
 *     usages"
 *   - `overpass.private.coffee` → 504 Gateway Timeout (overloaded)
 *
 * Public Overpass is rate-limited per-IP and Trigger.dev's worker IPs
 * sit in cloud ranges that the mirrors block. Real coverage will need
 * either Zyte HTTP-proxied requests or a paid provider
 * (Geoapify / Foursquare / Mapbox SearchBox). Until then `getAmenityCounts`
 * resolves to a zero-filled map so the `enrichments.amenities` slot
 * is still populated.
 */

/**
 * Canonical amenity buckets we report counts for. Kept here as the
 * shared label list so the stubbed `getAmenityCounts` and any future
 * replacement implementation produce the same keys.
 */
const AMENITY_LABELS = [
  "supermarket",
  "cafe",
  "pub",
  "restaurant",
  "gym",
  "park",
  "school",
  "pharmacy",
  "gp",
] as const;

export type AmenityCounts = {
  withinMeters: number;
  counts: Record<string, number>;
};

export type GetAmenitiesInput = {
  lat: number;
  lng: number;
  /** Default 500m — comfortable walking distance for "what's nearby". */
  radiusMeters?: number;
};

function zeroCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of AMENITY_LABELS) {
    counts[label] = 0;
  }
  return counts;
}

/**
 * Stub. Returns a zero-filled `AmenityCounts` for the requested
 * radius until we wire a real provider. See the file header.
 */
// biome-ignore lint/suspicious/useAwait: signature must stay async to match the eventual real implementation.
export async function getAmenityCounts(
  input: GetAmenitiesInput
): Promise<AmenityCounts> {
  return {
    withinMeters: input.radiusMeters ?? 500,
    counts: zeroCounts(),
  };
}
