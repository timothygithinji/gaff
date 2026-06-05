/**
 * Per-cluster station-routes enrichment.
 *
 * Computes realistic walking and public-transit travel times from the
 * cluster's location to each of its nearest stations — what the user
 * actually wants on the map ("How long is it really, on foot or by
 * bus, to Bounds Green?"). The review-card heuristic ("distance × 20
 * = minutes") is straight-line and over-optimistic in dense areas;
 * this replaces it with Google Routes WALK + TRANSIT.
 *
 * Fan-out: `clusterTask.onSuccess` triggers one run per newly-created
 * cluster (mirroring `enrich-commute`). Per cluster:
 *
 *   1. Load lat/lng + the listings under it.
 *   2. Read the first listing's `rawJson.nearestStations[]` (only
 *      Rightmove populates this — Zoopla / OpenRent listings simply
 *      enrich with `undefined`). Keep the closest N by `distanceMiles`
 *      so we don't burn budget on stations the renter would never use.
 *   3. For each station, call Google Routes v2 twice — once for WALK
 *      (no time anchor needed), once for TRANSIT with a fixed 09:00
 *      London-weekday arrival so results are comparable across runs.
 *   4. Persist as `enrichments.station_routes`, an ordered array of
 *      `{ name, walkMinutes, transitMinutes }` (same order as the
 *      stations were ranked by distance).
 *
 * Each station is routed to by NAME (e.g. "Bounds Green Station, London") —
 * Rightmove's `nearestStations` carry no coordinates, and the Routes API
 * geocodes an address waypoint in-request, so no separate Geocoding call is
 * needed. The cluster's own lat/lng anchors the origin.
 *
 * No-ops gracefully when the cluster lacks lat/lng, has no listings, or none
 * of its listings carry any `nearestStations`. A station whose Routes lookup
 * fails for both modes is dropped — the section just shows the survivors.
 */

import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { mapsServerKey, mapsServerReferer } from "../lib/env";
import {
  type LatLng,
  type Waypoint,
  computeRoute,
  nextWeekdayAt,
} from "../lib/google-routes";
import { upsertEnrichmentForListings } from "./enrich-helpers";
import { enrichQueue } from "./queues";

export type EnrichStationRoutesPayload = {
  clusterId: string;
};

export type EnrichStationRoutesOutput = {
  clusterId: string;
  stationsComputed: number;
  listingsTouched: number;
};

type StationRoute = {
  name: string;
  walkMinutes: number | null;
  transitMinutes: number | null;
};

/**
 * The closest N stations we'll compute routes for. Rightmove typically
 * exposes 3–5 in the listing JSON; capping at 3 keeps the Google Routes
 * call budget bounded (worst case 3 stations × 2 modes = 6 calls per
 * cluster) while still giving the UI a primary + two alternatives.
 */
const MAX_STATIONS = 3;

type StationCandidate = {
  name: string;
  distanceMiles: number;
};

const STATION_NAME_RE = /\bstation\b/i;

/**
 * Turn a station name into a geocodable address for a Routes waypoint. The
 * Routes API geocodes the address in-request (no separate Geocoding call), so
 * we don't need the station's coordinates — which Rightmove's `nearestStations`
 * never carry (only `name` / `types` / `distance`).
 */
function stationAddressQuery(name: string): string {
  const withKind = STATION_NAME_RE.test(name) ? name : `${name} Station`;
  return `${withKind}, London`;
}

/**
 * Pull the closest stations out of a listing's parsed `rawJson`. The portal
 * parser is the source of truth on shape — see `src/lib/parsers/types.ts`.
 * Rightmove (the only portal that populates this) gives `name` + `distance`
 * but NO coordinates, so we route to each station by name/address rather than
 * requiring a lat/lng. Kept closest-first, capped at {@link MAX_STATIONS}.
 */
