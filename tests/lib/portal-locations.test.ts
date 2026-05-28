import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PortalResolveError,
  resolveOpenrent,
  resolveOpenrentOutcode,
  resolveRightmove,
  resolveRightmoveOutcode,
  resolveZoopla,
  resolveZooplaOutcode,
} from "../../src/lib/portal-locations";
import type { SearchLocation } from "../../src/lib/search-location";

type TypeaheadMatch = { id: string; type: string; displayName: string };

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function makeLocation(
  partial: Partial<SearchLocation> & {
    name: string;
    formattedAddress: string;
    type: SearchLocation["type"];
  }
): SearchLocation {
  return {
    placeId: "test-id",
    lat: 0,
    lng: 0,
    bounds: null,
    portalRefs: {},
    ...partial,
  };
}

// -----------------------------------------------------------------------------
// resolveRightmove
// -----------------------------------------------------------------------------

describe("resolveRightmove", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a postal_code to OUTCODE^<id>", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          { id: "1859", type: "OUTCODE", displayName: "NW3" },
          { id: "x", type: "STREET", displayName: "Some Road, Camden, NW3" },
        ] satisfies TypeaheadMatch[],
      })
    );
    const ref = await resolveRightmove(
      makeLocation({
        name: "NW3",
        formattedAddress: "NW3, UK",
        type: "postal_code",
      })
    );
    expect(ref).toEqual({ locationIdentifier: "OUTCODE^1859" });
  });

  it("throws PortalResolveError when no OUTCODE match exists", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          { id: "x", type: "STREET", displayName: "Some Road, NW3" },
        ] satisfies TypeaheadMatch[],
      })
    );
    await expect(
      resolveRightmove(
        makeLocation({
          name: "NW3",
          formattedAddress: "NW3, UK",
          type: "postal_code",
        })
      )
    ).rejects.toBeInstanceOf(PortalResolveError);
  });

  it("resolves a locality to the matching REGION^<id>", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          {
            id: "904",
            type: "REGION",
            displayName: "Manchester, Greater Manchester",
          },
          {
            id: "33",
            type: "REGION",
            displayName: "Altrincham, Greater Manchester",
          },
        ] satisfies TypeaheadMatch[],
      })
    );
    const ref = await resolveRightmove(
      makeLocation({
        name: "Manchester",
        formattedAddress: "Manchester, UK",
        type: "locality",
      })
    );
    expect(ref).toEqual({ locationIdentifier: "REGION^904" });
  });

  it("disambiguates a sublocality by token overlap with formattedAddress", async () => {
    // "Camden Town" exists in both North West London and Gosport,
    // Hampshire. The London formattedAddress should pick the London one.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          {
            id: "76577",
            type: "REGION",
            displayName: "Camden Town, Gosport, Hampshire",
          },
          {
            id: "85262",
            type: "REGION",
            displayName: "Camden Town, North West London",
          },
        ] satisfies TypeaheadMatch[],
      })
    );
    const ref = await resolveRightmove(
      makeLocation({
        name: "Camden Town",
        formattedAddress: "Camden Town, London NW1, UK",
        type: "sublocality",
      })
    );
    expect(ref).toEqual({ locationIdentifier: "REGION^85262" });
  });

  it("sanitises punctuation that breaks the typeahead", async () => {
    // "St. John's Wood" with raw punctuation 400s — sanitiser must
    // strip `.` and `'` before sending.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          {
            id: "1234",
            type: "REGION",
            displayName: "St Johns Wood, North West London",
          },
        ] satisfies TypeaheadMatch[],
      })
    );
    await resolveRightmove(
      makeLocation({
        name: "St. John's Wood",
        formattedAddress: "St John's Wood, London NW8, UK",
        type: "sublocality",
      })
    );
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("query=St%20Johns%20Wood");
  });

  it("throws PortalResolveError when no REGION exists (STREET-only)", async () => {
    // "Hatton Garden" returns 10 STREET matches but zero REGION.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          {
            id: "x",
            type: "STREET",
            displayName: "Hatton Garden, Camden, London, EC1N",
          },
          {
            id: "y",
            type: "STREET",
            displayName: "Hatton Garden, Liverpool, L3",
          },
        ] satisfies TypeaheadMatch[],
      })
    );
    await expect(
      resolveRightmove(
        makeLocation({
          name: "Hatton Garden",
          formattedAddress: "Hatton Garden, London EC1N, UK",
          type: "neighborhood",
        })
      )
    ).rejects.toBeInstanceOf(PortalResolveError);
  });

  it("throws PortalResolveError on typeahead HTTP failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("", { status: 503, statusText: "Service Unavailable" })
    );
    await expect(
      resolveRightmove(
        makeLocation({
          name: "NW3",
          formattedAddress: "NW3, UK",
          type: "postal_code",
        })
      )
    ).rejects.toBeInstanceOf(PortalResolveError);
  });
});

