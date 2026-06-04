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
import { type TflMode, fetchNearbyTflStations } from "./tfl-stoppoint";

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
    lat: s.lat,
    lng: s.lng,
    distanceMiles: s.distanceMiles,
  }));
  return [...kept, ...tflPlaces].sort(
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

/**
 * The combined nearby-places set: Google POIs + buses, with rail-family
 * stations supplied by TfL (carrying `modes`) whenever TfL has coverage.
 */
export async function gatherNearbyPlaces(
  origin: LatLng,
  opts: GatherOptions
): Promise<NearbyPlace[]> {
  const places = await searchNearbyPlaces(opts.googleKey, origin, {
    headers: opts.googleHeaders,
  });
  const tflStations = await fetchTflStations(origin, opts.tflAppKey);
  return mergeTflStations(places, tflStations);
}
