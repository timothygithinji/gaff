/**
 * Minimal client for the Google Routes API v2.
 *
 * Endpoint: POST https://routes.googleapis.com/directions/v2:computeRoutes
 *
 * Used by `enrich-commute` to measure travel time from each property
 * cluster to every commute target the parent search has configured.
 *
 * Field mask: we ask only for `routes.duration` to keep the response
 * tight and the per-request cost in the cheapest billable tier.
 */

const ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const DURATION_SECONDS_RE = /^(\d+)s$/;

export type GoogleTravelMode =
  | "DRIVE"
  | "BICYCLE"
  | "WALK"
  | "TRANSIT"
  | "TWO_WHEELER";

export type LatLng = { lat: number; lng: number };

/**
 * A Routes v2 waypoint — either explicit coordinates or a geocodable address
 * string. The Routes API geocodes `address` waypoints as part of the route
 * request, so there's no separate Geocoding API call (or quota) to pay for.
 */
export type Waypoint = LatLng | { address: string };

export type ComputeRouteInput = {
  apiKey: string;
  origin: Waypoint;
  destination: Waypoint;
  travelMode: GoogleTravelMode;
  /**
   * Targeted arrival time. The Google Routes API accepts arrivalTime
   * only for TRANSIT mode; we pass it through unmodified for TRANSIT
   * and ignore it for other modes (Routes rejects arrivalTime + DRIVE
   * etc. with a 400).
   */
  arrivalTime?: Date;
  /**
   * Referer header for the request. Required when `apiKey` is the
   * HTTP-referrer-restricted browser key (server calls 403 without it).
   * See `mapsServerReferer()`.
   */
  referer?: string;
};

export type ComputeRouteResult = {
  durationSeconds: number;
};

type RoutesV2Response = {
  routes?: Array<{ duration?: string }>;
  error?: { code?: number; message?: string };
};

/**
 * Normalise free-form mode strings (whatever the UI feeds into
 * `searches.commuteTargets[i].mode`) onto Google's enum.
 */
export function normaliseTravelMode(raw: string): GoogleTravelMode {
  const m = raw.trim().toLowerCase();
  if (m === "walk" || m === "walking" || m === "foot") {
    return "WALK";
  }
  if (m === "bike" || m === "bicycle" || m === "cycling" || m === "cycle") {
    return "BICYCLE";
  }
  if (m === "drive" || m === "driving" || m === "car") {
    return "DRIVE";
  }
  if (
    m === "motorcycle" ||
    m === "moped" ||
    m === "scooter" ||
    m === "two_wheeler"
  ) {
    return "TWO_WHEELER";
  }
  // Default to TRANSIT — the typical "commute" question is "how long
  // by public transport", and Routes accepts arrivalTime in this mode.
  return "TRANSIT";
}

const LONDON_WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function londonWeekdayAt(utcMs: number): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  });
  return LONDON_WEEKDAYS[fmt.format(new Date(utcMs))] ?? 1;
}

const OFFSET_RE = /^GMT([+-]\d{1,2})(?::(\d{2}))?$/;

function londonOffsetMinutesAt(utcMs: number): number {
  // For an instant `utcMs`, what UTC offset does Europe/London have?
  // We format the same instant in London with `timeZoneName: 'shortOffset'`
  // ("GMT" in winter, "GMT+1" in summer) and parse the result.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = OFFSET_RE.exec(offset);
  if (!match) {
    return 0;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  return hours * 60 + Math.sign(hours) * minutes;
}

function londonWallClockAtUtc(utcMs: number, hour: number): number {
  // Take the calendar date that `utcMs` falls on in London, then return
  // the UTC instant for `hour:00:00` London-local on that same date.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const candidate = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    0,
    0
  );
  const offsetMs = londonOffsetMinutesAt(candidate) * 60_000;
  return candidate - offsetMs;
}

/**
 * Returns the next London-local weekday wall-clock instant at the given
 * hour. Used as the default arrivalTime for commute enrichment so the
 * minutes we record are comparable across runs (a Tuesday-morning
 * commute, not a Saturday-night one).
 */
export function nextWeekdayAt(hourLondon: number, fromUtcMillis: number): Date {
  let target = londonWallClockAtUtc(fromUtcMillis, hourLondon);
  for (let i = 0; i < 7; i++) {
    if (target <= fromUtcMillis) {
      target = londonWallClockAtUtc(target + 86_400_000, hourLondon);
      continue;
    }
    const dow = londonWeekdayAt(target);
    if (dow === 0 || dow === 6) {
      target = londonWallClockAtUtc(target + 86_400_000, hourLondon);
      continue;
    }
    return new Date(target);
  }
  return new Date(target);
}

/** Build a Routes v2 waypoint payload from coordinates or an address. */
function toWaypoint(wp: Waypoint): Record<string, unknown> {
  if ("address" in wp) {
    return { address: wp.address };
  }
  return { location: { latLng: { latitude: wp.lat, longitude: wp.lng } } };
}

/**
 * Call Routes v2 for a single origin/destination pair. Throws on HTTP
 * error or when the response has no usable route.
 */
export async function computeRoute(
  input: ComputeRouteInput
): Promise<ComputeRouteResult> {
  const body: Record<string, unknown> = {
    origin: toWaypoint(input.origin),
    destination: toWaypoint(input.destination),
    travelMode: input.travelMode,
    languageCode: "en-GB",
    units: "METRIC",
  };
  // arrivalTime is only honoured for TRANSIT — for other modes Routes
  // returns a 400.
  if (input.travelMode === "TRANSIT" && input.arrivalTime) {
    body.arrivalTime = input.arrivalTime.toISOString();
  }

  const res = await fetch(ROUTES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": input.apiKey,
      "X-Goog-FieldMask": "routes.duration",
      ...(input.referer ? { Referer: input.referer } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Google Routes ${res.status} ${res.statusText}: ${errBody.slice(0, 400)}`
    );
  }
  const data = (await res.json()) as RoutesV2Response;
  if (data.error) {
    throw new Error(
      `Google Routes API error: ${data.error.message ?? "unknown"}`
    );
  }
  const first = data.routes?.[0];
  if (!first?.duration) {
    throw new Error("Google Routes: response had no routes/duration");
  }
  const match = DURATION_SECONDS_RE.exec(first.duration);
  if (!match) {
    throw new Error(
      `Google Routes: unexpected duration format "${first.duration}"`
    );
  }
  return { durationSeconds: Number(match[1]) };
}
