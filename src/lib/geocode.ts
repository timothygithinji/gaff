/**
 * Reverse geocoding via postcodes.io.
 *
 * Listings carry true per-property lat/lng (now promoted to the columns —
 * see scripts/backfill-listing-coords.ts), but the scraped `postcode` is
 * only an outcode ("N11"). Several enrichments need a precise *full*
 * postcode: EPC search by outcode returns the whole district's
 * certificates with no way to pick the right building, whereas the full
 * postcode narrows to a single street/block. postcodes.io already backs
 * `council-tax.ts`; its reverse endpoint snaps a coordinate to the
 * nearest unit postcode.
 */

const POSTCODES_BASE_URL = "https://api.postcodes.io";

export interface ReverseGeocodeOptions {
  /** Custom fetch (tests / Workers). Defaults to global fetch. */
  fetch?: typeof fetch;
}

/**
 * Snap a coordinate to its nearest full UK postcode, or null when the
 * point is outside coverage / the API errors. Uses the raw query endpoint
 * (the generated SDK doesn't expose the lon/lat reverse lookup), mirroring
 * the same call already made in `council-tax.ts`.
 */
export async function reverseGeocodePostcode(
  lat: number,
  lng: number,
  options: ReverseGeocodeOptions = {}
): Promise<string | null> {
  if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
    return null;
  }
  const fetchImpl = options.fetch ?? fetch;
  const url = `${POSTCODES_BASE_URL}/postcodes?lon=${lng}&lat=${lat}&limit=1`;
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as {
    result?: Array<{ postcode?: unknown }> | null;
  };
  const nearest = Array.isArray(body.result) ? body.result[0] : null;
  return typeof nearest?.postcode === "string" ? nearest.postcode : null;
}
