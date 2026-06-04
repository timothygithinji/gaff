/**
 * `MapView` — the interactive "Where it sits" map, rendered with the
 * Google Maps JS SDK (not the Embed iframe) so we can style it and draw
 * routes onto it.
 *
 *   - LIGHT mode : a clean style with the icon clutter dialled down.
 *   - DARK mode  : a navy "midnight" style derived from the maritime
 *                  palette, swapped live via `map.setOptions({ styles })`
 *                  when the theme flips (no remount, no flash).
 *
 * Plots the property marker plus a marker for every nearby public-
 * transport stop (`points`). The parent owns the selection set; for each
 * selected stop we compute a WALK + TRANSIT route on-demand (client-side
 * Directions), draw the walking path as a coloured polyline, and report
 * the computed minutes back up via `onRouteComputed` so the chip can
 * label itself. Routes are cached, so re-selecting a stop is instant.
 *
 * The shared `useGoogleMaps` hook owns script loading + the API key. We
 * keep a deliberately small local typing for the handful of `google.maps`
 * classes we touch — the full `@types/google.maps` is ~10MB we don't
 * otherwise need.
 */
import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "../../hooks/use-google-maps";

type LatLng = { lat: number; lng: number };

export type TransitKind = "tube" | "rail" | "tram" | "bus";

export type PlaceCategory =
  | "transport"
  | "park"
  | "shop"
  | "gp"
  | "restaurant";

export type TransitPoint = {
  /** Stable id (we key on name+coords upstream). */
  id: string;
  name: string;
  category: PlaceCategory;
  kind?: TransitKind | null;
  /** TfL modes serving a station (for line roundels), when known. */
  modes?: string[];
  /**
   * Per-place marker + route colour, so each place is individually
   * tellable apart on the map (and matches its chip dot). Falls back to
   * the category colour when absent.
   */
  color?: string;
  /**
   * Coordinates, when known (the Places sweep). Absent for the
   * Rightmove-station fallback, which has only a name — there we route to
   * `query` instead and skip the map marker.
   */
  lat?: number;
  lng?: number;
  /** Geocodable destination used when coords are absent (e.g. a station name). */
  query?: string;
  distanceMiles?: number | null;
};

/** A stop's route destination: its coordinates, or a geocodable string. */
function pointDestination(p: TransitPoint): LatLng | string | null {
  if (typeof p.lat === "number" && typeof p.lng === "number") {
    return { lat: p.lat, lng: p.lng };
  }
  return p.query ?? null;
}

export type RouteTimes = {
  walkMinutes: number | null;
  transitMinutes: number | null;
};

/** Polyline + marker accent per place category (maritime palette). */
const CATEGORY_COLOR: Record<PlaceCategory, string> = {
  transport: "#1f4e79",
  park: "#2e7d52",
  shop: "#b07a2c",
  gp: "#b3453a",
  restaurant: "#d77a4a",
};

interface GMapsMap {
  setOptions(opts: Record<string, unknown>): void;
}
interface GMapsMarker {
  setMap(map: GMapsMap | null): void;
  addListener(event: string, handler: () => void): void;
  setIcon(icon: unknown): void;
}
interface GMapsDirectionsRenderer {
  setMap(map: GMapsMap | null): void;
  setDirections(result: unknown): void;
}
interface GMapsDirectionsService {
  route(
    request: Record<string, unknown>,
    callback: (result: unknown, status: string) => void
  ): void;
}
interface GMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMapsMap;
  Marker: new (opts: Record<string, unknown>) => GMapsMarker;
  DirectionsService: new () => GMapsDirectionsService;
  DirectionsRenderer: new (
    opts: Record<string, unknown>
  ) => GMapsDirectionsRenderer;
  TravelMode?: { WALKING: unknown; TRANSIT: unknown };
  SymbolPath?: { CIRCLE: unknown };
}

function getMapsApi(): GMapsApi | null {
  const g = (window as unknown as { google?: { maps?: unknown } }).google;
  return (g?.maps as GMapsApi | undefined) ?? null;
}

/** Tracks whether the `.dark` class is on <html> (works for system + manual,
 * since the theme provider toggles that class). */
function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Sum the legs of a Directions result into whole minutes, or null. */
function legMinutes(result: unknown): number | null {
  const routes = (result as { routes?: unknown[] } | null)?.routes;
  const legs = (routes?.[0] as { legs?: unknown[] } | undefined)?.legs;
  if (!Array.isArray(legs) || legs.length === 0) {
    return null;
  }
  let seconds = 0;
  for (const leg of legs) {
    const v = (leg as { duration?: { value?: number } }).duration?.value;
    if (typeof v === "number") {
      seconds += v;
    }
  }
  return seconds > 0 ? Math.round(seconds / 60) : null;
}

