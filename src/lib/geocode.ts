/**
 * Reverse geocoding via postcodes.io + Google Maps.
 *
 * Listings carry true per-property lat/lng (now promoted to the columns —
 * see scripts/backfill-listing-coords.ts), but the scraped `postcode` is
 * only an outcode ("N11"). Several enrichments need a precise *full*
 * postcode: EPC search by outcode returns the whole district's
 * certificates with no way to pick the right building, whereas the full
 * postcode narrows to a single street/block. postcodes.io already backs
 * `council-tax.ts`; its reverse endpoint snaps a coordinate to the
 * nearest unit postcode.
 *
 * Google's geocoder goes one step further — it can resolve a coord to a
 * specific street address (including the door number) when the input
 * coord is precise enough. enrich-epc uses this to lift street-only
 * scraped addresses into exact-match candidates.
 */

const POSTCODES_BASE_URL = "https://api.postcodes.io";
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

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

/**
 * Google geocoder `location_type` — how precisely the result locates the
 * place. ROOFTOP is the only value that pins a specific building; the
 * rest are interpolated, area centroids, or vague. enrich-epc gates the
 * exact-match upgrade on ROOFTOP to avoid falsely stamping a wrong
 * door number onto a cluster.
 */
export type GoogleLocationType =
  | "ROOFTOP"
  | "RANGE_INTERPOLATED"
  | "GEOMETRIC_CENTER"
  | "APPROXIMATE";

export type ReverseGeocodedAddress = {
  /** Google's formatted_address, e.g. "23 Bowes Road, London N11 1AB, UK". */
  formattedAddress: string;
  /** The street number component, when Google returned one. */
  streetNumber: string | null;
  /** The route (street name) component, when Google returned one. */
  route: string | null;
  /** The postcode component, when Google returned one. */
  postcode: string | null;
  /** Precision of the result. ROOFTOP = pinned to a specific building. */
  locationType: GoogleLocationType;
};

type GoogleAddressComponent = {
  long_name?: unknown;
  short_name?: unknown;
  types?: unknown;
};

type GoogleGeocodeResult = {
  formatted_address?: unknown;
  address_components?: unknown;
  geometry?: { location_type?: unknown };
};

type GoogleGeocodeBody = {
  status?: unknown;
  results?: unknown;
};

function pickComponent(
  components: GoogleAddressComponent[],
  type: string
): string | null {
  for (const c of components) {
    if (Array.isArray(c.types) && c.types.includes(type)) {
      const v = c.long_name;
      if (typeof v === "string" && v.length > 0) {
        return v;
      }
    }
  }
  return null;
}

function isGoogleLocationType(value: unknown): value is GoogleLocationType {
  return (
    value === "ROOFTOP" ||
    value === "RANGE_INTERPOLATED" ||
    value === "GEOMETRIC_CENTER" ||
    value === "APPROXIMATE"
  );
}

/**
 * Reverse-geocode coords to a single UK street address via Google Maps.
 * Returns null when the API errors, returns no result, the top result
 * isn't in the UK, or the country component is missing — we'd rather
 * leave EPC to fall back than match against a non-UK cert set.
 *
 * Accepts an injected fetch for tests.
 */
export async function reverseGeocodeAddress(
  lat: number,
  lng: number,
  apiKey: string,
  options: ReverseGeocodeOptions = {}
): Promise<ReverseGeocodedAddress | null> {
  if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
    return null;
  }
  const fetchImpl = options.fetch ?? fetch;
  const url = `${GOOGLE_GEOCODE_URL}?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}&region=uk`;
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as GoogleGeocodeBody;
  if (body.status !== "OK" || !Array.isArray(body.results)) {
    return null;
  }
  const top = body.results[0] as GoogleGeocodeResult | undefined;
  if (!top) {
    return null;
  }
  const components = Array.isArray(top.address_components)
    ? (top.address_components as GoogleAddressComponent[])
    : [];
  const country = pickComponent(components, "country");
  // Geocoder's `country.short_name` is the ISO code — Google formats UK
  // as "GB". Reject anything outside GB to keep EPC matches on the
  // correct cert set.
  const countryShort = (() => {
    for (const c of components) {
      if (Array.isArray(c.types) && c.types.includes("country")) {
        const v = c.short_name;
        return typeof v === "string" ? v : null;
      }
    }
    return null;
  })();
  if (countryShort !== "GB" && country !== "United Kingdom") {
    return null;
  }
  const rawLocationType = top.geometry?.location_type;
  const locationType: GoogleLocationType = isGoogleLocationType(rawLocationType)
    ? rawLocationType
    : "APPROXIMATE";
  const formatted = top.formatted_address;
  if (typeof formatted !== "string" || formatted.length === 0) {
    return null;
  }
  return {
    formattedAddress: formatted,
    streetNumber: pickComponent(components, "street_number"),
    route: pickComponent(components, "route"),
    postcode: pickComponent(components, "postal_code"),
    locationType,
  };
}
