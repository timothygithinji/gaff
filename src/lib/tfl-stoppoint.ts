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
const BUS_STOP_TYPES = "NaptanPublicBusCoachTram";
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
  /**
   * Lines serving the station, in roundel order: tube line names
   * ("Piccadilly"), the train operator for National Rail ("Great
   * Northern"), Overground/Elizabeth/DLR/Tram line names. Empty when TfL
   * didn't list any.
   */
  lines: string[];
};

/** A nearby bus stop with the route numbers that call there. */
export type TflBusStop = {
  name: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  /** Bus route numbers serving the stop, e.g. ["34", "232"]. */
  lines: string[];
};

type StopPointLine = { name?: string };

type StopPointResponse = {
  stopPoints?: Array<{
    commonName?: string;
    lat?: number;
    lon?: number;
    modes?: string[];
    lines?: StopPointLine[];
    lineModeGroups?: Array<{ modeName?: string; lineIdentifier?: string[] }>;
  }>;
};

/** Display line names from a stop's `lines[].name`, de-duplicated, in order. */
function lineNames(lines: StopPointLine[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines ?? []) {
    const name = typeof l.name === "string" ? l.name.trim() : "";
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

/** Numeric-first sort so bus routes read "34, 102, 184", not "102, 184, 34". */
function compareBusRoutes(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
    return na - nb;
  }
  return a.localeCompare(b);
}

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

  // Merge stops by clean name, unioning rail-family modes + their lines.
  const byName = new Map<
    string,
    {
      name: string;
      lat: number;
      lng: number;
      modes: Set<TflMode>;
      lines: string[];
    }
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
    const lines = lineNames(sp.lines);
    const existing = byName.get(clean);
    if (existing) {
      for (const m of modes) {
        existing.modes.add(m);
      }
      for (const l of lines) {
        if (!existing.lines.some((e) => e.toLowerCase() === l.toLowerCase())) {
          existing.lines.push(l);
        }
      }
    } else {
      byName.set(clean, {
        name: clean,
        lat,
        lng,
        modes: new Set(modes),
        lines: [...lines],
      });
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
      lines: s.lines,
    });
  }
  stations.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return stations;
}

/**
 * Bus stops within `radiusMeters` of the origin, nearest-first, merged by
 * common name (directional pairs like "Bowes Road / GJ" + "/ GK" collapse
 * to one), unioning their route numbers. Throws on HTTP error so the caller
 * can fall back to Google's coarse bus stops (which carry no route list).
 */
export async function fetchNearbyTflBusStops(
  origin: { lat: number; lng: number },
  radiusMeters: number,
  appKey?: string
): Promise<TflBusStop[]> {
  const params = new URLSearchParams({
    stopTypes: BUS_STOP_TYPES,
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
    throw new Error(`TfL StopPoint (bus) ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as StopPointResponse;

  const byName = new Map<
    string,
    { name: string; lat: number; lng: number; lines: Set<string> }
  >();
  for (const sp of data.stopPoints ?? []) {
    const rawName = typeof sp.commonName === "string" ? sp.commonName : "";
    const lat = sp.lat;
    const lng = sp.lon;
    if (!rawName || typeof lat !== "number" || typeof lng !== "number") {
      continue;
    }
    const lines = lineNames(sp.lines);
    if (lines.length === 0) {
      continue;
    }
    const clean = cleanStationName(rawName);
    const existing = byName.get(clean.toLowerCase());
    if (existing) {
      for (const l of lines) {
        existing.lines.add(l);
      }
    } else {
      byName.set(clean.toLowerCase(), {
        name: clean,
        lat,
        lng,
        lines: new Set(lines),
      });
    }
  }

  const stops: TflBusStop[] = [];
  for (const s of byName.values()) {
    stops.push({
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      distanceMiles: haversineMiles(origin, { lat: s.lat, lng: s.lng }),
      lines: [...s.lines].sort(compareBusRoutes),
    });
  }
  stops.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return stops;
}
