/**
 * Single source of truth for the AI model.
 *
 * Bumping the model is a deliberate code change; keeping it in one tiny
 * module means every consumer (the client wrapper, the ai_runs writer)
 * imports from the same constant and nothing drifts.
 *
 * There is intentionally no daily spend cap: enrichment is a one-shot
 * Haiku call per listing (~$0.005) over a few hundred listings total, so
 * a cap only ever served to silently drop listings into a permanent
 * un-enriched state. `enrich-ai-sweep` re-fires any listing still
 * missing its AI read instead.
 *
 * `PROMPT_VERSION` lives here too — it tags every `enrichments` row so
 * re-prompting at v1.1.0 leaves the v1.0.0 row untouched (the
 * enrichments table's unique index is `(listing_id, prompt_version)`).
 */

export const AI_BUDGET = {
  model: "claude-haiku-4-5" as const,
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
 * Bumps:
 *   - v2.0.0 — schema rewrite. Drops duplicate boolean features
 *     (hasGarden, allowsPets, …) and the text-only floorplan readout in
 *     favour of grounded highlights[] / watchouts[] + a one-sentence
 *     summary. The prompt now receives the full structured + enriched
 *     context, not just description + key features.
 *   - v2.1.0 — relevance pass. The prompt now enforces a "would this
 *     change a decision?" bar with an explicit don't-surface list
 *     (bills-not-included, deposit at legal floor, restated specs,
 *     pending enrichment, typical minimum terms) derived from
 *     empirical noise in the prod enrichments table. Schema unchanged.
 *     A `feature-filter.ts` denylist applies the same rules at read
 *     time, so the existing v2.0.0 rows benefit without re-running AI.
 *   - v2.2.0 — transport grounding + deposit hardening. The context now
 *     carries `enrichment.stationRoutes` (real Google-routed walk/transit
 *     minutes) and the prompt forbids citing any station/commute time
 *     that isn't from routed data — killing the "5-min walk … 0.6 miles"
 *     class of hallucination where the model lifted marketing copy or
 *     converted a straight-line distance. `feature-filter.ts` also drops
 *     ANY at/near/below-cap deposit watchout (not just exact-match
 *     phrasings) unless our computed `depositOverCap` is true. Re-running
 *     AI is required to populate the new context for existing rows.
 *
 * See `src/lib/ai/prompt.ts` for the prompt text and
 * `src/lib/ai/feature-filter.ts` for the render-time filter.
 */
export const PROMPT_VERSION = "v2.2.0" as const;
