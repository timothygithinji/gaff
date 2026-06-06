import { describe, expect, it } from "vitest";
import { classifyKind } from "./google-places";

describe("classifyKind", () => {
  it("maps explicit station types to their kind", () => {
    expect(classifyKind("subway_station", [])).toBe("tube");
    expect(classifyKind("train_station", [])).toBe("rail");
    expect(classifyKind("light_rail_station", [])).toBe("tram");
    expect(classifyKind("bus_stop", [])).toBe("bus");
    expect(classifyKind("bus_station", [])).toBe("bus");
  });

  it("scans the types array when primaryType is unhelpful", () => {
    expect(classifyKind("establishment", ["point_of_interest", "train_station"])).toBe("rail");
    expect(classifyKind(undefined, ["bus_stop"])).toBe("bus");
  });

  it("does NOT default a bare transit_station to rail", () => {
    // The original bug: Google's generic `transit_station` (mostly bus-stop
    // clusters in residential London) was stamped "rail", planting fake
    // 0.03mi stations that fooled the queue's transport-time filter.
    expect(classifyKind("transit_station", ["transit_station"])).toBeNull();
    expect(classifyKind("transit_station", [])).toBeNull();
  });

  it("still classifies a transit_station that ALSO carries a real station type", () => {
    expect(classifyKind("transit_station", ["subway_station"])).toBe("tube");
    expect(classifyKind(undefined, ["transit_station", "bus_stop"])).toBe("bus");
  });

  it("returns null for non-transport places", () => {
    expect(classifyKind("park", ["park"])).toBeNull();
    expect(classifyKind(undefined, undefined)).toBeNull();
  });
});
