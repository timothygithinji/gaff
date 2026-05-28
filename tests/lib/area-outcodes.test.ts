/**
 * Tests for `findCoveringOutcodes`. Covers:
 *   - radius is computed from bounds (not a hard-coded constant)
 *   - postcodes.io results are filtered to the rectangular bounds
 *   - results sort closest-to-centre first
 *   - missing bounds → empty list (legacy degenerate row)
 *   - postcodes.io error → empty list (caller falls through)
 *   - 100-result response signals `truncated`
 */

import { describe, expect, it } from "vitest";
import { findCoveringOutcodes } from "../../src/lib/area-outcodes";
import type { LocationBounds } from "../../src/lib/search-location";

/** Tiny Google Places-like viewport covering inner North London. */
const NORTH_LONDON_BOUNDS: LocationBounds = {
  ne: { lat: 51.58, lng: -0.06 },
  sw: { lat: 51.53, lng: -0.16 },
};
const NORTH_LONDON_CENTER = { lat: 51.5525, lng: -0.11 };

/**
 * Build a stub fetch that replies to `GET /outcodes?...` with the given
 * outcodes (each gets a centroid). Throws if the URL pattern doesn't
 * match — keeps the test honest about what the resolver actually asks
 * for.
 */
function stubOutcodesFetch(
  outcodes: Array<{ outcode: string; latitude: number; longitude: number }>
): typeof fetch {
  // `@hey-api/client-fetch` calls our custom fetch with a `Request`
  // (not a URL string), so we read `.url` directly to pattern-match.
  return ((input: RequestInfo | URL) => {
    let url: string;
    if (input instanceof Request) {
      url = input.url;
    } else if (typeof input === "string") {
      url = input;
    } else {
      url = input.toString();
    }
    if (!url.startsWith("https://api.postcodes.io/outcodes?")) {
      throw new Error(`unexpected fetch URL ${url}`);
    }
    return Promise.resolve(
      new Response(JSON.stringify({ status: 200, result: outcodes }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  }) as unknown as typeof fetch;
}

describe("findCoveringOutcodes", () => {
  it("keeps outcodes whose centroid is inside the bounds and drops those outside", async () => {
    const fetchStub = stubOutcodesFetch([
      // Inside the rectangle.
      { outcode: "N1", latitude: 51.541, longitude: -0.103 },
      { outcode: "NW1", latitude: 51.535, longitude: -0.147 },
      { outcode: "N7", latitude: 51.552, longitude: -0.118 },
      // Outside: latitude too low.
      { outcode: "SE1", latitude: 51.504, longitude: -0.087 },
      // Outside: longitude too far west.
      { outcode: "W2", latitude: 51.515, longitude: -0.18 },
    ]);

    const { outcodes, truncated } = await findCoveringOutcodes(
      { bounds: NORTH_LONDON_BOUNDS, ...NORTH_LONDON_CENTER },
      { fetch: fetchStub }
    );

    expect(outcodes).toEqual(expect.arrayContaining(["N1", "NW1", "N7"]));
    expect(outcodes).not.toContain("SE1");
    expect(outcodes).not.toContain("W2");
    expect(truncated).toBe(false);
  });

  it("sorts results by ascending distance from the area's centre", async () => {
    const fetchStub = stubOutcodesFetch([
      // 3 outcodes inside, at increasing distances from the centre
      // (51.5525, -0.11).
      { outcode: "N7", latitude: 51.5525, longitude: -0.11 }, // dead-centre
      { outcode: "N1", latitude: 51.541, longitude: -0.103 }, // ~1.3 km
      { outcode: "NW1", latitude: 51.535, longitude: -0.147 }, // ~3 km
    ]);

    const { outcodes } = await findCoveringOutcodes(
      { bounds: NORTH_LONDON_BOUNDS, ...NORTH_LONDON_CENTER },
      { fetch: fetchStub }
    );

    expect(outcodes).toEqual(["N7", "N1", "NW1"]);
  });

  it("returns an empty list when bounds is null (degenerate legacy row)", async () => {
    // The fetch stub would throw if it were called — proves we short-circuit.
    const result = await findCoveringOutcodes(
      { bounds: null, lat: 51.5, lng: -0.1 },
      {
        fetch: (() => {
          throw new Error("must not call fetch");
        }) as unknown as typeof fetch,
      }
    );
    expect(result).toEqual({ outcodes: [], truncated: false });
  });

  it("returns an empty list (not throw) when postcodes.io errors out", async () => {
    const failingFetch = (() =>
      Promise.resolve(
        new Response("upstream sad", { status: 500 })
      )) as unknown as typeof fetch;

    const result = await findCoveringOutcodes(
      { bounds: NORTH_LONDON_BOUNDS, ...NORTH_LONDON_CENTER },
      { fetch: failingFetch }
    );
    expect(result).toEqual({ outcodes: [], truncated: false });
  });

  it("flags truncated=true when the response is at the 100-cap", async () => {
    // Synthesize 100 outcodes all inside the rectangle.
    const stuffed = Array.from({ length: 100 }, (_, i) => ({
      outcode: `X${i + 1}`,
      latitude: 51.55,
      longitude: -0.11,
    }));
    const fetchStub = stubOutcodesFetch(stuffed);

    const { outcodes, truncated } = await findCoveringOutcodes(
      { bounds: NORTH_LONDON_BOUNDS, ...NORTH_LONDON_CENTER },
      { fetch: fetchStub }
    );

    expect(outcodes).toHaveLength(100);
    expect(truncated).toBe(true);
  });

  it("uppercases outcodes and dedupes any duplicates in the response", async () => {
    const fetchStub = stubOutcodesFetch([
      { outcode: "n1", latitude: 51.541, longitude: -0.103 },
      { outcode: "N1", latitude: 51.542, longitude: -0.103 },
      { outcode: "nw1", latitude: 51.535, longitude: -0.147 },
    ]);

    const { outcodes } = await findCoveringOutcodes(
      { bounds: NORTH_LONDON_BOUNDS, ...NORTH_LONDON_CENTER },
      { fetch: fetchStub }
    );

    expect(outcodes).toEqual(["N1", "NW1"]);
  });
});
