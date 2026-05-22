/**
 * Overpass API client (OpenStreetMap query language).
 *
 * Public, unauthenticated, generously rate-limited for our volume.
 * We use it to count amenities within walking distance of a cluster:
 * "how many supermarkets / cafes / parks / etc. are within 500 m of
 * this property?". OSM coverage of London independents (cafes, pubs,
 * gyms) tends to be richer than Google Places for free-text searches.
 *
 * One round-trip per cluster: a single Overpass query with multiple
 * tag filters, then group counts client-side.
 */

// The main `overpass-api.de` instance is intermittently 406-ing
// unauthenticated POST requests (load-shedding). The French mirror is
// the most reliable secondary; it serves the same dataset with the
// same query language and accepts plain-text bodies.
const OVERPASS_ENDPOINT = "https://overpass.openstreetmap.fr/api/interpreter";

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

/**
 * Count amenities within `radiusMeters` of (lat, lng). Returns zero
 * counts for any category that has no nearby matches — the caller
 * gets a stable shape regardless of geography.
 */
export async function getAmenityCounts(
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

  const counts: Record<string, number> = {};
  for (const category of AMENITY_CATEGORIES) {
    counts[category.label] = 0;
  }
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
