/**
 * Area → covering outcodes resolver.
 *
 * When the user picks a Google Places result whose `type` is broader than
 * `postal_code` ("North London", "Camden Town", "Hampstead", …), the
 * search needs to fan out across every UK outcode whose centroid falls
 * inside the area's bounds. Each portal then scrapes per outcode and the
 * existing cluster + dedup pipeline merges the results.
 *
 * Strategy:
 *   1. Compute a radius (metres) from the area's bounds — specifically,
 *      the great-circle distance from the centre to the NE corner, plus a
 *      small safety margin. This guarantees the postcodes.io radius query
 *      contains every outcode whose centroid lies inside the rectangular
 *      bounds.
 *   2. Single call to `GET /outcodes?lon=&lat=&radius=&limit=100` —
 *      returns each candidate outcode with its centroid coordinates.
 *      postcodes.io hard-caps `limit` at 100 server-side, regardless of
 *      what we ask for.
 *   3. Filter the candidates to those whose centroid sits inside the
 *      rectangular `bounds`. A pure radius circle would over-include
 *      outcodes near the diagonals.
 *   4. Sort by ascending distance from the area's centre, so the closest
 *      outcodes appear first in the UI chip list.
 */

import { createPostcodesClient, nearestOutcodes } from "./api-clients/postcodes-io";
import type { LocationBounds, SearchLocation } from "./search-location";

/**
 * Result of resolving a non-postcode area to its outcodes. `outcodes`
 * are upper-case, deduped, and sorted closest-to-centre first.
 */
export type CoveringOutcodesResult = {
  outcodes: string[];
  /** True when postcodes.io may have truncated the list to its 100-cap. */
  truncated: boolean;
};

export type FindCoveringOutcodesOptions = {
  /** Custom fetch (lets tests inject a recorder / stub). */
  fetch?: typeof fetch;
  /**
   * Override the safety margin (metres) added to the bounds half-diagonal
   * before querying postcodes.io. The default leaves enough slack to
   * absorb outcode centroids that sit just outside the rectangle but
   * whose addressable area still overlaps it.
   */
  marginMetres?: number;
};

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_MARGIN_METRES = 500;
/** postcodes.io's documented hard cap on `/outcodes?limit=`. */
const POSTCODES_IO_OUTCODE_CAP = 100;

// -----------------------------------------------------------------------------
// Geographic-outcode filter
// -----------------------------------------------------------------------------
//
// postcodes.io's `/outcodes` dataset includes *non-geographic* outcodes —
// large-user / PO-box / Admail codes (N81, N1P, NW26, EC50, …). These have
// real centroids and populated admin_district arrays, so they're
// indistinguishable from a real neighbourhood in the API response and slip
// through the bounds filter. They're never places you can rent in, so we
// drop them here. Authority: Royal Mail PAF non-geographic list + the
// "London postal district" / per-area Wikipedia articles.

/**
 * Highest *real* geographic district number per London postal area. Any
 * outcode above its area's max is a large-user / PO-box code, never a
 * neighbourhood (e.g. N81 vs the N1–N22 range, NW26 vs NW1–NW11, EC50 vs
 * EC1–EC4). Only the London letter-areas have a known dense cap; non-London
 * areas are left to the explicit deny-sets below.
 */
const LONDON_MAX_DISTRICT: Record<string, number> = {
  N: 22,
  NW: 11,
  E: 22,
  SE: 28,
  SW: 20,
  W: 14,
  EC: 4,
  WC: 2,
};

/**
 * Postcode AREAS (the leading letters) that are entirely non-geographic —
 * no district in them maps to a residential place. BX = bank/HMRC
 * large-users, BF = BFPO (forces), XX = retailer parcel returns.
 */
const NON_GEOGRAPHIC_AREAS = new Set(["BX", "BF", "XX"]);

/**
 * Specific non-geographic outcodes whose district number sits *inside* the
 * geographic range, so `LONDON_MAX_DISTRICT` can't catch them. These are
 * the letter-suffixed PO-box / Admail codes — note SW1P is deliberately
 * absent (it's geographic: Pimlico/Westminster). The numeric-overflow
 * codes (N81, NW26, E77, E98, EC50, SW95) are listed too for
 * documentation, though the max-district rule already rejects them. Plus a
 * few non-London specials that can surface in a UK-wide area pick.
 */
const NON_GEOGRAPHIC_OUTCODES = new Set([
  // London letter-suffixed PO-box / Admail (in-range numbers).
  "W1A",
  "N1P",
  "NW1W",
  "SE1P",
  "EC1P",
  "EC2P",
  "EC3P",
  "EC4P",
  // London numeric-overflow (redundant with LONDON_MAX_DISTRICT; explicit).
  "E77",
  "E98",
  "EC50",
  "N81",
  "NW26",
  "SW95",
  // Non-London specials.
  "GIR",
  "XM4",
  "SA99",
]);

/** Outcode shape: 1–2 area letters, 1–2 district digits, optional suffix. */
const OUTCODE_RE = /^([A-Z]{1,2})(\d{1,2})([A-Z])?$/;

