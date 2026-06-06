/**
 * Orchestrates the detail page's "what's nearby" data from two sources:
 *
 *   - Google Places (New) — the full POI set: transport, parks, shops,
 *     GPs, restaurants, each with coordinates.
 *   - TfL StopPoint — authoritative, station-keyed rail-family data with
 *     a `modes` list (tube / overground / elizabeth-line / dlr / tram /
 *     national-rail), so chips can show the *correct* line roundels
 *     instead of a coarse "rail" guess.
 *
 * Strategy: take everything from Google, then — when TfL returns stations
 * (i.e. we're in London) — drop Google's rail-family stations (keeping its
 * buses) and replace them with the TfL stations, which carry modes. If TfL
 * is unavailable or empty we keep Google's coarser stations untouched, so
 * the feature degrades rather than disappears.
 */

import {
  type NearbyPlace,
  TRANSIT_RADIUS_METRES,
  type TransitKind,
  searchNearbyPlaces,
} from "./google-places";
import {
  type TflBusStop,
  type TflMode,
  fetchNearbyTflBusStops,
  fetchNearbyTflStations,
} from "./tfl-stoppoint";

export type { NearbyPlace } from "./google-places";

type LatLng = { lat: number; lng: number };

type GatherOptions = {
  googleKey: string;
  /** Extra headers for the Google calls (e.g. a Referer for a restricted key). */
  googleHeaders?: Record<string, string>;
  /** Optional TfL app key (anonymous works at low volume). */
  tflAppKey?: string;
};

/** A station is "rail-family" (TfL-ownable) when it isn't a bus stop. */
function isRailFamily(p: NearbyPlace): boolean {
  return p.category === "transport" && p.kind !== "bus";
}

/** A Google bus stop (replaced wholesale by TfL bus stops when available). */
function isBusStop(p: NearbyPlace): boolean {
  return p.category === "transport" && p.kind === "bus";
}

/** Nearest N TfL bus stops to keep — they otherwise swamp the chip list. */
const BUS_STOP_LIMIT = 6;

/** Pick a legacy `kind` from a station's modes (for amenity matching + fallback). */
function kindFromModes(modes: TflMode[]): TransitKind {
  if (modes.includes("tube")) {
    return "tube";
  }
  if (modes.includes("tram")) {
    return "tram";
  }
  // overground / elizabeth-line / dlr / national-rail all read as "rail"
  // for the coarse amenity filter.
  return "rail";
}

type TflStation = Awaited<ReturnType<typeof fetchNearbyTflStations>>[number];

/**
 * Swap a place set's rail-family stations for the TfL ones (which carry
 * `modes`), keeping Google's buses + POIs. No-op when TfL has no coverage.
 * Shared by the live gather + the backfill's TfL-only patch.
 */
export function mergeTflStations(
  places: NearbyPlace[],
  tflStations: TflStation[]
): NearbyPlace[] {
  if (tflStations.length === 0) {
    return places;
  }
  const kept = places.filter((p) => !isRailFamily(p));
  const tflPlaces: NearbyPlace[] = tflStations.map((s) => ({
    name: s.name,
    category: "transport",
    kind: kindFromModes(s.modes),
    modes: s.modes,
    ...(s.lines.length > 0 ? { lines: s.lines } : {}),
    lat: s.lat,
    lng: s.lng,
    distanceMiles: s.distanceMiles,
  }));
  return [...kept, ...tflPlaces].sort(
    (a, b) => a.distanceMiles - b.distanceMiles
  );
}

/**
 * Swap Google's coarse bus stops (generic names, no routes) for TfL's,
 * which carry the route numbers serving each stop. No-op when TfL has no
 * bus coverage, so the feature degrades to Google's bus stops rather than
 * vanishing.
 */
export function mergeTflBusStops(
  places: NearbyPlace[],
  busStops: TflBusStop[]
): NearbyPlace[] {
  if (busStops.length === 0) {
    return places;
  }
  const kept = places.filter((p) => !isBusStop(p));
  const busPlaces: NearbyPlace[] = busStops
    .slice(0, BUS_STOP_LIMIT)
    .map((s) => ({
      name: s.name,
      category: "transport" as const,
      kind: "bus" as const,
      ...(s.lines.length > 0 ? { lines: s.lines } : {}),
      lat: s.lat,
      lng: s.lng,
      distanceMiles: s.distanceMiles,
    }));
  return [...kept, ...busPlaces].sort(
    (a, b) => a.distanceMiles - b.distanceMiles
  );
}

/** TfL stations within the standard 1-mile radius. Empty on error/outside London. */
export async function fetchTflStations(
  origin: LatLng,
  tflAppKey?: string
): Promise<TflStation[]> {
  try {
    return await fetchNearbyTflStations(origin, TRANSIT_RADIUS_METRES, tflAppKey);
  } catch {
    return [];
  }
}

/** TfL bus stops within the standard 1-mile radius. Empty on error/outside London. */
export async function fetchTflBusStops(
  origin: LatLng,
  tflAppKey?: string
): Promise<TflBusStop[]> {
  try {
    return await fetchNearbyTflBusStops(origin, TRANSIT_RADIUS_METRES, tflAppKey);
  } catch {
    return [];
  }
}

/**
 * The combined nearby-places set: Google POIs, with rail-family stations
 * and bus stops supplied by TfL (carrying `modes` + line/route names)
 * whenever TfL has coverage.
 */
export async function gatherNearbyPlaces(
  origin: LatLng,
  opts: GatherOptions
): Promise<NearbyPlace[]> {
  const [places, tflStations, tflBusStops] = await Promise.all([
    searchNearbyPlaces(opts.googleKey, origin, { headers: opts.googleHeaders }),
    fetchTflStations(origin, opts.tflAppKey),
    fetchTflBusStops(origin, opts.tflAppKey),
  ]);
  return mergeTflBusStops(mergeTflStations(places, tflStations), tflBusStops);
}
