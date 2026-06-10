/**
 * Client-side fetch of a TfL line/route's *geometry* — the path it actually
 * traces across the map — so selecting a station or bus-stop chip can show
 * *where its services go*, not just that a stop is nearby.
 *
 * Source: TfL Unified API `/Line/{id}/Route/Sequence/{direction}`. The
 * response carries `lineStrings`: JSON-encoded arrays of `[lng, lat]` paths
 * (one path for a bus, several for a branching tube line). CORS is open
 * (`access-control-allow-origin: *`) and no key is needed at our volume, so we
 * call it straight from the browser and memoise per line — geometry is static,
 * so a re-selected line redraws instantly.
 *
 * Only TfL-operated modes have geometry here: tube, Overground, Elizabeth
 * line, DLR, tram and London buses. National Rail operators ("Great Northern")
 * 404 — we cache that as "no paths" and the caller simply draws no line.
 */

export type LatLng = { lat: number; lng: number };

const LINE_ENDPOINT = "https://api.tfl.gov.uk/Line";

/**
 * Official line colours, keyed by TfL line id. Buses and any unlisted line
 * (National Rail operators, older Overground names) are coloured by a stable
 * hash instead — see `lineColor` — so several routes off one stop stay
 * tellable apart on the map.
 */
const LINE_COLOR: Record<string, string> = {
  // Underground.
  bakerloo: "#B36305",
  central: "#E32017",
  circle: "#FFD300",
  district: "#00782A",
  "hammersmith-city": "#F3A9BB",
  jubilee: "#A0A5A9",
  metropolitan: "#9B0056",
  northern: "#000000",
  piccadilly: "#003688",
  victoria: "#0098D4",
  "waterloo-city": "#95CDBA",
  // Other TfL rail.
  elizabeth: "#6950A1",
  dlr: "#00AFAD",
  tram: "#5FB728",
  // Overground (2024 line names).
  liberty: "#61686B",
  lioness: "#FAA61A",
  mildmay: "#006FB8",
  suffragette: "#5BBD72",
  weaver: "#823A62",
  windrush: "#DC241F",
};

const NON_ALNUM = /[^a-z0-9]+/g;
const LINE_WORD = /\bline\b/g;
const EDGE_DASH = /^-+|-+$/g;

/**
 * A display line/route name → its TfL line id:
 *   "Piccadilly"          → "piccadilly"
 *   "Hammersmith & City"  → "hammersmith-city"
 *   "Elizabeth line"      → "elizabeth"
 *   "34" / "N29"          → "34" / "n29"
 */
export function tflLineId(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(LINE_WORD, " ")
    .replace(NON_ALNUM, "-")
    .replace(EDGE_DASH, "");
}

/** A stable, distinct colour for a bus route / unlisted line (golden-ish hash). */
function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360} 65% 45%)`;
}

/** The colour to draw a line in: official where known, else a stable hash. */
export function lineColor(lineId: string): string {
  return LINE_COLOR[lineId] ?? hashColor(lineId);
}

type SequenceResponse = { lineStrings?: string[] };

/**
 * lineId → its decoded paths, memoised. A failed/empty fetch caches `[]` so we
 * don't re-hit a 404 (e.g. National Rail) on every selection.
 */
const cache = new Map<string, Promise<LatLng[][]>>();

/** One path's `[lng, lat]` pairs → drawable points (ignoring malformed pairs). */
function decodePath(path: unknown): LatLng[] {
  if (!Array.isArray(path)) {
    return [];
  }
  const pts: LatLng[] = [];
  for (const pair of path as unknown[]) {
    if (!Array.isArray(pair) || pair.length < 2) {
      continue;
    }
    const [lng, lat] = pair;
    if (typeof lat === "number" && typeof lng === "number") {
      pts.push({ lat, lng });
    }
  }
  return pts;
}

/** One `lineStrings[]` entry (a JSON string) → its drawable paths. */
function decodeLineString(raw: string): LatLng[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  // Each lineString decodes to an array of paths; each path an array of
  // [lng, lat] pairs.
  const out: LatLng[][] = [];
  for (const path of parsed as unknown[]) {
    const pts = decodePath(path);
    if (pts.length > 1) {
      out.push(pts);
    }
  }
  return out;
}

async function load(lineId: string): Promise<LatLng[][]> {
  const url = `${LINE_ENDPOINT}/${encodeURIComponent(
    lineId
  )}/Route/Sequence/all?serviceTypes=Regular&excludeCrowding=true`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return [];
  }
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as SequenceResponse;
  const paths: LatLng[][] = [];
  for (const raw of data.lineStrings ?? []) {
    paths.push(...decodeLineString(raw));
  }
  return paths;
}

/** Fetch (and memoise) the drawable paths for a TfL line id. */
export function fetchLineGeometry(lineId: string): Promise<LatLng[][]> {
  const hit = cache.get(lineId);
  if (hit) {
    return hit;
  }
  const pending = load(lineId);
  cache.set(lineId, pending);
  return pending;
}
