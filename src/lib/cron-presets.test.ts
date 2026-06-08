import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANCHOR_HOUR,
  buildCron,
  findCadenceByCron,
  parseCron,
} from "./cron-presets";

describe("buildCron", () => {
  it("anchors daily at the chosen hour", () => {
    expect(buildCron("daily", 7)).toBe("0 7 * * *");
    expect(buildCron("daily", 0)).toBe("0 0 * * *");
    expect(buildCron("daily", 23)).toBe("0 23 * * *");
  });

  it("anchors 12h at the chosen hour and its +12 pair, ascending", () => {
    expect(buildCron("12h", 7)).toBe("0 7,19 * * *");
    expect(buildCron("12h", 19)).toBe("0 7,19 * * *");
    expect(buildCron("12h", 0)).toBe("0 0,12 * * *");
  });

  it("ignores the hour for interval cadences", () => {
    expect(buildCron("hourly", 14)).toBe("0 * * * *");
    expect(buildCron("4h", 14)).toBe("0 */4 * * *");
  });

  it("returns null for off", () => {
    expect(buildCron("off", 9)).toBeNull();
  });

  it("clamps out-of-range hours", () => {
    expect(buildCron("daily", 30)).toBe("0 23 * * *");
    expect(buildCron("daily", -5)).toBe("0 0 * * *");
    expect(buildCron("daily", Number.NaN)).toBe(`0 ${DEFAULT_ANCHOR_HOUR} * * *`);
  });
});

describe("parseCron", () => {
  it("recovers daily + hour", () => {
    expect(parseCron("0 7 * * *")).toEqual({ id: "daily", hour: 7 });
    expect(parseCron("0 14 * * *")).toEqual({ id: "daily", hour: 14 });
  });

  it("recovers 12h anchored at the lower hour", () => {
    expect(parseCron("0 7,19 * * *")).toEqual({ id: "12h", hour: 7 });
    expect(parseCron("0 19,7 * * *")).toEqual({ id: "12h", hour: 7 });
    expect(parseCron("0 0,12 * * *")).toEqual({ id: "12h", hour: 0 });
  });

  it("recovers interval cadences at the default hour", () => {
    expect(parseCron("0 * * * *")).toEqual({
      id: "hourly",
      hour: DEFAULT_ANCHOR_HOUR,
    });
    expect(parseCron("0 */4 * * *")).toEqual({
      id: "4h",
      hour: DEFAULT_ANCHOR_HOUR,
    });
  });

  it("treats a non-12-apart hour pair as unrecognised", () => {
    expect(parseCron("0 7,9 * * *")).toEqual({
      id: "daily",
      hour: DEFAULT_ANCHOR_HOUR,
    });
  });

  it("maps null to off", () => {
    expect(parseCron(null)).toEqual({ id: "off", hour: DEFAULT_ANCHOR_HOUR });
  });

  it("falls back to default daily for garbage", () => {
    expect(parseCron("nonsense")).toEqual({
      id: "daily",
      hour: DEFAULT_ANCHOR_HOUR,
    });
  });
});

describe("build/parse round-trip", () => {
  it("round-trips every anchored hour for daily and 12h", () => {
    for (let h = 0; h < 24; h++) {
      const daily = buildCron("daily", h);
      expect(parseCron(daily)).toEqual({ id: "daily", hour: h });

      const twelve = buildCron("12h", h);
      const expectedHour = h < 12 ? h : h - 12;
      expect(parseCron(twelve)).toEqual({ id: "12h", hour: expectedHour });
    }
  });
});

describe("findCadenceByCron", () => {
  it("recovers the preset for a custom-hour daily cron", () => {
    expect(findCadenceByCron("0 14 * * *").id).toBe("daily");
    expect(findCadenceByCron("0 14 * * *").maxDaysSinceAdded).toBe(7);
  });

  it("recovers the 12h preset regardless of anchor", () => {
    expect(findCadenceByCron("0 2,14 * * *").id).toBe("12h");
  });
});
