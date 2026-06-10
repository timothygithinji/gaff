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
import { useCallback, useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "../../hooks/use-google-maps";
import {
  fetchLineGeometry,
  lineColor,
  tflLineId,
} from "../../lib/tfl-line-routes";

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
  /** Lines / routes serving the stop (tube/operator names, bus numbers). */
  lines?: string[];
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

const KIND_LABEL: Record<TransitKind, string> = {
  tube: "Tube station",
  rail: "Rail station",
  tram: "Tram stop",
  bus: "Bus stop",
};

const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  transport: "Transport",
  park: "Park",
  shop: "Shop",
  gp: "GP surgery",
  restaurant: "Restaurant",
};

/** What a hovered marker reveals: its name + a one-line "what it is". */
type HoverTip = { name: string; detail: string | null; color: string; x: number; y: number };

/** Build the hover-tooltip text for a stop ("Tube station · Piccadilly · 0.3 mi"). */
function pointTooltip(p: TransitPoint): { name: string; detail: string | null } {
  const bits: string[] = [];
  bits.push(p.kind ? KIND_LABEL[p.kind] : CATEGORY_LABEL[p.category]);
  if (p.lines?.length) {
    bits.push(p.lines.slice(0, 3).join(", "));
  }
  if (typeof p.distanceMiles === "number") {
    bits.push(`${p.distanceMiles.toFixed(1)} mi`);
  }
  return { name: p.name, detail: bits.length ? bits.join(" · ") : null };
}

interface GMapsMap {
  setOptions(opts: Record<string, unknown>): void;
  setCenter(latLng: LatLng): void;
}
/** The subset of a google.maps mouse event we read (cursor position). */
type GMapsMouseEvent = { domEvent?: MouseEvent };
interface GMapsMarker {
  setMap(map: GMapsMap | null): void;
  addListener(event: string, handler: (e?: GMapsMouseEvent) => void): void;
  setIcon(icon: unknown): void;
  setPosition(latLng: LatLng): void;
}
interface GMapsDirectionsRenderer {
  setMap(map: GMapsMap | null): void;
  setDirections(result: unknown): void;
}
interface GMapsPolyline {
  setMap(map: GMapsMap | null): void;
  addListener(event: string, handler: (e?: GMapsMouseEvent) => void): void;
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
  Polyline: new (opts: Record<string, unknown>) => GMapsPolyline;
  TravelMode?: { WALKING: unknown; TRANSIT: unknown };
  SymbolPath?: { CIRCLE: unknown };
  Point?: new (x: number, y: number) => unknown;
  Size?: new (w: number, h: number) => unknown;
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
  /** The marker currently under the cursor, positioned for its tooltip. */
  const [hover, setHover] = useState<HoverTip | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMapsMap | null>(null);
  const propertyMarkerRef = useRef<GMapsMarker | null>(null);
  const serviceRef = useRef<GMapsDirectionsService | null>(null);
  /** id → the stop's marker. */
  const pointMarkersRef = useRef<Map<string, GMapsMarker>>(new Map());
  /** id → the drawn walking-route renderer (present only while selected). */
  const renderersRef = useRef<Map<string, GMapsDirectionsRenderer>>(new Map());
  /** stopId → its drawn transit-line polylines (present only while selected). */
  const lineRoutesRef = useRef<Map<string, GMapsPolyline[]>>(new Map());
  /** id → already-computed times, so re-selecting doesn't refetch. */
  const routeCacheRef = useRef<Map<string, RouteTimes>>(new Map());

  // Keep the latest callbacks in refs so the marker-click closures created
  // once at marker-build time always call through to the current props.
  const onToggleRef = useRef(onTogglePoint);
  const onRouteComputedRef = useRef(onRouteComputed);
  // The property marker's hover closure is built once but `title` can change
  // (the review page reuses one map across listings), so read it via a ref.
  const titleRef = useRef(title);
  useEffect(() => {
    onToggleRef.current = onTogglePoint;
    onRouteComputedRef.current = onRouteComputed;
    titleRef.current = title;
  }, [onTogglePoint, onRouteComputed, title]);

