/**
 * Hand-curated colloquial London regions.
 *
 * Google Places has no `place_id` for informal areas like "North London"
 * or "South London" — verified against the live Places API (New): under
 * the region type set Google only returns sub-localities (North Finchley,
 * North Kensington), and an unconstrained query returns only
 * *establishments* named "North London" (schools, a cricket club). So
 * these can't come from the autocomplete; we supply them as presets.
 *
 * Each preset carries a fixed centroid + viewport bounds. Those bounds
 * were derived from the real centroids of the region's constituent
 * postcode outcodes (via postcodes.io), then verified end-to-end against
 * `findCoveringOutcodes` — the same geometry fan-out the form runs at
 * pick time. So selecting a preset behaves identically to picking a real
 * Google area: the bounds drive the outcode fan-out, the chip list lets
 * the user trim, and the save path stamps one portal ref per outcode.
 *
 * Coverage at a glance (closest-to-centre first, trimmable in the UI):
 *   - North London   → N1–N22, NW1–NW11  (~35 outcodes)
 *   - East London    → E1–E20            (~20 outcodes)
 *   - South London   → SE1–SE28, SW2–SW20 (~47 outcodes)
 *   - West London    → W2–W14            (~13 outcodes)
 *   - Central London → EC*, WC*          (~40 split outcodes)
 */

import type { SearchLocation } from "./search-location";

export type LondonAreaPreset = {
  /** Stable slug; becomes the synthetic placeId `curated:<id>`. */
  id: string;
  /** Display name, used as the chip label and Zoopla free-text fallback. */
  name: string;
  /** Centre of the bounding box (lat). */
  lat: number;
  /** Centre of the bounding box (lng). */
  lng: number;
  /** Viewport enclosing the region's constituent outcode centroids. */
  bounds: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
};

export const LONDON_AREA_PRESETS: readonly LondonAreaPreset[] = [
  {
    id: "north-london",
    name: "North London",
    lat: 51.58446,
    lng: -0.15643,
    bounds: { sw: { lat: 51.53219, lng: -0.25479 }, ne: { lat: 51.63672, lng: -0.05807 } },
  },
  {
    id: "east-london",
    name: "East London",
    lat: 51.56166,
    lng: -0.00614,
    bounds: { sw: { lat: 51.50154, lng: -0.06609 }, ne: { lat: 51.62178, lng: 0.05381 } },
  },
  {
    id: "south-london",
    name: "South London",
    lat: 51.44993,
    lng: -0.0754,
    bounds: { sw: { lat: 51.39777, lng: -0.267 }, ne: { lat: 51.50208, lng: 0.11621 } },
  },
  {
    id: "west-london",
    name: "West London",
    lat: 51.50804,
    lng: -0.26073,
    bounds: { sw: { lat: 51.49118, lng: -0.33597 }, ne: { lat: 51.5249, lng: -0.18549 } },
  },
  {
    id: "central-london",
    name: "Central London",
    lat: 51.51799,
    lng: -0.10472,
    bounds: { sw: { lat: 51.50911, lng: -0.13284 }, ne: { lat: 51.52687, lng: -0.07659 } },
  },
] as const;

/**
 * Build a {@link SearchLocation} from a preset. Mirrors the shape
 * `PlaceAutocomplete` produces for a real Google pick — empty
 * `portalRefs` (server stamps at save), `coveringOutcodes` left absent so
 * the picker resolves them via the same `resolveAreaOutcodes` path. The
 * synthetic `placeId` keeps the picker's dedup-by-placeId logic happy and
 * never collides with a real Google id (which are opaque, no `:`-prefix).
 */
export function presetToSearchLocation(preset: LondonAreaPreset): SearchLocation {
  return {
    placeId: `curated:${preset.id}`,
    name: preset.name,
    formattedAddress: `${preset.name}, London, UK`,
    type: "colloquial_area",
    lat: preset.lat,
    lng: preset.lng,
    bounds: preset.bounds,
    portalRefs: {},
  };
}
