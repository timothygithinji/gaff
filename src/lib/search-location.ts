/**
 * Canonical representation of a "where" the user wants to search.
 *
 * Replaces the older single-outcode model. A SearchLocation is anchored
 * on a Google Places `place_id` plus the place's centroid + viewport
 * bounds, and carries pre-resolved portal-specific tokens (Rightmove
 * locationIdentifier, Zoopla `q` string, OpenRent term+radius).
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
 */
import { z } from "zod";

export const SEARCH_LOCATION_TYPES = [
  "postal_code",
  "locality",
  "sublocality",
  "neighborhood",
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
  /** Radius around `term` in miles. Derived from bounds, capped sanely. */
  withinMiles: number;
};

export type SearchLocationPortalRefs = {
  rightmove?: RightmoveLocationRef;
  zoopla?: ZooplaLocationRef;
  openrent?: OpenrentLocationRef;
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
  withinMiles: z.number().finite().min(0).max(50),
});

const portalRefsSchema = z.object({
  rightmove: rightmoveRefSchema.optional(),
  zoopla: zooplaRefSchema.optional(),
  openrent: openrentRefSchema.optional(),
});

export const searchLocationSchema = z.object({
  placeId: z.string(),
  name: z.string().trim().min(1).max(200),
  formattedAddress: z.string().trim().min(1).max(500),
  type: z.enum(SEARCH_LOCATION_TYPES),
  lat: z.number().finite(),
  lng: z.number().finite(),
  bounds: boundsSchema,
  portalRefs: portalRefsSchema,
});
