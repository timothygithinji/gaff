import { describe, expect, it } from "vitest";
import { pipelineIncomingWins, resolveSwipeOutcome } from "./merge";

describe("resolveSwipeOutcome", () => {
  it("lets a skip veto win over anything", () => {
    expect(resolveSwipeOutcome("keep", "skip")).toBe("skip");
    expect(resolveSwipeOutcome("shortlist", "skip")).toBe("skip");
    expect(resolveSwipeOutcome("skip", "shortlist")).toBe("skip");
  });

  it("prefers shortlist over keep", () => {
    expect(resolveSwipeOutcome("keep", "shortlist")).toBe("shortlist");
    expect(resolveSwipeOutcome("shortlist", "keep")).toBe("shortlist");
  });

  it("keeps the incumbent on a tie", () => {
    expect(resolveSwipeOutcome("keep", "keep")).toBe("keep");
    expect(resolveSwipeOutcome("skip", "skip")).toBe("skip");
  });
});

describe("pipelineIncomingWins", () => {
  it("favours the more recently moved row", () => {
    const older = new Date("2026-01-01");
    const newer = new Date("2026-02-01");
    expect(pipelineIncomingWins(older, newer)).toBe(true);
    expect(pipelineIncomingWins(newer, older)).toBe(false);
  });
});