type Props = {
  lat: number;
  lng: number;
  title: string;
  /** Nearby transit stops to plot as markers. */
  points?: TransitPoint[];
  /** Ids of the stops whose route should be drawn. */
  selectedIds?: string[];
  /** Reports computed walk/transit minutes for a stop after first select. */
  onRouteComputed?: (id: string, times: RouteTimes) => void;
  /** Marker click → toggle selection in the parent. */
  onTogglePoint?: (id: string) => void;
};

export function MapView({
  lat,
  lng,
  title,
  points,
  selectedIds,
  onRouteComputed,
  onTogglePoint,
}: Props) {
  const status = useGoogleMaps();
  const isDark = useIsDarkTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMapsMap | null>(null);
  const propertyMarkerRef = useRef<GMapsMarker | null>(null);
  const serviceRef = useRef<GMapsDirectionsService | null>(null);
  /** id → the stop's marker. */
  const pointMarkersRef = useRef<Map<string, GMapsMarker>>(new Map());
  /** id → the drawn walking-route renderer (present only while selected). */
  const renderersRef = useRef<Map<string, GMapsDirectionsRenderer>>(new Map());
  /** id → already-computed times, so re-selecting doesn't refetch. */
  const routeCacheRef = useRef<Map<string, RouteTimes>>(new Map());

  // Keep the latest callbacks in refs so the marker-click closures created
  // once at marker-build time always call through to the current props.
  const onToggleRef = useRef(onTogglePoint);
  const onRouteComputedRef = useRef(onRouteComputed);
  useEffect(() => {
    onToggleRef.current = onTogglePoint;
    onRouteComputedRef.current = onRouteComputed;
  }, [onTogglePoint, onRouteComputed]);

  // Build the map once the SDK is ready. Guarded by `mapRef.current` so the
  // listed deps can change without rebuilding it.
  useEffect(() => {
    if (status !== "ready" || !containerRef.current || mapRef.current) {
      return;
    }
    const api = getMapsApi();
    if (!api) {
      return;
    }
    const center: LatLng = { lat, lng };
    const map = new api.Map(containerRef.current, {
      center,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      keyboardShortcuts: false,
      gestureHandling: "cooperative",
      styles: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
    });
    mapRef.current = map;
    serviceRef.current = new api.DirectionsService();
    propertyMarkerRef.current = new api.Marker({
      position: center,
      map,
      title,
      zIndex: 1000,
    });
  }, [status, lat, lng, title, isDark]);

  // Sync the stop markers to `points`. Rebuilds when the set changes
  // (stable per listing in practice). Each marker toggles selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the points signature; map identity is stable.
  useEffect(() => {
    const api = getMapsApi();
    const map = mapRef.current;
    if (!api || !map) {
      return;
    }
    for (const marker of pointMarkersRef.current.values()) {
      marker.setMap(null);
    }
    pointMarkersRef.current.clear();
    for (const p of points ?? []) {
      // Name-only fallback stops have no coords — they still route (by
      // geocoded name) but can't get a marker.
      if (typeof p.lat !== "number" || typeof p.lng !== "number") {
        continue;
      }
      const marker = new api.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: p.name,
        icon: markerIcon(api, p.color ?? CATEGORY_COLOR[p.category], false),
      });
      marker.addListener("click", () => onToggleRef.current?.(p.id));
      pointMarkersRef.current.set(p.id, marker);
    }
  }, [status, points]);

  // Sync drawn routes to `selectedIds`: draw newly-selected, erase
  // newly-deselected, recolour markers. The diff/draw work lives in two
  // module-level helpers to keep this effect flat.
  useEffect(() => {
    const api = getMapsApi();
    const map = mapRef.current;
    if (!api || !map) {
      return;
    }
    const selected = new Set(selectedIds ?? []);
    const pointById = new Map((points ?? []).map((p) => [p.id, p]));
    const layers: SelectionLayers = {
      renderers: renderersRef.current,
      markers: pointMarkersRef.current,
      cache: routeCacheRef.current,
    };
    eraseUnselectedRoutes(api, selected, pointById, layers);
    drawSelectedRoutes(
      api,
      map,
      serviceRef.current,
      { lat, lng },
      selected,
      pointById,
      layers,
      onRouteComputedRef.current
    );
  }, [selectedIds, points, lat, lng]);

  // Live theme swap — restyle the existing map rather than rebuilding it.
  useEffect(() => {
    mapRef.current?.setOptions({
      styles: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
    });
  }, [isDark]);

  // Tidy up on unmount.
  useEffect(() => {
    const pointMarkers = pointMarkersRef.current;
    const renderers = renderersRef.current;
    return () => {
      propertyMarkerRef.current?.setMap(null);
      for (const m of pointMarkers.values()) {
        m.setMap(null);
      }
      for (const r of renderers.values()) {
        r.setMap(null);
      }
      pointMarkers.clear();
      renderers.clear();
      propertyMarkerRef.current = null;
      serviceRef.current = null;
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" ref={containerRef} />
      {status !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-slate-2">
          {status === "error" ? "Map unavailable" : "Loading map…"}
        </div>
      ) : null}
    </div>
  );
}

