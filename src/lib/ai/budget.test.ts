/**
 * Unit tests for the daily-budget pre-flight check.
 *
 * No real Postgres — the helper takes a `BudgetDb` (currently the
 * NeonHttpDatabase type) but it's only structural: we just need
 * `select().from().where()` to resolve to a `[{ sum }]` array. We pass
 * a tiny stub cast through `unknown` to the helper and assert the cap
 * decision against canned SUMs.
 *
 * What we lock in here:
 *   1. spent < cap → { ok: true }
 *   2. spent === cap → { ok: false } (gte, not gt)
 *   3. spent > cap → { ok: false }
 *   4. NULL sum (no rows today) → ok and spent = 0
 *   5. utcMidnight returns 00:00:00 UTC regardless of local zone
 */

import { describe, expect, it } from "vitest";
import { type BudgetDb, checkDailyBudget, utcMidnight } from "./budget";

function fakeDbWithSum(sum: string | null): BudgetDb {
  // Structural fake — every chained method just returns the next link.
  // The terminal `.where(...)` resolves to the array shape drizzle hands
  // back: `[{ sum: string | null }]`.
  const fake = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ sum }]),
      }),
    }),
  };
  return fake as unknown as BudgetDb;
}

describe("checkDailyBudget", () => {
  it("returns ok=true when spend is under the cap", async () => {
    const result = await checkDailyBudget(fakeDbWithSum("0.50"));
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(0.5);
    expect(result.cap).toBe(1);
  });

  it("returns ok=false when spend equals the cap (>= boundary)", async () => {
    const result = await checkDailyBudget(fakeDbWithSum("1.00"));
    expect(result.ok).toBe(false);
    expect(result.spent).toBe(1);
  });

  it("returns ok=false when spend exceeds the cap", async () => {
    const result = await checkDailyBudget(fakeDbWithSum("1.42"));
    expect(result.ok).toBe(false);
    expect(result.spent).toBeCloseTo(1.42);
  });

  it("treats a null sum as zero spend (no ai_runs today)", async () => {
    const result = await checkDailyBudget(fakeDbWithSum(null));
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(0);
  });
});

describe("utcMidnight", () => {
  it("returns 00:00:00 UTC for the given date's day", () => {
    const noonUtc = new Date(Date.UTC(2026, 4, 22, 12, 34, 56));
    const midnight = utcMidnight(noonUtc);
    expect(midnight.getUTCHours()).toBe(0);
    expect(midnight.getUTCMinutes()).toBe(0);
    expect(midnight.getUTCSeconds()).toBe(0);
    expect(midnight.getUTCDate()).toBe(22);
    expect(midnight.getUTCMonth()).toBe(4);
    expect(midnight.getUTCFullYear()).toBe(2026);
  });
});
