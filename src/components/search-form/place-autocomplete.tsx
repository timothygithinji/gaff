/**
 * Google Places autocomplete tuned for the Search form's location
 * picker (include + exclude).
 *
 * Wraps the (new) `<gmp-place-autocomplete>` web component with the
 * shape narrowed to UK (`includedRegionCodes: ["gb"]`) and the place-
 * type set narrowed to the four region grains we accept on the form:
 * postal_code, locality, sublocality (and sublocality_level_1 because
 * Google often returns the more specific variant), and neighborhood.
 * Street addresses, establishments, and admin areas larger than a city
 * are intentionally excluded — they'd either be too granular (a
 * single house) or too coarse (Greater London) for portal scoping.
 *
 * On `gmp-select`, fetches `id`, `displayName`, `formattedAddress`,
 * `location`, `viewport`, and `types` from the picked Place, normalises
 * into a {@link SearchLocation} with empty `portalRefs` (server stamps
 * them at save), and hands the value to the caller via `onSelect`.
 *
 * Reuses the global `useGoogleMaps` loader so we don't pay a second
 * script-load cost when commute targets and the location picker
 * coexist on the same page.
 */

import { useEffect, useRef } from "react";
import { useGoogleMaps } from "../../hooks/use-google-maps";
import type {
  SearchLocation,
  SearchLocationType,
} from "../../lib/search-location";

type Props = {
  onSelect: (loc: SearchLocation) => void;
  /** Optional placeholder; PlaceAutocompleteElement renders its own input. */
  placeholder?: string;
};

const INCLUDED_PRIMARY_TYPES = [
  "postal_code",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "neighborhood",
];

/**
 * Map Google's primary type tags to the closed set we store. The
 * autocomplete is constrained to the types above, so `unknown` should
 * never fire in practice — it's a defensive fallback.
 */
function normaliseType(googleTypes: readonly string[]): SearchLocationType {
  for (const t of googleTypes) {
    if (t === "postal_code") {
      return "postal_code";
    }
    if (t === "locality") {
      return "locality";
    }
    if (t === "sublocality" || t === "sublocality_level_1") {
      return "sublocality";
    }
    if (t === "neighborhood") {
      return "neighborhood";
    }
  }
  return "sublocality";
}

// Local typings — the full @types/google.maps package is huge and we
// only need a tiny surface here. Mirrors the pattern in
// `use-google-maps.ts`.
type GMapsLatLng = { lat: () => number; lng: () => number };
type GMapsLatLngBounds = {
  getNorthEast: () => GMapsLatLng;
  getSouthWest: () => GMapsLatLng;
};
type GMapsPlace = {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: GMapsLatLng;
  viewport?: GMapsLatLngBounds;
  types?: string[];
  fetchFields: (opts: { fields: string[] }) => Promise<void>;
};
type GMapsPlacePrediction = { toPlace: () => GMapsPlace };
type PlaceSelectEvent = Event & { placePrediction: GMapsPlacePrediction };

export function PlaceAutocomplete({ onSelect, placeholder }: Props) {
  const status = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      status !== "ready" ||
      !containerRef.current ||
      !window.google?.maps?.places
    ) {
      return;
    }
    const el = new window.google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ["gb"],
      includedPrimaryTypes: INCLUDED_PRIMARY_TYPES,
    });
    if (placeholder) {
      // The web component forwards the placeholder attribute to its
      // inner <input>; set it directly so we don't reach into the
      // shadow DOM.
      el.setAttribute("placeholder", placeholder);
    }
    containerRef.current.appendChild(el);

    const handle = async (event: Event) => {
      const detail = (event as PlaceSelectEvent).placePrediction;
      if (!detail) {
        return;
      }
      const place = detail.toPlace();
      await place.fetchFields({
        fields: [
          "id",
          "displayName",
          "formattedAddress",
          "location",
          "viewport",
          "types",
        ],
      });
      const lat = place.location?.lat();
      const lng = place.location?.lng();
      const name = place.displayName;
      const formattedAddress = place.formattedAddress;
      const placeId = place.id ?? "";
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !name ||
        !formattedAddress
      ) {
        // fetchFields didn't populate everything we need — drop the
        // selection silently rather than send a broken SearchLocation
        // upstream. User can re-pick.
        return;
      }
      const vp = place.viewport;
      const bounds = vp
        ? {
            ne: { lat: vp.getNorthEast().lat(), lng: vp.getNorthEast().lng() },
            sw: { lat: vp.getSouthWest().lat(), lng: vp.getSouthWest().lng() },
          }
        : null;
      const loc: SearchLocation = {
        placeId,
        name,
        formattedAddress,
        type: normaliseType(place.types ?? []),
        lat,
        lng,
        bounds,
        portalRefs: {}, // server stamps these at save
      };
      onSelect(loc);
    };

    el.addEventListener("gmp-select", (event: Event) => {
      handle(event).catch(() => {
        // Swallow fetchFields rejections — the user can re-pick and
        // the form blocks save until a valid SearchLocation is held.
      });
    });

    return () => {
      el.remove();
    };
  }, [status, onSelect, placeholder]);

  if (status === "error") {
    return (
      <p className="text-destructive text-xs">
        Place search failed to load. Reload the page or check the GCP API key
        has Places API (New) enabled.
      </p>
    );
  }

  if (status !== "ready") {
    return (
      <div
        aria-hidden
        className="h-10 w-full animate-pulse rounded-md border border-line bg-card"
      />
    );
  }

  // Border lives on the `gmp-place-autocomplete` host (see globals.css),
  // not this wrapper — a wrapper border gets covered at the corners by the
  // web component's own rounded, filled input box.
  return <div className="w-full" ref={containerRef} />;
}
