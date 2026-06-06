/**
 * Pure commute/transport-target matching for the review queue — extracted
 * from the server function so it's unit-testable without pulling in the DB,
 * auth, or Trigger SDK. `filterCandidatesByTargets` in review.ts loads the
 * data; everything here is a pure function of (search, enrichment).
 */
import type { searches } from "../../db/schema";

/**
 * Approximate minutes-per-mile by travel mode, used to turn a transport
 * target's `maxMinutes` into a reachable straight-line distance. Used only
 * as the bus/tram fallback — stations are judged on real routed times.
 */
const MIN_PER_MILE: Record<string, number> = {
  walk: 20,
  cycle: 5,
  transit: 6,
  drive: 4,
};

/** Map a transport target's amenity onto a `nearbyTransit` kind. */
export const AMENITY_KIND: Record<string, "tube" | "rail" | "tram" | "bus"> = {
  tube_station: "tube",
  train_station: "rail",
  bus_stop: "bus",
  tram_stop: "tram",
};

/** Station kinds judged on Google walk times rather than the heuristic. */
const STATION_KINDS = new Set(["tube", "rail"]);

export type ClusterTargetEnrichment = {
  commuteMinutes: Record<string, number> | null;
  /**
   * Google Routes walk/transit minutes to the nearest few real stations
   * (Rightmove-sourced — undefined for Zoopla/OpenRent). Authoritative for
   * the station-time filter; preferred over `nearbyTransit`, whose `kind`
   * tagging has historically mislabelled bus stops as rail.
   */
  stationRoutes: Array<{ walkMinutes: number | null }> | null;
  nearbyTransit: Array<{
    kind: string | null;
    distanceMiles: number;
    /** Real routed walk minutes (Google), when computed for this stop. */
    walkMinutes?: number | null;
  }> | null;
};

export type ActiveSearch = typeof searches.$inferSelect;

/**
 * Smallest reachable minutes to a `nearbyTransit` stop of `kind` — the real
 * routed walk time (`walkMinutes`, Google) when present, else the
 * straight-line {@link MIN_PER_MILE} heuristic. `Infinity` when the cluster
 * carries no stop of that kind.
 */
function bestStopMinutes(
  stops: NonNullable<ClusterTargetEnrichment["nearbyTransit"]>,
  kind: string,
  mode: string
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const s of stops) {
    if (s.kind !== kind) {
      continue;
    }
    const minutes =
      typeof s.walkMinutes === "number"
        ? s.walkMinutes
        : s.distanceMiles * (MIN_PER_MILE[mode] ?? 20);
    if (minutes < best) {
      best = minutes;
    }
  }
  return best;
}

/**
 * Shortest real Google-routed WALK time across a cluster's `stationRoutes`,
 * or null when none carry a walk time (pending / non-Rightmove). Walk only —
 * a "within 15 min walk" target must not be satisfied by a transit time.
 */
function bestStationWalkMinutes(
  stationRoutes: ClusterTargetEnrichment["stationRoutes"] | undefined
): number | null {
  if (!Array.isArray(stationRoutes) || stationRoutes.length === 0) {
    return null;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const s of stationRoutes) {
    if (typeof s.walkMinutes === "number" && s.walkMinutes < best) {
      best = s.walkMinutes;
    }
  }
  return Number.isFinite(best) ? best : null;
}

/**
 * Shortest REAL routed walk time to a `nearbyTransit` stop of `kind`
 * (tube/rail) — the portal-agnostic fallback when `stationRoutes` is absent
 * (Zoopla/OpenRent). Counts only stops carrying a Google-routed
 * `walkMinutes`; the straight-line distance heuristic is deliberately
 * ignored for stations, since on a mislabelled 0.03mi "rail" it reads
 * seconds away and was the original leak. Null when no routed stop exists.
 */
