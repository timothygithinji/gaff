/**
 * Minimal client for the TfL Unified API "StopPoint" geo search.
 *
 * Endpoint: GET https://api.tfl.gov.uk/StopPoint?stopTypes=…&lat=…&lon=…&radius=…
 *
 * Google Places only tells us a station is a `subway_station` /
 * `train_station` — it can't separate Underground from Overground,
 * Elizabeth line, DLR or National Rail (see the API probe notes). TfL is
 * the authoritative, station-keyed source: each stop carries a `modes`
 * list we can turn into the right roundels.
 *
 * Works without an API key at low volume (TfL rate-limits anonymous
 * callers); pass `appKey` to lift that. London-only by nature — outside
 * the TfL area this returns nothing and the caller falls back to Google's
 * coarse station data.
 *
 * TfL splits a big interchange into one stop per building ("Stratford
 * Underground Station", "Stratford DLR Station", …), so we strip the
 * mode/“station” suffixes to a clean name and merge same-named stops,
 * unioning their modes — one "Stratford" carrying every mode it serves.
 */

const STOPPOINT_ENDPOINT = "https://api.tfl.gov.uk/StopPoint";
const STOP_TYPES = "NaptanMetroStation,NaptanRailStation";
const EARTH_RADIUS_MILES = 3958.8;

/** The rail-family modes we render roundels for; everything else is dropped. */
export const RAIL_MODES = [
  "tube",
  "overground",
  "elizabeth-line",
  "dlr",
  "tram",
  "national-rail",
] as const;

export type TflMode = (typeof RAIL_MODES)[number];

const RAIL_MODE_SET = new Set<string>(RAIL_MODES);

export type TflStation = {
  name: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  modes: TflMode[];
};

type StopPointResponse = {
  stopPoints?: Array<{
    commonName?: string;
    lat?: number;
    lon?: number;
    modes?: string[];
  }>;
};

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 *
      Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat));
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const SUFFIX_RE =
  /\b(underground|overground|elizabeth line|dlr|rail|tram)\b/gi;
const STATION_RE = /\bstation\b/gi;
const PAREN_RE = /\(.*?\)/g;

/** "Stratford Underground Station" → "Stratford"; "New Southgate Rail Station" → "New Southgate". */
function cleanStationName(raw: string): string {
  const cleaned = raw
    .replace(PAREN_RE, " ")
    .replace(STATION_RE, " ")
    .replace(SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw.trim();
}

/**
 * Stations within `radiusMeters` of the origin, nearest-first, merged by
 * clean name with their modes unioned. Throws on HTTP error so the caller
 * can fall back to Google.
 */
export async function fetchNearbyTflStations(
  origin: { lat: number; lng: number },
  radiusMeters: number,
  appKey?: string
): Promise<TflStation[]> {
  const params = new URLSearchParams({
    stopTypes: STOP_TYPES,
    radius: String(radiusMeters),
    lat: String(origin.lat),
    lon: String(origin.lng),
    useStopPointHierarchy: "false",
  });
  if (appKey) {
    params.set("app_key", appKey);
  }
  const res = await fetch(`${STOPPOINT_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`TfL StopPoint ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as StopPointResponse;

  // Merge stops by clean name, unioning rail-family modes.
  const byName = new Map<
    string,
    { name: string; lat: number; lng: number; modes: Set<TflMode> }
  >();
  for (const sp of data.stopPoints ?? []) {
    const name = typeof sp.commonName === "string" ? sp.commonName : "";
    const lat = sp.lat;
    const lng = sp.lon;
    if (!name || typeof lat !== "number" || typeof lng !== "number") {
      continue;
    }
    const modes = (sp.modes ?? []).filter((m): m is TflMode =>
      RAIL_MODE_SET.has(m)
    );
    if (modes.length === 0) {
      continue;
    }
    const clean = cleanStationName(name);
    const existing = byName.get(clean);
    if (existing) {
      for (const m of modes) {
        existing.modes.add(m);
      }
    } else {
      byName.set(clean, { name: clean, lat, lng, modes: new Set(modes) });
    }
  }

  const stations: TflStation[] = [];
  for (const s of byName.values()) {
    stations.push({
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      distanceMiles: haversineMiles(origin, { lat: s.lat, lng: s.lng }),
      // Keep a stable, sensible roundel order.
      modes: RAIL_MODES.filter((m) => s.modes.has(m)),
    });
  }
  stations.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return stations;
}