  // Reveal which line a hovered route polyline is. Stable identity so the
  // selection effect can pass it straight through without re-running.
  const showLineTip = useCallback(
    (
      info: { name: string; detail: string; color: string } | null,
      e?: GMapsMouseEvent
    ) => {
      if (!info) {
        setHover(null);
        return;
      }
      const dom = e?.domEvent;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!dom || !rect) {
        return;
      }
      setHover({
        name: info.name,
        detail: info.detail,
        color: info.color,
        x: dom.clientX - rect.left,
        y: dom.clientY - rect.top,
      });
    },
    []
  );

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
      icon: propertyPinIcon(api),
      zIndex: 1000,
    });
    const showPropertyTip = (e?: GMapsMouseEvent) => {
      const dom = e?.domEvent;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!dom || !rect) {
        return;
      }
      setHover({
        name: titleRef.current,
        detail: "This property",
        color: "#0e2235",
        x: dom.clientX - rect.left,
        y: dom.clientY - rect.top,
      });
    };
    propertyMarkerRef.current.addListener("mouseover", showPropertyTip);
    propertyMarkerRef.current.addListener("mousemove", showPropertyTip);
    propertyMarkerRef.current.addListener("mouseout", () => setHover(null));
  }, [status, lat, lng, isDark]);

  // Recenter + move the property pin when the coordinates change without a
  // remount — the review page reuses one `MapView` across properties, so the
  // build effect above (guarded by `mapRef.current`) won't fire again.
  useEffect(() => {
    const map = mapRef.current;
    const marker = propertyMarkerRef.current;
    if (!map || !marker) {
      return;
    }
    const center: LatLng = { lat, lng };
    map.setCenter(center);
    marker.setPosition(center);
  }, [lat, lng]);

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
    setHover(null);
    // Translate a marker mouse event into a tooltip anchored to the cursor,
    // relative to the map container (so the absolutely-positioned card lands
    // in the right place regardless of page scroll).
    const showTip = (p: TransitPoint, e?: GMapsMouseEvent) => {
      const dom = e?.domEvent;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!dom || !rect) {
        return;
      }
      const { name, detail } = pointTooltip(p);
      setHover({
        name,
        detail,
        color: p.color ?? CATEGORY_COLOR[p.category],
        x: dom.clientX - rect.left,
        y: dom.clientY - rect.top,
      });
    };
    for (const p of points ?? []) {
      // Name-only fallback stops have no coords — they still route (by
      // geocoded name) but can't get a marker.
      if (typeof p.lat !== "number" || typeof p.lng !== "number") {
        continue;
      }
      const marker = new api.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        // No native `title`: the hover card below replaces the slow,
        // unstyled browser tooltip.
        icon: markerIcon(api, p.color ?? CATEGORY_COLOR[p.category], false),
      });
      marker.addListener("click", () => onToggleRef.current?.(p.id));
      marker.addListener("mouseover", (e) => showTip(p, e));
      marker.addListener("mousemove", (e) => showTip(p, e));
      marker.addListener("mouseout", () => setHover(null));
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
      lineRoutes: lineRoutesRef.current,
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
      onRouteComputedRef.current,
      showLineTip
    );
  }, [selectedIds, points, lat, lng, showLineTip]);

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
    const lineRoutes = lineRoutesRef.current;
    return () => {
      propertyMarkerRef.current?.setMap(null);
      for (const m of pointMarkers.values()) {
        m.setMap(null);
      }
      for (const r of renderers.values()) {
        r.setMap(null);
      }
      for (const polylines of lineRoutes.values()) {
        for (const poly of polylines) {
          poly.setMap(null);
        }
      }
      pointMarkers.clear();
      renderers.clear();
      lineRoutes.clear();
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
      {hover ? <HoverCard tip={hover} dark={isDark} /> : null}
    </div>
  );
}

/**
 * The hover reveal — a small card floating just above the dot under the
 * cursor, naming the place and what it is. Inline-styled (light/dark) so it
 * stays self-contained and theme-correct; `pointer-events: none` keeps it
 * from stealing the hover it's reacting to.
 */