// -----------------------------------------------------------------------------
// resolveZoopla
// -----------------------------------------------------------------------------

describe("resolveZoopla", () => {
  it("returns formattedAddress as the q param", () => {
    expect(
      resolveZoopla(
        makeLocation({
          name: "Camden Town",
          formattedAddress: "Camden Town, London NW1, UK",
          type: "sublocality",
        })
      )
    ).toEqual({ q: "Camden Town, London NW1, UK" });
  });
});

// -----------------------------------------------------------------------------
// resolveOpenrent
// -----------------------------------------------------------------------------

describe("resolveOpenrent", () => {
  it("returns the place name as the term", () => {
    const ref = resolveOpenrent(
      makeLocation({
        name: "Camden Town",
        formattedAddress: "Camden Town, London NW1, UK",
        type: "sublocality",
        lat: 51.539,
        lng: -0.143,
        bounds: {
          ne: { lat: 51.549, lng: -0.131 },
          sw: { lat: 51.5345, lng: -0.15 },
        },
      })
    );
    expect(ref.term).toBe("Camden Town");
  });

  it("ignores bounds — radius is user-driven and applied at URL-build time", () => {
    // The resolver no longer derives a radius from the place viewport;
    // that decision lives on `searches.radiusMiles` and is consumed by
    // `openrentSearchUrl`. The resolver only needs the term.
    const ref = resolveOpenrent(
      makeLocation({
        name: "NW3",
        formattedAddress: "NW3, UK",
        type: "postal_code",
      })
    );
    expect(ref).toEqual({ term: "NW3" });
  });
});

// -----------------------------------------------------------------------------
// Per-outcode resolvers (area-search path)
// -----------------------------------------------------------------------------

describe("resolveRightmoveOutcode", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns OUTCODE^<id> when the typeahead has an exact match", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          { id: "2018", type: "OUTCODE", displayName: "N1" },
          { id: "x", type: "STREET", displayName: "Some Road, N1" },
        ] satisfies TypeaheadMatch[],
      })
    );
    const ref = await resolveRightmoveOutcode("N1");
    expect(ref).toEqual({ locationIdentifier: "OUTCODE^2018" });
  });

  it("returns null (does not throw) when no OUTCODE match exists", async () => {
    // One bad outcode in a 15-outcode area shouldn't sink the whole save.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          { id: "x", type: "STREET", displayName: "Some Road, N99" },
        ] satisfies TypeaheadMatch[],
      })
    );
    const ref = await resolveRightmoveOutcode("N99");
    expect(ref).toBeNull();
  });

  it("returns null when the typeahead returns an HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 503 }));
    const ref = await resolveRightmoveOutcode("N1");
    expect(ref).toBeNull();
  });

  it("returns null when the input is empty after sanitisation", async () => {
    // Punctuation-only / blank outcode — refuse without hitting Rightmove.
    const ref = await resolveRightmoveOutcode(".");
    expect(ref).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveZooplaOutcode / resolveOpenrentOutcode", () => {
  it("Zoopla stamps the bare outcode as `q`", () => {
    expect(resolveZooplaOutcode("NW3")).toEqual({ q: "NW3" });
  });

  it("OpenRent stamps the bare outcode as `term`", () => {
    expect(resolveOpenrentOutcode("NW3")).toEqual({ term: "NW3" });
  });
});
