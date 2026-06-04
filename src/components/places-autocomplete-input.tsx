/**
 * Google Places address autocomplete, shared across the app (commute
 * targets in the search form, the EPC address-override dialog, …).
 *
 * Uses the modern `PlaceAutocompleteElement` web component
 * (`<gmp-place-autocomplete>`) — Google deprecated the legacy
 * `Autocomplete` widget for new customers (March 2025); this is the
 * recommended replacement. `useGoogleMaps` loads the JS API once per
 * session.
 *
 * The element is instantiated programmatically and appended to a
 * container `<div>` rather than rendered as JSX — that way we don't need
 * to teach the JSX runtime about the custom element. Cleanup on unmount
 * removes the appended child.
 *
 * Events: `gmp-select` fires when the user picks a prediction. The event
 * carries a `placePrediction` whose `.toPlace()` returns a Place that has
 * to be populated via `fetchFields()` before its `displayName`,
 * `formattedAddress`, and `location` are readable.
 */
import { useEffect, useRef } from "react";
import { useGoogleMaps } from "../hooks/use-google-maps";

export type PlacesAutocompleteSelection = {
  /** Place's short display name (e.g. "22 Bishopsgate"). */
  label: string;
  /** Full formatted address incl. postcode. */
  formattedAddress: string;
  lat: number;
  lng: number;
};

type Props = {
  onSelect: (next: PlacesAutocompleteSelection) => void;
  /** ISO region codes to bias predictions to. Defaults to GB. */
  regionCodes?: string[];
};

export function PlacesAutocompleteInput({
  onSelect,
  regionCodes = ["gb"],
}: Props) {
  const status = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest callback in a ref so the one-time listener always
  // calls through to the current handler without rebuilding the element.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (
      status !== "ready" ||
      !containerRef.current ||
      !window.google?.maps?.places
    ) {
      return;
    }
    const el = new window.google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: regionCodes,
    });
    containerRef.current.appendChild(el);

    const handler = async (event: Event) => {
      const detail = (event as PlaceSelectEvent).placePrediction;
      if (!detail) {
        return;
      }
      const place = detail.toPlace();
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"],
      });
      const lat = place.location?.lat();
      const lng = place.location?.lng();
      const formattedAddress = place.formattedAddress ?? "";
      const label = place.displayName ?? formattedAddress;
      if (typeof lat === "number" && typeof lng === "number" && label) {
        onSelectRef.current({ label, formattedAddress, lat, lng });
      }
    };
    el.addEventListener("gmp-select", (event: Event) => {
      handler(event).catch(() => {
        // fetchFields() can reject if the place lookup fails; swallow and
        // let the user re-pick. Callers gate their CTA on a successful
        // selection.
      });
    });

    return () => {
      el.remove();
    };
  }, [status, regionCodes]);

  if (status === "error") {
    return (
      <p className="text-destructive text-xs">
        Address search failed to load. Reload the page or check the GCP API key
        has Places API (New) enabled.
      </p>
    );
  }

  if (status !== "ready") {
    return (
      <div
        aria-hidden
        className="h-10 w-full animate-pulse rounded-md bg-card"
      />
    );
  }

  return <div className="w-full" ref={containerRef} />;
}

// Inline the event type from use-google-maps so we don't re-export it.
type PlaceSelectEvent = Event & {
  placePrediction: {
    toPlace: () => {
      displayName?: string;
      formattedAddress?: string;
      location?: { lat: () => number; lng: () => number };
      fetchFields: (opts: { fields: string[] }) => Promise<void>;
    };
  };
};