function HoverCard({ tip, dark }: { tip: HoverTip; dark: boolean }) {
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: tip.x,
        top: tip.y,
        transform: "translate(-50%, calc(-100% - 14px))",
      }}
    >
      <div
        style={{
          maxWidth: 220,
          padding: "6px 9px",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.35,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          background: dark ? "#13283a" : "#ffffff",
          color: dark ? "#e6edf3" : "#0e2235",
          border: `1px solid ${dark ? "#244258" : "#e1e7ec"}`,
          boxShadow: dark
            ? "0 6px 18px rgba(0,0,0,0.45)"
            : "0 6px 18px rgba(14,34,53,0.16)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              flexShrink: 0,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: tip.color,
            }}
          />
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
            {tip.name}
          </span>
        </div>
        {tip.detail ? (
          <div
            style={{
              marginTop: 2,
              paddingLeft: 14,
              color: dark ? "#9fb0bd" : "#6a7886",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tip.detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The mutable per-stop map layers the selection effect drives. */
type SelectionLayers = {
  renderers: Map<string, GMapsDirectionsRenderer>;
  /** stopId → its transit-line polylines (where its services run). */
  lineRoutes: Map<string, GMapsPolyline[]>;
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
  // Pull the transit-line polylines for any stop no longer selected. Deleting
  // the key also cancels any still-in-flight geometry fetch (it checks for it).
  for (const [id, polylines] of layers.lineRoutes) {
    if (selected.has(id)) {
      continue;
    }
    for (const poly of polylines) {
      poly.setMap(null);
    }
    layers.lineRoutes.delete(id);
  }
}

/** Reveal which line a hovered route is (passed through to the polylines). */
type LineHover = (
  info: { name: string; detail: string; color: string } | null,
  e?: GMapsMouseEvent
) => void;

/** How many lines off a single stop we'll draw — a busy bus stop can list a
 * dozen routes; past a handful the map turns to spaghetti. */
const MAX_LINES_PER_STOP = 8;

/** A stop's drawable lines (id + display name), deduped, capped. */
function pointLineIds(
  point: TransitPoint
): { id: string; name: string }[] {
  if (point.category !== "transport" || !point.lines?.length) {
    return [];
  }
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const name of point.lines.slice(0, MAX_LINES_PER_STOP)) {
    const id = tflLineId(name);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

/** Highlight + draw the walking route AND the transit lines for each selected
 * stop (once). */
function drawSelectedRoutes(
  api: GMapsApi,
  map: GMapsMap,
  service: GMapsDirectionsService | null,
  origin: LatLng,
  selected: Set<string>,
  pointById: Map<string, TransitPoint>,
  layers: SelectionLayers,
  onComputed?: (id: string, times: RouteTimes) => void,
  onLineHover?: LineHover
) {
  for (const id of selected) {
    const p = pointById.get(id);
    if (!p) {
      continue;
    }
    layers.markers.get(id)?.setIcon(markerIcon(api, p.color ?? CATEGORY_COLOR[p.category], true));
    // Where this stop's services actually run — drawn independently of the
    // walking-route Directions call (and not gated on `service`).
    if (!layers.lineRoutes.has(id)) {
      drawLineRoutes(api, map, id, p, layers, onLineHover);
    }
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

/** One coloured route polyline, wired for hover-to-identify. */
function buildLinePolyline(
  api: GMapsApi,
  map: GMapsMap,
  path: LatLng[],
  info: { name: string; detail: string; color: string },
  onLineHover?: LineHover
): GMapsPolyline {
  const poly = new api.Polyline({
    map,
    path,
    strokeColor: info.color,
    strokeOpacity: 0.85,
    strokeWeight: 5,
    zIndex: 40,
  });
  if (onLineHover) {
    poly.addListener("mouseover", (e) => onLineHover(info, e));
    poly.addListener("mousemove", (e) => onLineHover(info, e));
    poly.addListener("mouseout", () => onLineHover(null));
  }
  return poly;
}

/**
 * Draw the route geometry for each TfL line serving a stop, as coloured
 * polylines. The slot in `layers.lineRoutes` is reserved synchronously so a
 * deselection that arrives mid-fetch (which deletes the key) cancels the draw.
 */
function drawLineRoutes(
  api: GMapsApi,
  map: GMapsMap,
  stopId: string,
  point: TransitPoint,
  layers: SelectionLayers,
  onLineHover?: LineHover
) {
  const lines = pointLineIds(point);
  if (lines.length === 0) {
    return;
  }
  const isBus = point.kind === "bus";
  // Reserve the bucket up front — its presence is the "still selected" signal.
  layers.lineRoutes.set(stopId, []);
  for (const line of lines) {
    const info = {
      name: isBus ? `Bus ${line.name}` : line.name,
      detail: isBus ? "Bus route" : "Line",
      color: lineColor(line.id),
    };
    fetchLineGeometry(line.id).then((paths) => {
      const bucket = layers.lineRoutes.get(stopId);
      if (!bucket) {
        return; // deselected while the geometry was loading
      }
      for (const path of paths) {
        bucket.push(buildLinePolyline(api, map, path, info, onLineHover));
      }
    });
  }
}

/**
 * The property's own marker — a navy teardrop pin with a hollow centre, so
 * "home" is unmistakable against the small category dots. SVG path is a
 * Material-style place pin (24×24, tip at y≈23); anchored at the tip.
 */
function propertyPinIcon(api: GMapsApi): Record<string, unknown> {
  return {
    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 14 7 14s7-8.75 7-14c0-3.87-3.13-7-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z",
    fillColor: "#0e2235",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 1.6,
    scale: 1.7,
    anchor: api.Point ? new api.Point(12, 23) : undefined,
  };
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

// Light: a calm "nautical chart" derived from the maritime palette — softly
// tinted land, calm-blue water, sage parks, warm-sand highways — so the area
// reads as a *place* (green space, water, stations) rather than a bare road
// grid. We keep park + transit-station labels/icons (the context a renter
// actually wants) and silence only the commercial POI noise.
const MAP_STYLE_LIGHT = [
  { elementType: "geometry", stylers: [{ color: "#e9eef2" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#54657a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f4f7f9" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#cdd7df" }],
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7c8c9c" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#e4ebe2" }],
  },
  // Quiet the commercial POI clutter, but keep parks visible + named.
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#cfe0c9" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#5a7d63" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#dde4ea" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f6e7d2" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e7d3b6" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9a7b56" }],
  },
  // Keep transit lines + station marks — they're the whole point here.
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#516074" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#b7d3e3" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6d93a8" }],
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
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#16352a" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#5f8a6e" }],
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
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7d93ab" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0a151d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4f6b86" }],
  },
];
