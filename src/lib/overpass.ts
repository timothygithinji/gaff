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

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/**
 * The amenity buckets we collect counts for. Each entry maps a UI
 * label to one or more OSM tag predicates; the matcher iterates the
 * tag list returned by Overpass and increments the first bucket whose
 * predicate hits.
 */
export const AMENITY_CATEGORIES: ReadonlyArray<{
  label: string;
  match: (tags: Record<string, string>) => boolean;
}> = [
  {
    label: "supermarket",
    match: (t) => t.shop === "supermarket" || t.shop === "convenience",
  },
  { label: "cafe", match: (t) => t.amenity === "cafe" },
  { label: "pub", match: (t) => t.amenity === "pub" || t.amenity === "bar" },
  { label: "restaurant", match: (t) => t.amenity === "restaurant" },
  { label: "gym", match: (t) => t.leisure === "fitness_centre" },
  { label: "park", match: (t) => t.leisure === "park" },
  {
    label: "school",
    match: (t) => t.amenity === "school" || t.amenity === "college",
  },
  { label: "pharmacy", match: (t) => t.amenity === "pharmacy" },
  {
    label: "gp",
    match: (t) => t.amenity === "doctors" || t.amenity === "clinic",
  },
];

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

type OverpassElement = {
  type: "node" | "way" | "relation";
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

function buildQuery(lat: number, lng: number, radius: number): string {
  const center = `${radius},${lat},${lng}`;
  // One union of `nwr(around:r,lat,lng)[<tag>]` per category — Overpass
  // dedupes them server-side. We ask for `out tags` so the client can
  // bucket by predicate; the volume of returned tags is small.
  return `[out:json][timeout:25];
(
  nwr(around:${center})[shop=supermarket];
  nwr(around:${center})[shop=convenience];
  nwr(around:${center})[amenity=cafe];
  nwr(around:${center})[amenity=pub];
  nwr(around:${center})[amenity=bar];
  nwr(around:${center})[amenity=restaurant];
  nwr(around:${center})[leisure=fitness_centre];
  nwr(around:${center})[leisure=park];
  nwr(around:${center})[amenity=school];
  nwr(around:${center})[amenity=college];
  nwr(around:${center})[amenity=pharmacy];
  nwr(around:${center})[amenity=doctors];
  nwr(around:${center})[amenity=clinic];
);
out tags;`;
}

function zeroCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of AMENITY_CATEGORIES) {
    counts[category.label] = 0;
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

/**
 * Legacy Overpass-driven implementation. Unused at runtime — kept as
 * a starting point for the real provider once we pick one.
 */
export async function _legacyOverpassAmenities(
  input: GetAmenitiesInput
): Promise<AmenityCounts> {
  const radius = input.radiusMeters ?? 500;
  const query = buildQuery(input.lat, input.lng, radius);

  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Accept: "application/json" },
    body: query,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Overpass ${res.status} ${res.statusText}: ${body.slice(0, 400)}`
    );
  }
  const data = (await res.json()) as OverpassResponse;

  const counts = zeroCounts();
  for (const element of data.elements ?? []) {
    const tags = element.tags ?? {};
    for (const category of AMENITY_CATEGORIES) {
      if (category.match(tags)) {
        counts[category.label] = (counts[category.label] ?? 0) + 1;
        break;
      }
    }
  }
  return { withinMeters: radius, counts };
}
