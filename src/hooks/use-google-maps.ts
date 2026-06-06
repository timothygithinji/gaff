/**
 * Browser-side loader for the Google Maps JS API + Places library.
 *
 * Pulls the API key once via `getMapsKey` (cached via TanStack Query
 * with `staleTime: Infinity` — the key doesn't change per session),
 * then dynamically injects the Maps script the first time any caller
 * mounts. Subsequent callers reuse the same in-flight promise; once
 * loaded, they get `status === "ready"` synchronously.
 *
 * SSR-safe: the script-load is gated behind a `typeof window` check
 * inside the effect, so the hook is a no-op on the server.
 *
 * Usage:
 *   const status = useGoogleMaps();
 *   if (status === "ready") {
 *     const ac = new window.google.maps.places.Autocomplete(inputEl, { ... });
 *   }
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryKeys } from "../lib/query-keys";
import { getMapsKey } from "../server/functions/config";

// Minimal typing for the bits of `window.google` we touch. The full
// `@types/google.maps` package is ~10MB of types we don't otherwise
// need — declaring the shape locally keeps the dependency footprint
// flat.
interface PlaceAutocompleteElement extends HTMLElement {
  // No documented `value` property — the element manages its internal
  // input. We rely on the `gmp-select` event for the user's pick.
}

type PlaceAutocompleteElementCtor = new (opts?: {
  includedRegionCodes?: string[];
  includedPrimaryTypes?: string[];
  locationBias?: unknown;
  locationRestriction?: unknown;
}) => PlaceAutocompleteElement;

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          PlaceAutocompleteElement: PlaceAutocompleteElementCtor;
        };
      };
    };
  }
}

export type GoogleMapsStatus = "idle" | "loading" | "ready" | "error";

// Module-level singleton — the promise resolves once per page-load.
let loadPromise: Promise<void> | null = null;

function loadScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps requires a browser"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // NOTE: deliberately NOT using `loading=async`. With that flag, the
    // bootstrap script fires `onload` before the Places library has
    // streamed in, so `new google.maps.places.Autocomplete(...)` throws
    // (`places` is undefined). The classic synchronous loader bundles
    // every URL-listed library into the main script body, so by the
    // time `onload` fires `window.google.maps.places.Autocomplete` is
    // guaranteed to exist.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=quarterly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // Defensive: confirm the new Places library actually populated.
      // If the key is missing the "Places API (New)" enable in GCP,
      // the script "loads" but `PlaceAutocompleteElement` is undefined;
      // reject so callers can show an error.
      if (window.google?.maps?.places?.PlaceAutocompleteElement) {
        resolve();
      } else {
        loadPromise = null;
        reject(
          new Error(
            "Google Maps loaded but PlaceAutocompleteElement is missing — check the API key has Places API (New) enabled in GCP"
          )
        );
      }
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function useGoogleMaps(): GoogleMapsStatus {
  const { data: apiKey } = useQuery({
    queryKey: queryKeys.mapsKey(),
    queryFn: () => getMapsKey(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [status, setStatus] = useState<GoogleMapsStatus>(() => {
    if (typeof window !== "undefined" && window.google?.maps?.places) {
      return "ready";
    }
    return "idle";
  });

  useEffect(() => {
    if (!apiKey || status === "ready" || status === "loading") {
      return;
    }
    setStatus("loading");
    loadScript(apiKey)
      .then(() => setStatus("ready"))
      .catch(() => setStatus("error"));
  }, [apiKey, status]);

  return status;
}
