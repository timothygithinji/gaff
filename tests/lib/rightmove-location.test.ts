import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRightmoveLocationCache,
  resolveRightmoveLocationIdentifier,
} from "../../src/lib/rightmove-location";

type TypeaheadMatch = { id: string; type: string; displayName: string };

const NO_OUTCODE_MATCH_RE = /no OUTCODE match/i;
const EMPTY_OUTCODE_RE = /empty outcode/i;
const TYPEAHEAD_503_RE = /Rightmove typeahead 503/;

const N11_RESPONSE = {
  matches: [
    { id: "1668", type: "OUTCODE", displayName: "N11" },
    {
      id: "abc123",
      type: "STREET",
      displayName: "Brunswick Park Road, Barnet, London, N11",
    },
  ],
};

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("resolveRightmoveLocationIdentifier", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns OUTCODE^<id> for the matching outcode", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(N11_RESPONSE));
    const id = await resolveRightmoveLocationIdentifier("N11");
    expect(id).toBe("OUTCODE^1668");
  });

  it("calls the typeahead endpoint with the query", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(N11_RESPONSE));
    await resolveRightmoveLocationIdentifier("N11");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://los.rightmove.co.uk/typeahead");
    expect(url).toContain("query=N11");
  });

  it("uppercases lowercase input before matching", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(N11_RESPONSE));
    const id = await resolveRightmoveLocationIdentifier("n11");
    expect(id).toBe("OUTCODE^1668");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("query=N11");
  });

  it("prefers OUTCODE match even when STREET matches come first", async () => {
    const shuffled = {
      matches: [
        { id: "street-1", type: "STREET", displayName: "Some Road, N11" },
        { id: "1668", type: "OUTCODE", displayName: "N11" },
        { id: "street-2", type: "STREET", displayName: "Other Road, N11" },
      ] satisfies TypeaheadMatch[],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(shuffled));
    const id = await resolveRightmoveLocationIdentifier("N11");
    expect(id).toBe("OUTCODE^1668");
  });

  it("throws when no OUTCODE match exists in the response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          { id: "x", type: "STREET", displayName: "Some Road, N11" },
        ] satisfies TypeaheadMatch[],
      })
    );
    await expect(resolveRightmoveLocationIdentifier("N11")).rejects.toThrow(
      NO_OUTCODE_MATCH_RE
    );
  });

  it("throws on empty input without calling fetch", async () => {
    await expect(resolveRightmoveLocationIdentifier("   ")).rejects.toThrow(
      EMPTY_OUTCODE_RE
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the typeahead returns a non-2xx status", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("", { status: 503, statusText: "Service Unavailable" })
    );
    await expect(resolveRightmoveLocationIdentifier("N11")).rejects.toThrow(
      TYPEAHEAD_503_RE
    );
  });
});

describe("createRightmoveLocationCache", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches once per unique outcode, even across repeated calls", async () => {
    fetchMock.mockResolvedValue(jsonResponse(N11_RESPONSE));
    const cache = createRightmoveLocationCache();
    const a = await cache("N11");
    const b = await cache("N11");
    const c = await cache("n11");
    expect(a).toBe("OUTCODE^1668");
    expect(b).toBe("OUTCODE^1668");
    expect(c).toBe("OUTCODE^1668");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches once per distinct outcode", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(N11_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse({
          matches: [
            { id: "1859", type: "OUTCODE", displayName: "NW3" },
          ] satisfies TypeaheadMatch[],
        })
      );
    const cache = createRightmoveLocationCache();
    expect(await cache("N11")).toBe("OUTCODE^1668");
    expect(await cache("NW3")).toBe("OUTCODE^1859");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
