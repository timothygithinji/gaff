import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBroadband } from "../../src/lib/broadband";
import { getFloodRisk } from "../../src/lib/flood-risk";
import { getAmenityCounts } from "../../src/lib/overpass";
import { getCrimeAggregate } from "../../src/lib/police-uk";

const POLICE_503_RE = /data\.police\.uk 503/;
const OVERPASS_503_RE = /Overpass 503/;

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

describe("getAmenityCounts", () => {
  it("buckets OSM elements by category", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        elements: [
          { type: "node", tags: { shop: "supermarket" } },
          { type: "node", tags: { shop: "supermarket" } },
          { type: "node", tags: { amenity: "cafe" } },
          { type: "node", tags: { leisure: "park" } },
        ],
      })
    );
    const result = await getAmenityCounts({ lat: 51.6, lng: -0.13 });
    expect(result.withinMeters).toBe(500);
    expect(result.counts.supermarket).toBe(2);
    expect(result.counts.cafe).toBe(1);
    expect(result.counts.park).toBe(1);
    expect(result.counts.pub).toBe(0);
  });

  it("returns zero counts when the area has no amenities", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ elements: [] }));
    const result = await getAmenityCounts({ lat: 51.6, lng: -0.13 });
    expect(Object.values(result.counts).every((v) => v === 0)).toBe(true);
  });

  it("throws on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("boom", { status: 503, statusText: "Service Unavailable" })
    );
    await expect(getAmenityCounts({ lat: 51.6, lng: -0.13 })).rejects.toThrow(
      OVERPASS_503_RE
    );
  });
});

describe("getFloodRisk", () => {
  it("maps numeric riskband to a level", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ features: [{ attributes: { riskband: 3 } }] })
    );
    const result = await getFloodRisk({ lat: 51.6, lng: -0.13 });
    expect(result.riskLevel).toBe("low");
  });

  it("maps text band labels too", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ features: [{ attributes: { prob_4band: "Very Low" } }] })
    );
    const result = await getFloodRisk({ lat: 51.6, lng: -0.13 });
    expect(result.riskLevel).toBe("very-low");
  });

  it("returns 'unknown' when there's no feature at the point", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ features: [] }));
    const result = await getFloodRisk({ lat: 51.6, lng: -0.13 });
    expect(result.riskLevel).toBe("unknown");
  });
});

describe("getBroadband", () => {
  it("returns null tech when Zyte response is non-JSON (BT bounce page)", async () => {
    // Mock Zyte API: returns a 200 with non-JSON body wrapped in browserHtml
    // shape — our parser should fall through to null tech rather than throw.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ browserHtml: "<html>session expired</html>" })
    );
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

  it("picks FTTP as the headline tech when products list it", async () => {
    const btJson = JSON.stringify({
      products: [
        { name: "BT FTTC", downstreamMax: 80, upstreamMax: 20 },
        { name: "BT FTTP", downstreamMax: 900, upstreamMax: 110 },
      ],
    });
    // Zyte's `httpResponseBody: true` returns base64 in the API but the
    // helper decodes to UTF-8 and exposes it as `html`. We mock by
    // wrapping our JSON string in a `browserHtml` field; zyteFetch
    // will surface it as `res.html` either way.
    fetchMock.mockResolvedValueOnce(jsonResponse({ browserHtml: btJson }));
    const result = await getBroadband({
      zyteApiKey: "k",
      postcode: "N11 1AA",
    });
    expect(result.technology).toBe("FTTP");
    expect(result.downloadMbps).toBe(900);
    expect(result.uploadMbps).toBe(110);
    expect(result.fttpAvailable).toBe(true);
  });
});
