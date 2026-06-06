import { describe, expect, it } from "vitest";
import {
  type ActiveSearch,
  type ClusterTargetEnrichment,
  clusterPassesSearch,
} from "./queue-targets";

/** A search carrying only the transport/commute targets under test. */
function search(targets: Partial<ActiveSearch>): ActiveSearch {
  return {
    commuteTargets: [],
    transportTargets: [],
    ...targets,
  } as ActiveSearch;
}

const TUBE_OR_RAIL_15 = search({
  transportTargets: [
    { mode: "walk", amenity: "tube_station", maxMinutes: 15 },
    { mode: "walk", amenity: "train_station", maxMinutes: 15 },
  ],
}) as ActiveSearch;

function enr(e: Partial<ClusterTargetEnrichment>): ClusterTargetEnrichment {
  return { commuteMinutes: null, stationRoutes: null, nearbyTransit: null, ...e };
}

describe("clusterPassesSearch — station time", () => {
  it("drops a cluster whose nearest Google station is over the limit", () => {
    // The Bush Hill case: real stations at 19/23/23 min walk, limit 15.
    const e = enr({
      stationRoutes: [
        { walkMinutes: 19 },
        { walkMinutes: 23 },
        { walkMinutes: 23 },
      ],
    });
    expect(clusterPassesSearch(TUBE_OR_RAIL_15, e)).toBe(false);
  });

  it("keeps a cluster with a Google station within the limit", () => {
    const e = enr({ stationRoutes: [{ walkMinutes: 8 }, { walkMinutes: 19 }] });
    expect(clusterPassesSearch(TUBE_OR_RAIL_15, e)).toBe(true);
  });

  it("IGNORES a mislabelled 0.03mi 'rail' stop with no routed walk time", () => {
    // The original leak: a fake rail stop near the property with no
    // walkMinutes must not satisfy the station criterion via the
    // straight-line heuristic. Google says the real station is 19 min → drop.
    const e = enr({
      stationRoutes: [{ walkMinutes: 19 }],
      nearbyTransit: [{ kind: "rail", distanceMiles: 0.03, walkMinutes: null }],
    });
    expect(clusterPassesSearch(TUBE_OR_RAIL_15, e)).toBe(false);
  });

  it("falls back to a nearbyTransit station's REAL routed walk (non-Rightmove)", () => {
    // No stationRoutes (Zoopla/OpenRent); a rail stop carries a real
    // Google walkMinutes within the limit → passes.
    const e = enr({
      nearbyTransit: [{ kind: "rail", distanceMiles: 0.4, walkMinutes: 12 }],
    });
    expect(clusterPassesSearch(TUBE_OR_RAIL_15, e)).toBe(true);
    // …and over the limit → drops.
    const far = enr({
      nearbyTransit: [{ kind: "rail", distanceMiles: 1.0, walkMinutes: 22 }],
    });
    expect(clusterPassesSearch(TUBE_OR_RAIL_15, far)).toBe(false);
  });

  it("treats a cluster with no station data as pending (passes)", () => {
    expect(clusterPassesSearch(TUBE_OR_RAIL_15, enr({}))).toBe(true);
    expect(clusterPassesSearch(TUBE_OR_RAIL_15, undefined)).toBe(true);
  });
});

describe("clusterPassesSearch — OR semantics & buses", () => {
  it("passes when a bus is within reach even though stations aren't", () => {
    const s = search({
      transportTargets: [
        { mode: "walk", amenity: "train_station", maxMinutes: 15 },
        { mode: "walk", amenity: "bus_stop", maxMinutes: 10 },
      ],
    });
    const e = enr({
      stationRoutes: [{ walkMinutes: 25 }],
      // Bus 0.1mi → ~2 min via the heuristic, well under 10.
      nearbyTransit: [{ kind: "bus", distanceMiles: 0.1, walkMinutes: null }],
    });
    expect(clusterPassesSearch(s, e)).toBe(true);
  });

  it("admits any cluster when the search has no targets", () => {
    expect(clusterPassesSearch(search({}), enr({}))).toBe(true);
  });
});

describe("clusterPassesSearch — commute", () => {
  it("drops a cluster whose known commute exceeds the limit", () => {
    const s = search({
      commuteTargets: [
        { label: "Office", lat: 51.5, lng: -0.1, mode: "transit", maxMinutes: 30 },
      ],
    });
    expect(
      clusterPassesSearch(s, enr({ commuteMinutes: { Office: 45 } }))
    ).toBe(false);
    expect(
      clusterPassesSearch(s, enr({ commuteMinutes: { Office: 25 } }))
    ).toBe(true);
    // Unmeasured → pending → passes.
    expect(clusterPassesSearch(s, enr({}))).toBe(true);
  });
});
