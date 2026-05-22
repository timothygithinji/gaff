/**
 * Pre-flight daily-spend cap for AI enrichment.
 *
 * `enrichAiTask` calls `checkDailyBudget(db)` before hitting Anthropic.
 * If the SUM of today's `ai_runs.cost_usd` (counting both `running` and
 * `success` rows — the running ones are an in-flight commit we can't
 * know the final cost of yet, but they've already started accruing) is
 * at or above `AI_BUDGET.dailyUsd`, we short-circuit instead of opening
 * another paid call. The caller writes an `ai_runs` row with
 * `status='failure'` and `errorMessage='daily_budget_exceeded'` so the
 * admin runs feed surfaces the cap event explicitly.
 *
 * UTC midnight is the day boundary — chosen so a cap-reset is a single
 * predictable wall-clock moment regardless of where the Trigger.dev
 * worker runs. `BST` summer offsets would otherwise have us reset at
 * different real-world times across the year.
 */

import { and, gte, inArray, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "../../../db/schema";
import { AI_BUDGET } from "./config";

/**
 * The concrete drizzle type Gaff uses in production. Aliased here so
 * the budget helper's signature reads cleanly without dragging the
 * Neon type through every call site.
 */
export type BudgetDb = NeonHttpDatabase<typeof schema>;

export type BudgetCheckResult =
  | { ok: true; spent: number; cap: number }
  | { ok: false; spent: number; cap: number };

/** Today at 00:00:00 UTC. */
export function utcMidnight(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/**
 * SUM `cost_usd` for `ai_runs` rows started on/after UTC midnight where
 * `status IN ('running','success')`. Failures (incl. cap rejects) don't
 * count against the budget. Returns `{ ok: false }` once spend has met
 * or exceeded `AI_BUDGET.dailyUsd`.
 */
export async function checkDailyBudget(
  db: BudgetDb,
  now: Date = new Date()
): Promise<BudgetCheckResult> {
  const dayStart = utcMidnight(now);

  const rows = await db
    .select({
      sum: sql<string | null>`COALESCE(SUM(${schema.aiRuns.costUsd}), 0)`,
    })
    .from(schema.aiRuns)
    .where(
      and(
        gte(schema.aiRuns.startedAt, dayStart),
        inArray(schema.aiRuns.status, ["running", "success"])
      )
    );

  const raw = rows[0]?.sum ?? "0";
  const spent = Number(raw);
  const cap = AI_BUDGET.dailyUsd;

  if (!Number.isFinite(spent)) {
    // Treat a malformed sum as "no spend recorded" rather than blocking
    // forever — a parse failure here is a bug, not a budget event.
    return { ok: true, spent: 0, cap };
  }

  if (spent >= cap) {
    return { ok: false, spent, cap };
  }
  return { ok: true, spent, cap };
}