function readStationCandidates(rawJson: unknown): StationCandidate[] {
  if (!rawJson || typeof rawJson !== "object") {
    return [];
  }
  const stations = (rawJson as { nearestStations?: unknown }).nearestStations;
  if (!Array.isArray(stations)) {
    return [];
  }
  const out: StationCandidate[] = [];
  for (const entry of stations) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const s = entry as Record<string, unknown>;
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!name) {
      continue;
    }
    const distanceMiles =
      readNumber(s.distanceMiles) ?? Number.POSITIVE_INFINITY;
    out.push({ name, distanceMiles });
  }
  out.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return out.slice(0, MAX_STATIONS);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function parseNumeric(value: string | null): number | null {
  if (value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type StationContext = {
  origin: LatLng;
  listingIds: string[];
  stations: StationCandidate[];
};

async function loadStationContext(
  db: ReturnType<typeof getDb>,
  clusterId: string,
  logSkip: (reason: string, extra?: Record<string, unknown>) => void
): Promise<StationContext | null> {
  const cluster = await db.query.propertyClusters.findFirst({
    where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
  });
  if (!cluster) {
    throw new Error(`enrich-station-routes: cluster ${clusterId} not found`);
  }
  const lat = parseNumeric(cluster.lat);
  const lng = parseNumeric(cluster.lng);
  if (lat === null || lng === null) {
    logSkip("cluster has no lat/lng");
    return null;
  }

  const listings = await db
    .select({ id: schema.listings.id, rawJson: schema.listings.rawJson })
    .from(schema.listings)
    .where(eq(schema.listings.clusterId, clusterId));
  if (listings.length === 0) {
    logSkip("cluster has no listings");
    return null;
  }

  // Take stations from the first listing that has any. Different
  // portals scraped at different times sometimes disagree on which
  // stations are "nearest"; the first wins and the rest piggyback on
  // its enrichment row.
  let stations: StationCandidate[] = [];
  for (const l of listings) {
    const candidates = readStationCandidates(l.rawJson);
    if (candidates.length > 0) {
      stations = candidates;
      break;
    }
  }
  if (stations.length === 0) {
    logSkip("cluster has no listings with usable nearestStations");
    return null;
  }

  return {
    origin: { lat, lng },
    listingIds: listings.map((l) => l.id),
    stations,
  };
}

export const enrichStationRoutesTask = task({
  id: "enrich-station-routes",
  queue: enrichQueue,
  maxDuration: 120,

  run: async (
    payload: EnrichStationRoutesPayload
  ): Promise<EnrichStationRoutesOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const GOOGLE_MAPS_API_KEY = mapsServerKey();
    const empty = { clusterId, stationsComputed: 0, listingsTouched: 0 };

    const ctx = await loadStationContext(db, clusterId, (reason, extra) => {
      logger.warn(`enrich-station-routes: ${reason}, skipping`, {
        clusterId,
        ...(extra ?? {}),
      });
    });
    if (!ctx) {
      return empty;
    }

    const transitArrival = nextWeekdayAt(9, Date.now());

    const routes: StationRoute[] = [];
    for (const station of ctx.stations) {
      const dest: Waypoint = { address: stationAddressQuery(station.name) };
      const [walkMinutes, transitMinutes] = await Promise.all([
        runMode(GOOGLE_MAPS_API_KEY, ctx.origin, dest, "WALK", null, station.name, clusterId),
        runMode(GOOGLE_MAPS_API_KEY, ctx.origin, dest, "TRANSIT", transitArrival, station.name, clusterId),
      ]);
      if (walkMinutes === null && transitMinutes === null) {
        // Both lookups failed — surfacing a station with no times is
        // worse than dropping it. The UI just shows the survivors.
        continue;
      }
      routes.push({ name: station.name, walkMinutes, transitMinutes });
    }

    if (routes.length === 0) {
      // Stations existed to compute (ctx.stations was non-empty) yet every
      // Routes call returned nothing — that's an upstream failure (auth,
      // quota, outage), not a property with no reachable stations. Throw
      // so the run fails visibly and Trigger retries, rather than stamping
      // an empty result and reporting success. A referrer-restricted
      // GOOGLE_MAPS_API_KEY used server-side 403s every call this way.
      throw new Error(
        `enrich-station-routes: all ${ctx.stations.length} station route lookups failed for cluster ${clusterId} (likely a Google Routes API auth/quota error)`
      );
    }

    const touched = await upsertEnrichmentForListings(db, ctx.listingIds, {
      stationRoutes: routes,
    });

    logger.log("enrich-station-routes: done", {
      clusterId,
      stations: routes.map((r) => r.name),
      listingsTouched: touched,
    });

    return {
      clusterId,
      stationsComputed: routes.length,
      listingsTouched: touched,
    };
  },
});

/**
 * One Routes call. Returns `null` (not throws) when the call fails so
 * one bad station / one bad mode doesn't sink the rest of the cluster.
 */
async function runMode(
  apiKey: string,
  origin: LatLng,
  destination: Waypoint,
  mode: "WALK" | "TRANSIT",
  arrivalTime: Date | null,
  stationName: string,
  clusterId: string
): Promise<number | null> {
  try {
    const result = await computeRoute({
      apiKey,
      origin,
      destination,
      travelMode: mode,
      referer: mapsServerReferer(),
      ...(arrivalTime ? { arrivalTime } : {}),
    });
    return Math.round(result.durationSeconds / 60);
  } catch (err) {
    logger.warn("enrich-station-routes: route call failed", {
      clusterId,
      stationName,
      mode,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
