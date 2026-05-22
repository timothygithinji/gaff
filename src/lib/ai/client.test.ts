/**
 * Cost math is the one piece of the Anthropic wrapper we can lock down
 * without making a live call — and it's the piece that, if wrong,
 * silently misreports spend in `ai_runs.cost_usd` and breaks the daily
 * budget guard. Pin it.
 *
 * Rates (from src/lib/ai/config.ts):
 *   - Haiku 4.5 input:  $1.00 / Mtok
 *   - Haiku 4.5 output: $5.00 / Mtok
 */

import { describe, expect, it } from "vitest";
import { computeCostUsd } from "./client";

describe("computeCostUsd", () => {
  it("charges $1/Mtok for input and $5/Mtok for output", () => {
    // 1M input + 1M output = $1 + $5 = $6
    expect(
      computeCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 })
    ).toBeCloseTo(6);
  });

  it("scales linearly down to small calls", () => {
    // 1000 input + 500 output = $0.001 + $0.0025 = $0.0035
    const cost = computeCostUsd({ inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeCloseTo(0.0035, 6);
  });

  it("returns 0 for an empty call", () => {
    expect(computeCostUsd({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});
