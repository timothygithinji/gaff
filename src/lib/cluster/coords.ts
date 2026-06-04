/**
 * Listing coordinates for cluster disambiguation.
 *
 * Portal addresses are road-level ("Brownlow Road, London N11") and almost
 * never carry a house number (~1% in prod), so the street name alone can't
 * tell two homes on the same road apart. Coordinates are the discriminator
 * we DO have — present on 100% of listings — but they're noisy: a portal
 * pins to the building on some listings and to a street/postcode centroid
 * on others, so "same property" can still be tens of metres apart and two
 * different homes on a long road are hundreds of metres apart. Treat
 * distance as corroboration, not proof, and always alongside price.
 *
 * The lat/lng COLUMNS are only ~35% populated; the real value is reliably
 * in `raw_json.lat` / `raw_json.lng` for all three portals, so
 * {@link listingCoord} falls back to the blob.
 */

export type Coord = { lat: number; lng: number };

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * A listing's coordinate, preferring the column and falling back to the raw
 * JSON blob. Returns null when neither has a usable pair.
 */
export function listingCoord(input: {
  lat: unknown;
  lng: unknown;
  rawJson?: unknown;
}): Coord | null {
  const colLat = num(input.lat);
  const colLng = num(input.lng);
  if (colLat != null && colLng != null) {
    return { lat: colLat, lng: colLng };
  }
  const j = (input.rawJson ?? {}) as Record<string, unknown>;
  const jLat = num(j.lat) ?? num(j.latitude);
  const jLng = num(j.lng) ?? num(j.longitude);
  if (jLat != null && jLng != null) {
    return { lat: jLat, lng: jLng };
  }
  return null;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in metres. */
export function distanceMetres(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Coordinates close enough to corroborate "same property". Default 30m —
 * tight enough to separate different buildings on a road, loose enough to
 * absorb the building-vs-centroid jitter between portals. A null on either
 * side is NOT corroboration (we just don't know).
 */
export function coordsCorroborate(
  a: Coord | null,
  b: Coord | null,
  withinM = 30
): boolean {
  if (!a || !b) {
    return false;
  }
  return distanceMetres(a, b) <= withinM;
}