/** The mutable per-stop map layers the selection effect drives. */
type SelectionLayers = {
  renderers: Map<string, GMapsDirectionsRenderer>;
  markers: Map<string, GMapsMarker>;
  cache: Map<string, RouteTimes>;
};

/** Erase routes for stops no longer selected and reset their markers. */
function eraseUnselectedRoutes(
  api: GMapsApi,
  selected: Set<string>,
  pointById: Map<string, TransitPoint>,
  layers: SelectionLayers
) {
  for (const [id, renderer] of layers.renderers) {
    if (selected.has(id)) {
      continue;
    }
    renderer.setMap(null);
    layers.renderers.delete(id);
    const p = pointById.get(id);
    const marker = layers.markers.get(id);
    if (p && marker) {
      marker.setIcon(markerIcon(api, p.color ?? CATEGORY_COLOR[p.category], false));
    }
  }
}

/** Highlight + draw the walking route for each selected stop (once). */
function drawSelectedRoutes(
  api: GMapsApi,
  map: GMapsMap,
  service: GMapsDirectionsService | null,
  origin: LatLng,
  selected: Set<string>,
  pointById: Map<string, TransitPoint>,
  layers: SelectionLayers,
  onComputed?: (id: string, times: RouteTimes) => void
) {
  for (const id of selected) {
    const p = pointById.get(id);
    if (!p) {
      continue;
    }
    layers.markers.get(id)?.setIcon(markerIcon(api, p.color ?? CATEGORY_COLOR[p.category], true));
    if (layers.renderers.has(id) || !service) {
      continue;
    }
    drawWalkingRoute(api, map, service, origin, p, (renderer) => {
      layers.renderers.set(id, renderer);
    });
    computeTimes(service, origin, p, (times) => {
      if (!layers.cache.has(id)) {
        layers.cache.set(id, times);
      }
      onComputed?.(id, times);
    });
  }
}

/** A filled-circle marker symbol, larger + ringed when selected. */
function markerIcon(
  api: GMapsApi,
  color: string,
  selected: boolean
): Record<string, unknown> {
  return {
    path: api.SymbolPath?.CIRCLE ?? 0,
    scale: selected ? 7 : 5,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: selected ? 2.5 : 1.5,
  };
}

/** Draw the walking path from the property to a stop as a coloured line. */
function drawWalkingRoute(
  api: GMapsApi,
  map: GMapsMap,
  service: GMapsDirectionsService,
  origin: LatLng,
  point: TransitPoint,
  onRenderer: (renderer: GMapsDirectionsRenderer) => void
) {
  const destination = pointDestination(point);
  if (!destination) {
    return;
  }
  const renderer = new api.DirectionsRenderer({
    map,
    suppressMarkers: true,
    preserveViewport: true,
    polylineOptions: {
      strokeColor: point.color ?? CATEGORY_COLOR[point.category],
      strokeWeight: 4,
      strokeOpacity: 0.9,
    },
  });
  service.route(
    {
      origin,
      destination,
      travelMode: api.TravelMode?.WALKING ?? "WALKING",
    },
    (result, routeStatus) => {
      if (routeStatus === "OK" && result) {
        renderer.setDirections(result);
        onRenderer(renderer);
      } else {
        renderer.setMap(null);
      }
    }
  );
}

/** Compute walk + transit minutes to a stop for the chip label. */
function computeTimes(
  service: GMapsDirectionsService,
  origin: LatLng,
  point: TransitPoint,
  done: (times: RouteTimes) => void
) {
  const api = getMapsApi();
  const dest = pointDestination(point);
  if (!dest) {
    done({ walkMinutes: null, transitMinutes: null });
    return;
  }
  let walk: number | null = null;
  let transit: number | null = null;
  let pending = 2;
  const settle = () => {
    pending -= 1;
    if (pending === 0) {
      done({ walkMinutes: walk, transitMinutes: transit });
    }
  };
  service.route(
    { origin, destination: dest, travelMode: api?.TravelMode?.WALKING ?? "WALKING" },
    (result, s) => {
      if (s === "OK") {
        walk = legMinutes(result);
      }
      settle();
    }
  );
  service.route(
    {
      origin,
      destination: dest,
      travelMode: api?.TravelMode?.TRANSIT ?? "TRANSIT",
    },
    (result, s) => {
      if (s === "OK") {
        transit = legMinutes(result);
      }
      settle();
    }
  );
}

/* ---------------- Map styles ---------------- */

// Light: default Google map with the busiest icon/label clutter removed.
const MAP_STYLE_LIGHT = [
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

// Dark: navy "midnight" derived from the maritime palette (navy land, near-
// black water, slate roads), so the map sits inside the dark scene cleanly.
const MAP_STYLE_DARK = [
  { elementType: "geometry", stylers: [{ color: "#0e2235" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a97a0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a151d" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#1f3a5f" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#16293a" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#5a7596" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#16352a" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1f3a5f" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0a151d" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#2a4a73" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#1f3a5f" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0a151d" }],
  },
];
