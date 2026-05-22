import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeRoute,
  nextWeekdayAt,
  normaliseTravelMode,
} from "../../src/lib/google-routes";

const ROUTES_503_RE = /Google Routes 503/;
const ROUTES_NO_ROUTES_RE = /no routes\/duration/;

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("normaliseTravelMode", () => {
  it("maps walking variants", () => {
    expect(normaliseTravelMode("walk")).toBe("WALK");
    expect(normaliseTravelMode("Walking")).toBe("WALK");
    expect(normaliseTravelMode(" foot ")).toBe("WALK");
  });

  it("maps cycling variants", () => {
    expect(normaliseTravelMode("bike")).toBe("BICYCLE");
    expect(normaliseTravelMode("cycling")).toBe("BICYCLE");
    expect(normaliseTravelMode("bicycle")).toBe("BICYCLE");
  });

  it("maps driving variants", () => {
    expect(normaliseTravelMode("drive")).toBe("DRIVE");
    expect(normaliseTravelMode("car")).toBe("DRIVE");
  });

  it("defaults to TRANSIT for unknown / public-transport strings", () => {
    expect(normaliseTravelMode("transit")).toBe("TRANSIT");
    expect(normaliseTravelMode("tube")).toBe("TRANSIT");
    expect(normaliseTravelMode("")).toBe("TRANSIT");
  });
});

describe("nextWeekdayAt", () => {
  it("returns a weekday in the future", () => {
    const now = Date.UTC(2026, 4, 22, 12, 0, 0); // Friday lunchtime UTC
    const next = nextWeekdayAt(9, now);
    expect(next.getTime()).toBeGreaterThan(now);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
    });
    const day = fmt.format(next);
    expect(["Mon", "Tue", "Wed", "Thu", "Fri"]).toContain(day);
  });

  it("lands at exactly 09:00 London local", () => {
    const now = Date.UTC(2026, 4, 22, 12, 0, 0);
    const next = nextWeekdayAt(9, now);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(fmt.format(next)).toBe("09:00");
  });

  it("skips Sundays when 'next' would otherwise be a weekend", () => {
    // Friday at 10:00 UTC — already past 09:00 today, so the candidate
    // is Saturday → must skip Sat+Sun and land on Monday.
    const friday = Date.UTC(2026, 4, 22, 10, 0, 0);
    const next = nextWeekdayAt(9, friday);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
    });
    expect(fmt.format(next)).toBe("Mon");
  });
});

describe("computeRoute", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed duration in seconds", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ routes: [{ duration: "1800s" }] })
    );
    const result = await computeRoute({
      apiKey: "key",
      origin: { lat: 51.5, lng: -0.1 },
      destination: { lat: 51.51, lng: -0.14 },
      travelMode: "TRANSIT",
    });
    expect(result).toEqual({ durationSeconds: 1800 });
  });

  it("sends arrivalTime only for TRANSIT mode", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ routes: [{ duration: "600s" }] })
    );
    const arrivalTime = new Date("2026-05-26T08:00:00.000Z");

    await computeRoute({
      apiKey: "k",
      origin: { lat: 51.5, lng: -0.1 },
      destination: { lat: 51.6, lng: -0.2 },
      travelMode: "TRANSIT",
      arrivalTime,
    });
    const transitBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body
    );
    expect(transitBody.arrivalTime).toBe(arrivalTime.toISOString());

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      jsonResponse({ routes: [{ duration: "600s" }] })
    );
    await computeRoute({
      apiKey: "k",
      origin: { lat: 51.5, lng: -0.1 },
      destination: { lat: 51.6, lng: -0.2 },
      travelMode: "DRIVE",
      arrivalTime,
    });
    const driveBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body
    );
    expect(driveBody.arrivalTime).toBeUndefined();
  });

  it("requests only the duration field via X-Goog-FieldMask", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ routes: [{ duration: "1s" }] })
    );
    await computeRoute({
      apiKey: "k",
      origin: { lat: 0, lng: 0 },
      destination: { lat: 1, lng: 1 },
      travelMode: "WALK",
    });
    const headers = (
      fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }
    ).headers;
    expect(headers["X-Goog-Api-Key"]).toBe("k");
    expect(headers["X-Goog-FieldMask"]).toBe("routes.duration");
  });

  it("throws on non-2xx status with the API body in the message", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("server boom", {
        status: 503,
        statusText: "Service Unavailable",
      })
    );
    await expect(
      computeRoute({
        apiKey: "k",
        origin: { lat: 0, lng: 0 },
        destination: { lat: 1, lng: 1 },
        travelMode: "WALK",
      })
    ).rejects.toThrow(ROUTES_503_RE);
  });

  it("throws when the response has no routes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ routes: [] }));
    await expect(
      computeRoute({
        apiKey: "k",
        origin: { lat: 0, lng: 0 },
        destination: { lat: 1, lng: 1 },
        travelMode: "WALK",
      })
    ).rejects.toThrow(ROUTES_NO_ROUTES_RE);
  });
});
