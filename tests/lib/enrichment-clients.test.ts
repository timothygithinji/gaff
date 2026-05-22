import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBroadband } from "../../src/lib/broadband";
import { getFloodRisk } from "../../src/lib/flood-risk";
import { getAmenityCounts } from "../../src/lib/overpass";
import { getCrimeAggregate } from "../../src/lib/police-uk";

const POLICE_503_RE = /data\.police\.uk 503/;

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCrimeAggregate", () => {
  it("aggregates crimes by category and reports the month", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { category: "anti-social-behaviour", month: "2026-03" },
        { category: "anti-social-behaviour", month: "2026-03" },
        { category: "burglary", month: "2026-03" },
      ])
    );
    const result = await getCrimeAggregate({ lat: 51.6, lng: -0.13 });
    expect(result).toEqual({
      month: "2026-03",
      total: 3,
      byCategory: { "anti-social-behaviour": 2, burglary: 1 },
    });
  });

  it("returns null on 404 (no data for the area)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    const result = await getCrimeAggregate({ lat: 51.6, lng: -0.13 });
    expect(result).toBeNull();
  });

  it("returns null on empty array", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    expect(await getCrimeAggregate({ lat: 51.6, lng: -0.13 })).toBeNull();
  });

  it("throws on non-2xx/404", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("boom", { status: 503, statusText: "Service Unavailable" })
    );
    await expect(getCrimeAggregate({ lat: 51.6, lng: -0.13 })).rejects.toThrow(
      POLICE_503_RE
    );
  });
});

describe("getAmenityCounts (stubbed)", () => {
  it("returns zero counts for every category at the requested radius", async () => {
    const result = await getAmenityCounts({
      lat: 51.6,
      lng: -0.13,
      radiusMeters: 250,
    });
    expect(result.withinMeters).toBe(250);
    expect(Object.values(result.counts).every((v) => v === 0)).toBe(true);
    expect(result.counts.supermarket).toBe(0);
    expect(result.counts.cafe).toBe(0);
  });

  it("never makes a network call while stubbed", async () => {
    await getAmenityCounts({ lat: 51.6, lng: -0.13 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getFloodRisk (stubbed)", () => {
  it("always returns 'unknown' (EA endpoint is down; stubbed)", async () => {
    const result = await getFloodRisk({ lat: 51.6, lng: -0.13 });
    expect(result.riskLevel).toBe("unknown");
  });

  it("never makes a network call while stubbed", async () => {
    await getFloodRisk({ lat: 51.6, lng: -0.13 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getBroadband (stubbed)", () => {
  it("returns a null-filled result (no upstream source wired)", async () => {
    const result = await getBroadband({
      zyteApiKey: "k",
      postcode: "N11 1AA",
    });
    expect(result).toEqual({
      technology: null,
      downloadMbps: null,
      uploadMbps: null,
      fttpAvailable: false,
    });
  });

  it("never makes a network call while stubbed", async () => {
    await getBroadband({ zyteApiKey: "k", postcode: "N11 1AA" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
