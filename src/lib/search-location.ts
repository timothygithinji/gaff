/**
 * Canonical representation of a "where" the user wants to search.
 *
 * Replaces the older single-outcode model. A SearchLocation is anchored
 * on a Google Places `place_id` plus the place's centroid + viewport
 * bounds, and carries pre-resolved portal-specific tokens (Rightmove
 * locationIdentifier, Zoopla `q` string, OpenRent `term`). The
 * user-picked search radius lives on the `searches` row itself
 * (`radiusMiles`), not here — it's a property of the search, not the
 * location.
 *
 * The portalRefs are resolved at form-submit time by `resolvePortals`
 * in `portal-locations.ts` and stored on the row so scrape-portal can
 * build URLs without hitting any portal typeahead at scrape time.
 * Resolution is best-effort per-portal: a missing portalRef means
 * "scrape will skip this portal" (used for the degenerate-backfill
 * case from migration 0010 and as a defensive fallback if a portal's
 * typeahead has an outage during a save).
 *
 * `type` is constrained to Google's "(regions)" subset we actually
 * accept on the form — postcode, locality (city), sublocality, and
 * neighborhood. Anything broader (administrative_area_level_1 etc.)
 * would scrape too coarse to be useful and is filtered out by the
 * autocomplete's `includedPrimaryTypes`.
 *
 * `colloquial_area` is the one type that does NOT come from Google —
 * informal London regions ("North London", "South London", …) have no
 * place_id in Google's database (verified against the live Places API),
 * so they're supplied as hand-curated presets in `london-areas.ts` with
 * fixed bounds. They flow through the exact same geometry-based outcode
 * fan-out as a real area pick; only the source differs.
 */
import { z } from "zod";

export const SEARCH_LOCATION_TYPES = [
  "postal_code",
  "locality",
  "sublocality",
  "neighborhood",
  "colloquial_area",
] as const;

export type SearchLocationType = (typeof SEARCH_LOCATION_TYPES)[number];

export type LatLng = { lat: number; lng: number };

/**
 * Rectangular viewport returned by Google Places. `null` for the
 * degenerate-backfill row from migration 0010 — every freshly created
 * SearchLocation will have a real bounds.
 */
export type LocationBounds = { ne: LatLng; sw: LatLng } | null;

export type RightmoveLocationRef = {
  /** e.g. `OUTCODE^1859` or `REGION^85262`. */
  locationIdentifier: string;
};

export type ZooplaLocationRef = {
  /** Free-text query for `/search/?section=to-rent&q=...`. */
  q: string;
};

export type OpenrentLocationRef = {
  /** Free-text `term=` value. Usually the place's display name. */
  term: string;
};

/**
 * Per-portal token shape. A `postal_code` location resolves to a single
 * ref (the existing single-outcode path). A `locality` / `sublocality` /
 * `neighborhood` location resolves to an array — one ref per covering
 * outcode (see `coveringOutcodes` below) — and scrape-portal iterates.
 * Readers MUST normalise with `Array.isArray` before iterating.
 */
export type SearchLocationPortalRefs = {
  rightmove?: RightmoveLocationRef | RightmoveLocationRef[];
  zoopla?: ZooplaLocationRef | ZooplaLocationRef[];
  openrent?: OpenrentLocationRef | OpenrentLocationRef[];
};

export type SearchLocation = {
  /** Google `place_id`. Empty string ONLY for migration 0010's degenerate backfill. */
  placeId: string;
  /** Short display name from Google (e.g. "Camden Town"). */
  name: string;
  /**
   * Google's `formattedAddress`, e.g. "Camden Town, London NW1, UK".
   * Used directly as Zoopla's `q` param AND as the disambiguation
   * scoring corpus for Rightmove's typeahead resolver.
   */
  formattedAddress: string;
  type: SearchLocationType;
  lat: number;
  lng: number;
  bounds: LocationBounds;
  /**
   * Postcode outcodes (e.g. `["N1", "N4", "NW1"]`) that the area covers.
   * Populated at save time by `findCoveringOutcodes` for non-postcode
   * locations; left absent for `postal_code` locations (the `name` IS
   * the outcode). Exposed to the form so the user can deselect outcodes
   * before saving; the user's edits flow back into `portalRefs` via a
   * re-stamp.
   */
  coveringOutcodes?: string[];
  portalRefs: SearchLocationPortalRefs;
};

// -----------------------------------------------------------------------------
// Zod
// -----------------------------------------------------------------------------

const latLngSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});

const boundsSchema = z
  .object({
    ne: latLngSchema,
    sw: latLngSchema,
  })
  .nullable();

const rightmoveRefSchema = z.object({
  locationIdentifier: z.string().trim().min(1),
});

const zooplaRefSchema = z.object({
  q: z.string().trim().min(1),
});

const openrentRefSchema = z.object({
  term: z.string().trim().min(1),
});

/**
 * Each portal ref is either a single object (postal_code path, kept for
 * backwards compatibility with rows written before the area-search
 * feature) or an array of objects (one per covering outcode). A union
 * of the two — rather than always-array — means existing N1 / NW3-style
 * postal_code searches don't need a backfill on read.
 */
const rightmoveRefOrArraySchema = z.union([
  rightmoveRefSchema,
  z.array(rightmoveRefSchema).min(1),
]);
const zooplaRefOrArraySchema = z.union([
  zooplaRefSchema,
  z.array(zooplaRefSchema).min(1),
]);
const openrentRefOrArraySchema = z.union([
  openrentRefSchema,
  z.array(openrentRefSchema).min(1),
]);

const portalRefsSchema = z.object({
  rightmove: rightmoveRefOrArraySchema.optional(),
  zoopla: zooplaRefOrArraySchema.optional(),
  openrent: openrentRefOrArraySchema.optional(),
});

const outcodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(4)
  .regex(/^[A-Z]{1,2}[0-9][A-Z0-9]?$/, "outcode must look like 'N1' / 'NW3'");

export const searchLocationSchema = z.object({
  placeId: z.string(),
  name: z.string().trim().min(1).max(200),
  formattedAddress: z.string().trim().min(1).max(500),
  type: z.enum(SEARCH_LOCATION_TYPES),
  lat: z.number().finite(),
  lng: z.number().finite(),
  bounds: boundsSchema,
  coveringOutcodes: z.array(outcodeSchema).max(500).optional(),
  portalRefs: portalRefsSchema,
});

// -----------------------------------------------------------------------------
// Read-helpers
// -----------------------------------------------------------------------------

/**
 * Normalise a portal ref to an array, so iteration code can stay
 * single-shaped without caring whether the value was written as a
 * postal_code (single ref) or area (array of refs).
 */
export function asPortalRefArray<T>(
  ref: T | T[] | undefined
): readonly T[] {
  if (ref === undefined) {
    return [];
  }
  return Array.isArray(ref) ? ref : [ref];
}