/**
 * True iff `outcode` is a real geographic outcode (somewhere you could
 * actually live), false for malformed strings and known non-geographic
 * large-user / PO-box codes. Case-insensitive.
 */
export function isGeographicOutcode(outcode: string): boolean {
  const oc = outcode.trim().toUpperCase();
  const match = OUTCODE_RE.exec(oc);
  if (!(match?.[1] && match[2])) {
    // No district digit (e.g. "GIR") or otherwise malformed — not a
    // usable geographic outcode.
    return false;
  }
  const area = match[1];
  const district = Number(match[2]);
  if (NON_GEOGRAPHIC_AREAS.has(area)) {
    return false;
  }
  if (NON_GEOGRAPHIC_OUTCODES.has(oc)) {
    return false;
  }
  const max = LONDON_MAX_DISTRICT[area];
  if (max !== undefined && district > max) {
    return false;
  }
  return true;
}

/**
 * Find every outcode whose centroid sits inside `location.bounds`. Only
 * meaningful for non-`postal_code` locations — postcode searches keep
 * the single-outcode path. Returns an empty list (truncated=false) if the
 * location has no bounds (migration-0010 degenerate row) or if the
 * postcodes.io call fails — callers treat that as "fall through to the
 * existing single-ref behaviour".
 */
export async function findCoveringOutcodes(
  location: Pick<SearchLocation, "bounds" | "lat" | "lng">,
  options: FindCoveringOutcodesOptions = {}
): Promise<CoveringOutcodesResult> {
  const bounds = location.bounds;
  if (!bounds) {
    return { outcodes: [], truncated: false };
  }

  const center = { lat: location.lat, lng: location.lng };
  const radiusM = Math.max(
    distanceMetres(center, bounds.ne),
    distanceMetres(center, bounds.sw)
  ) + (options.marginMetres ?? DEFAULT_MARGIN_METRES);

  const client = createPostcodesClient(
    options.fetch ? { fetch: options.fetch } : {}
  );
  const { data, error } = await nearestOutcodes({
    client,
    query: {
      lat: center.lat,
      lon: center.lng,
      radius: Math.round(radiusM),
      limit: POSTCODES_IO_OUTCODE_CAP,
    },
  });
  if (error || !data?.result) {
    return { outcodes: [], truncated: false };
  }

  return {
    outcodes: insideGeographicOutcodes(
      data.result as CentroidPick[],
      bounds,
      center
    ),
    truncated: data.result.length >= POSTCODES_IO_OUTCODE_CAP,
  };
}

// postcodes.io's OpenAPI declares `latitude`/`longitude` with a multi-type
// schema (`["number", "null"]`) — the generator widens both to `unknown`,
// so callers coerce defensively. The runtime values are always finite
// numbers for outcodes that actually have a centroid (most do).
type CentroidPick = { outcode: string; latitude: unknown; longitude: unknown };

/**
 * Reduce postcodes.io's outcode rows to the geographic, in-bounds ones —
 * uppercased, deduped, and sorted closest-to-centre first (so the UI chip
 * list reads naturally). Drops rows without a centroid and non-geographic
 * large-user / PO-box codes (see {@link isGeographicOutcode}).
 */
function insideGeographicOutcodes(
  rows: CentroidPick[],
  bounds: NonNullable<LocationBounds>,
  center: { lat: number; lng: number }
): string[] {
  const inside: Array<{ outcode: string; distance: number }> = [];
  for (const o of rows) {
    const lat = typeof o.latitude === "number" ? o.latitude : null;
    const lng = typeof o.longitude === "number" ? o.longitude : null;
    if (lat == null || lng == null) {
      continue;
    }
    if (!(isGeographicOutcode(o.outcode) && isInsideBounds({ lat, lng }, bounds))) {
      continue;
    }
    inside.push({
      outcode: o.outcode.toUpperCase(),
      distance: distanceMetres(center, { lat, lng }),
    });
  }
  inside.sort((a, b) => a.distance - b.distance);

  // Dedupe (defensive — postcodes.io shouldn't return duplicates).
  const seen = new Set<string>();
  const outcodes: string[] = [];
  for (const { outcode } of inside) {
    if (!seen.has(outcode)) {
      seen.add(outcode);
      outcodes.push(outcode);
    }
  }
  return outcodes;
}

// -----------------------------------------------------------------------------
// Geometry helpers
// -----------------------------------------------------------------------------

/** Great-circle distance in metres (haversine). */
function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = ((b.lat - a.lat) * Math.PI) / 180;
  const dλ = ((b.lng - a.lng) * Math.PI) / 180;

  const h =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * True iff `point` is inside the rectangular `bounds`. Handles
 * antimeridian crossings (sw.lng > ne.lng) — not relevant for UK
 * outcodes but cheap to support.
 */
function isInsideBounds(
  point: { lat: number; lng: number },
  bounds: NonNullable<LocationBounds>
): boolean {
  const { ne, sw } = bounds;
  if (point.lat < sw.lat || point.lat > ne.lat) {
    return false;
  }
  if (sw.lng <= ne.lng) {
    return point.lng >= sw.lng && point.lng <= ne.lng;
  }
  // Bounds straddle the antimeridian.
  return point.lng >= sw.lng || point.lng <= ne.lng;
}