function bestRoutedStationWalk(
  stops: ClusterTargetEnrichment["nearbyTransit"] | undefined,
  kind: string
): number | null {
  if (!Array.isArray(stops)) {
    return null;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const s of stops) {
    if (
      s.kind === kind &&
      typeof s.walkMinutes === "number" &&
      s.walkMinutes < best
    ) {
      best = s.walkMinutes;
    }
  }
  return Number.isFinite(best) ? best : null;
}

/** True when a search carries any commute/transport criteria to filter on. */
export function searchHasTargets(s: ActiveSearch): boolean {
  return (
    (Array.isArray(s.commuteTargets) && s.commuteTargets.length > 0) ||
    (Array.isArray(s.transportTargets) && s.transportTargets.length > 0)
  );
}

/**
 * Transport targets are OR-ed: the cluster passes if it's within reach of
 * AT LEAST ONE requested stop kind (e.g. "tube OR train"). Station kinds
 * (tube/rail) are judged on Google Routes walk time from `stationRoutes` —
 * the same source the review card shows — falling back to a `nearbyTransit`
 * stop's real routed walk time of that kind, but NEVER the straight-line
 * heuristic (on a mislabelled 0.03mi "rail" it reads seconds away, which is
 * exactly what leaked listings in). Bus/tram keep the heuristic (they're
 * never routed).
 *
 * PRODUCT DECISION (hold until routed): a cluster passes ONLY when we have
 * positive evidence it meets at least one transport target — a real routed
 * walk time within the limit (station) or a heuristic hit (bus/tram). A
 * cluster whose station walk-times haven't been computed yet is HELD BACK
 * (dropped from the queue) rather than admitted as "pending". In an active
 * hunt, surfacing a candidate we can't yet confirm matches the walk
 * requirement is worse than waiting for enrichment — the user explicitly
 * chose strict matching here. The cost is that a cluster which never enriches
 * (no coords, station out of `nearbyTransit` range, etc.) stays hidden, and
 * matches appear only once `enrich-station-routes` / `enrich-nearby-transit`
 * land. (Earlier this returned true for un-evaluable targets, which leaked
 * in clusters like a 16-min-walk tube against a 15-min limit during the
 * enrichment window.)
 */
function clusterPassesTransport(
  search: ActiveSearch,
  enr: ClusterTargetEnrichment | undefined
): boolean {
  const transportTargets = (search.transportTargets ?? []).filter(
    (t) => Boolean(AMENITY_KIND[t.amenity]) && typeof t.maxMinutes === "number"
  );
  if (transportTargets.length === 0) {
    return true;
  }
  const stationWalk = bestStationWalkMinutes(enr?.stationRoutes);
  const stops = enr?.nearbyTransit;
  for (const t of transportTargets) {
    const kind = AMENITY_KIND[t.amenity];
    const max = t.maxMinutes as number;
    if (!kind) {
      continue;
    }
    let reach: number | null;
    if (STATION_KINDS.has(kind)) {
      reach = stationWalk ?? bestRoutedStationWalk(stops, kind);
    } else {
      reach = stops ? bestStopMinutes(stops, kind, t.mode) : null;
    }
    if (reach !== null && reach <= max) {
      return true;
    }
  }
  return false;
}

/**
 * Does a cluster satisfy one search's commute + transport criteria?
 *
 *   - Commute: every target whose Google-Routes time is known must be
 *     within `maxMinutes`. A target with no computed time yet passes
 *     (enrichment pending — we don't drop a place for not yet being
 *     measured), mirroring the null-edge convention elsewhere.
 *   - Transport: see {@link clusterPassesTransport}.
 */
export function clusterPassesSearch(
  search: ActiveSearch,
  enr: ClusterTargetEnrichment | undefined
): boolean {
  for (const t of search.commuteTargets ?? []) {
    const max = typeof t.maxMinutes === "number" ? t.maxMinutes : null;
    if (max === null) {
      continue;
    }
    const minutes = enr?.commuteMinutes?.[t.label];
    if (typeof minutes === "number" && minutes > max) {
      return false;
    }
  }
  return clusterPassesTransport(search, enr);
}
