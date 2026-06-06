/**
 * Minimal client for the Google Places API (New) "Nearby Search".
 *
 * Endpoint: POST https://places.googleapis.com/v1/places:searchNearby
 *
 * Used by `enrich-nearby-transit` to build the detail page's "what's
 * around here" map — every relevant place within ~1 mile of a property
 * cluster, grouped into a handful of categories the renter actually
 * cares about: public transport, parks, shops, GPs, and restaurants.
 *
 * One field-masked call per type-group (transport is split into rail vs
 * bus so a dense central area doesn't return 20 bus stops and bury the
 * tube). Each returns coordinates, so the map can plot every place and
 * draw an on-demand route to it on click.
 *
 * Field mask: `places.displayName,places.location,places.primaryType,
 * places.types` — names, coordinates, and the type signal we collapse
 * into a transit `kind`.
 */

const NEARBY_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

const FIELD_MASK =
  "places.displayName,places.location,places.primaryType,places.types";

/** ~1 mile, in metres — the radius the detail page promises. */
export const TRANSIT_RADIUS_METRES = 1609;

const EARTH_RADIUS_MILES = 3958.8;

export type PlaceCategory =
  | "transport"
  | "park"
  | "shop"
  | "gp"
  | "restaurant";

export type TransitKind = "tube" | "rail" | "tram" | "bus";

export type TransitMode =
  | "tube"
  | "overground"
  | "elizabeth-line"
  | "dlr"
  | "tram"
  | "national-rail";

export type LatLng = { lat: number; lng: number };

export type NearbyPlace = {
  name: string;
  category: PlaceCategory;
  /** Transit sub-type (transport only); null for every other category. */
  kind: TransitKind | null;
  /**
   * TfL modes serving a station (transport only), e.g. ["tube"] or
   * ["national-rail","overground"]. Populated when the station was matched
   * to TfL StopPoint data; absent for Google-only stations + non-stations.
   */
  modes?: TransitMode[];
  lat: number;
  lng: number;
  /** Straight-line distance from the search origin, in miles. */
  distanceMiles: number;
  /**
   * Real routed walking minutes from the cluster to this place (Google
   * Routes WALK). Populated by `enrich-nearby-transit` for the nearest
   * few station stops (tube/rail/tram) — the ones the transport filter
   * evaluates — so the queue can match on routed time, not a straight-
   * line guess. Absent for everything else.
   */
  walkMinutes?: number | null;
};

/**
 * One Places Nearby sweep: which Google place types to ask for, what
 * category to tag the results, and how many of the nearest to keep.
 * Transport is two sweeps (rail-family, then bus) so the closest tube/
 * rail isn't crowded out by nearer bus stops; the rest are one each.
 */
type Sweep = {
  category: PlaceCategory;
  includedTypes: string[];
  limit: number;
  /** When true, classify each result into a {@link TransitKind}. */
  classify: boolean;
};

const SWEEPS: Sweep[] = [
  {
    category: "transport",
    includedTypes: [
      "subway_station",
      "train_station",
      "light_rail_station",
      "transit_station",
    ],
    limit: 10,
    classify: true,
  },
  {
    category: "transport",
    includedTypes: ["bus_station", "bus_stop"],
    limit: 6,
    classify: true,
  },
  { category: "park", includedTypes: ["park"], limit: 5, classify: false },
  {
    category: "shop",
    includedTypes: ["supermarket", "grocery_store", "convenience_store"],
    limit: 6,
    classify: false,
  },
  { category: "gp", includedTypes: ["doctor"], limit: 5, classify: false },
  {
    category: "restaurant",
    includedTypes: ["restaurant", "cafe"],
    limit: 6,
    classify: false,
  },
];

type PlacesNearbyResponse = {
  places?: Array<{
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    primaryType?: string;
    types?: string[];
  }>;
  error?: { message?: string };
};

/**
 * Collapse Google's fine-grained place types onto our four-way
 * {@link TransitKind}. Prefers `primaryType`, then scans `types`.
 * Returns null for places that aren't recognisably public transport.
 */
function classifyKind(
  primaryType: string | undefined,
  types: string[] | undefined
): TransitKind | null {
  const all = [primaryType, ...(types ?? [])].filter(Boolean) as string[];
  if (all.includes("subway_station")) {
    return "tube";
  }
  if (all.includes("light_rail_station")) {
    return "tram";
  }
  if (all.includes("train_station")) {
    return "rail";
  }
  if (all.includes("bus_station") || all.includes("bus_stop")) {
    return "bus";
  }
  // `transit_station` is Google's generic catch-all — in residential
  // London it's overwhelmingly bus-stop clusters, not rail. Defaulting it
  // to "rail" stamped fake 0.03mi "rail" stops onto clusters, fooling the
  // queue's transport-time filter (nearest "rail" looked seconds away).
  // Treat a bare transit_station (no subway/train/light_rail/bus type) as
  // unclassified so it's dropped rather than masquerading as a station.
  return null;
}

function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** One Nearby Search call. Throws on HTTP / API error. */
async function runSweep(
  apiKey: string,
  origin: LatLng,
  sweep: Sweep,
  extraHeaders?: Record<string, string>
): Promise<NearbyPlace[]> {
  const res = await fetch(NEARBY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
      ...extraHeaders,
    },
    body: JSON.stringify({
      includedTypes: sweep.includedTypes,
      maxResultCount: sweep.limit,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: origin.lat, longitude: origin.lng },
          radius: TRANSIT_RADIUS_METRES,
        },
      },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Google Places ${res.status} ${res.statusText}: ${errBody.slice(0, 400)}`
    );
  }
  const data = (await res.json()) as PlacesNearbyResponse;
  if (data.error) {
    throw new Error(
      `Google Places API error: ${data.error.message ?? "unknown"}`
    );
  }
  const out: NearbyPlace[] = [];
  for (const place of data.places ?? []) {
    const name = place.displayName?.text?.trim();
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (!name || typeof lat !== "number" || typeof lng !== "number") {
      continue;
    }
    const kind = sweep.classify
      ? classifyKind(place.primaryType, place.types)
      : null;
    if (sweep.classify && !kind) {
      continue;
    }
    out.push({
      name,
      category: sweep.category,
      kind,
      lat,
      lng,
      distanceMiles: haversineMiles(origin, { lat, lng }),
    });
  }
  return out;
}

/**
 * Every relevant place within {@link TRANSIT_RADIUS_METRES} of `origin`,
 * across all categories, nearest-first and de-duplicated. Each sweep is
 * independent; if one fails the rest are kept (a missing category beats
 * losing the lot). Throws only when *every* sweep fails.
 */
export async function searchNearbyPlaces(
  apiKey: string,
  origin: LatLng,
  opts?: { headers?: Record<string, string> }
): Promise<NearbyPlace[]> {
  const results = await Promise.allSettled(
    SWEEPS.map((sweep) => runSweep(apiKey, origin, sweep, opts?.headers))
  );
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<NearbyPlace[]> => r.status === "fulfilled"
  );
  if (fulfilled.length === 0) {
    const firstReject = results.find((r) => r.status === "rejected");
    throw new Error(
      `Google Places: all sweeps failed (${
        (firstReject as PromiseRejectedResult | undefined)?.reason ?? "unknown"
      })`
    );
  }

  const seen = new Set<string>();
  const stops: NearbyPlace[] = [];
  for (const r of fulfilled) {
    for (const place of r.value) {
      // Key on name + rounded location so the same physical place from two
      // sweeps (e.g. a shop that's also a "point of interest") collapses.
      const key = `${place.name}@${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      stops.push(place);
    }
  }
  stops.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return stops;
}
