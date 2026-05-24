/**
 * Single source of truth for the AI model + budget cap.
 *
 * Bumping the model or the cap is a deliberate code change; keeping
 * these in one tiny module means every consumer (the budget check, the
 * client wrapper, the ai_runs writer) imports from the same constant
 * and nothing drifts.
 *
 * `PROMPT_VERSION` lives here too — it tags every `enrichments` row so
 * re-prompting at v1.1.0 leaves the v1.0.0 row untouched (the
 * enrichments table's unique index is `(listing_id, prompt_version)`).
 */

export const AI_BUDGET = {
  model: "claude-haiku-4-5" as const,
  dailyUsd: 1.0,
} as const;

/**
 * Haiku 4.5 token pricing in USD per million tokens.
 *
 * Kept alongside the model id so a model change forces a pricing
 * review: bumping `AI_BUDGET.model` without touching the rates would
 * silently misreport `ai_runs.cost_usd`.
 */
export const HAIKU_4_5_INPUT_USD_PER_MTOK = 1.0;
export const HAIKU_4_5_OUTPUT_USD_PER_MTOK = 5.0;

/**
 * v2.0.0 — schema rewrite. Drops duplicate boolean features (hasGarden,
 * allowsPets, …) and the text-only floorplan readout in favour of
 * grounded highlights[] / watchouts[] + a one-sentence summary. The
 * prompt now receives the full structured + enriched context, not just
 * description + key features. See `src/lib/ai/prompt.ts` for details.
 */
export const PROMPT_VERSION = "v2.0.0" as const;
