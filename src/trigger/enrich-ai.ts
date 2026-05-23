/**
 * Per-listing AI enrichment task.
 *
 * Triggered fire-and-forget from `scrapeDetailTask.onSuccess` once a
 * detail-page scrape has populated `listings.rawJson` with the rich
 * `ListingDetail` shape (description, key features, floorplan URL).
 *
 * Flow:
 *
 *   1. Pre-flight `checkDailyBudget`. If we're at or over the $1/day
 *      cap, write an `ai_runs` row with `status='failure'` and
 *      `errorMessage='daily_budget_exceeded'` and return. This is the
 *      one path where a failure row exists with NO Anthropic call
 *      having been attempted — admin runs feed surfaces it explicitly.
 *
 *   2. Load the listing + its detail blob from `listings.rawJson`. If
 *      the row doesn't exist or the description is empty, write a
 *      failure row (the AI has nothing to ground against — calling it
 *      anyway would burn budget on a no-op).
 *
 *   3. INSERT an `ai_runs` row with `status='running'`, model,
 *      promptVersion. Keyed on `ctx.run.id` so onFailure can find it
 *      without needing run-body state.
 *
 *   4. Call `extractFeatures`. The tool-call path validates the
 *      payload with Zod inside the client wrapper; a schema-violating
 *      response throws here and routes to onFailure.
 *
 *   5. INSERT an `enrichments` row keyed on
 *      `(listing_id, prompt_version)`. `ON CONFLICT DO NOTHING` — if
 *      we've already enriched this listing at the current prompt
 *      version, skip silently (re-runs are idempotent).
 *
 *   6. UPDATE `ai_runs` with status=success, cost, tokens, finished_at.
 *
 * EPC enrichment lives in a sibling task (`enrich-epc.ts`) and fires
 * per-cluster from `clusterTask.onSuccess`. AI fires per-listing
 * because the inputs (description, key features) are listing-scoped,
 * not building-scoped — two portal listings for the same flat will
 * have different copy.
 */

import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { checkDailyBudget } from "../lib/ai/budget";
import { extractFeatures } from "../lib/ai/client";
import { AI_BUDGET, PROMPT_VERSION } from "../lib/ai/config";
import { env } from "../lib/env";
import type { ListingDetail } from "../lib/parsers/types";
import { scrapeQueue } from "./queues";

export type EnrichAiPayload = {
  listingId: string;
};

export type EnrichAiOutput = {
  listingId: string;
  aiRunId: string;
  status: "success" | "skipped";
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Cast the JSONB blob written by scrape-detail back to ListingDetail.
 * scrape-detail writes the parser output into `listings.rawJson`, so
 * this is structurally safe — the cast is purely a TypeScript
 * convenience. If a future migration changes the shape of rawJson,
 * the Zod-validated tool call downstream will catch the regression.
 */
function readListingDetail(rawJson: unknown): ListingDetail | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  return rawJson as ListingDetail;
}

export const enrichAiTask = task({
  id: "enrich-ai",
  queue: scrapeQueue,
  maxDuration: 120,

  /**
   * onFailure mirrors scrape-detail: finalise the ai_runs row keyed on
   * `ctx.run.id` so we don't lose a failed enrichment in the admin
   * feed. If the row was never INSERTed (e.g. budget short-circuit
   * threw before step 3), the UPDATE simply touches zero rows.
   */
  onFailure: async ({
    error,
    ctx,
  }: {
    error: unknown;
    ctx: { run: { id: string } };
  }) => {
    const db = getDb();
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.aiRuns)
      .set({
        status: "failure",
        finishedAt: new Date(),
        errorMessage: message.slice(0, 1000),
      })
      .where(eq(schema.aiRuns.id, ctx.run.id));
  },

  run: async (payload: EnrichAiPayload, { ctx }): Promise<EnrichAiOutput> => {
    const db = getDb();
    const { listingId } = payload;
    const runId = ctx.run.id;

    // STEP 1: pre-flight budget. If we're capped, INSERT a failure row
    // and return — we don't even want to load the listing. Returning
    // early instead of throwing keeps the ai_runs row's terminal state
    // ("daily_budget_exceeded") accurate; throwing would route through
    // onFailure which would clobber it with the throw's message.
    const budget = await checkDailyBudget(db);
    if (!budget.ok) {
      await db.insert(schema.aiRuns).values({
        id: runId,
        listingId,
        promptVersion: PROMPT_VERSION,
        model: AI_BUDGET.model,
        status: "failure",
        finishedAt: new Date(),
        errorMessage: "daily_budget_exceeded",
      });
      logger.warn("enrich-ai: daily budget exceeded, skipping", {
        listingId,
        spent: budget.spent,
        cap: budget.cap,
      });
      return {
        listingId,
        aiRunId: runId,
        status: "skipped",
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    // STEP 2: load the listing + its detail blob.
    const listing = await db.query.listings.findFirst({
      where: (l, { eq: eqOp }) => eqOp(l.id, listingId),
    });
    if (!listing) {
      // No listing → record a failure with a clear reason. We don't
      // throw because the listing being missing isn't an exception
      // worth retrying — the row was deleted between trigger and run.
      await db.insert(schema.aiRuns).values({
        id: runId,
        listingId,
        promptVersion: PROMPT_VERSION,
        model: AI_BUDGET.model,
        status: "failure",
        finishedAt: new Date(),
        errorMessage: "listing_not_found",
      });
      return {
        listingId,
        aiRunId: runId,
        status: "skipped",
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    const detail = readListingDetail(listing.rawJson);
    if (!detail || !detail.description) {
      // No description = the model has nothing to ground against.
      // Skipping here saves ~$0.001 per empty-detail call.
      await db.insert(schema.aiRuns).values({
        id: runId,
        listingId,
        promptVersion: PROMPT_VERSION,
        model: AI_BUDGET.model,
        status: "failure",
        finishedAt: new Date(),
        errorMessage: "missing_listing_detail",
      });
      logger.warn("enrich-ai: listing.rawJson lacks a description, skipping", {
        listingId,
      });
      return {
        listingId,
        aiRunId: runId,
        status: "skipped",
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    // STEP 3: INSERT ai_runs row in `running` state. Keyed on
    // ctx.run.id so onFailure can find it.
    await db.insert(schema.aiRuns).values({
      id: runId,
      listingId,
      promptVersion: PROMPT_VERSION,
      model: AI_BUDGET.model,
      status: "running",
    });

    // STEP 4: call Anthropic. Errors here route through onFailure.
    const { ANTHROPIC_API_KEY } = env();
    logger.log("enrich-ai: calling Anthropic", {
      listingId,
      model: AI_BUDGET.model,
    });
    const result = await extractFeatures({
      listingDetail: detail,
      apiKey: ANTHROPIC_API_KEY,
    });

    // STEP 5: write enrichments. ON CONFLICT (listing_id, prompt_version)
    // DO NOTHING — if a row already exists at this prompt version we
    // leave it alone. Re-prompting at v1.1.0 would write a new row.
    //
    // The cast: `enrichments.features` declares its `$type<>` with
    // optional booleans (`hasGarden?: boolean`), but our Zod schema
    // returns the explicit tri-state `boolean | null` — a deliberately
    // wider shape so we can distinguish "model couldn't tell" from
    // "field absent". The JSONB column accepts both at runtime; the
    // cast is just a TS-level reconciliation.
    type FeaturesJson = typeof schema.enrichments.$inferInsert.features;
    await db
      .insert(schema.enrichments)
      .values({
        id: nanoid(),
        listingId,
        promptVersion: PROMPT_VERSION,
        features: result.features as unknown as FeaturesJson,
        aiRunId: runId,
      })
      .onConflictDoNothing({
        target: [
          schema.enrichments.listingId,
          schema.enrichments.promptVersion,
        ],
      });

    // STEP 6: finalise ai_runs as success with the cost + tokens.
    await db
      .update(schema.aiRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd.toFixed(6),
      })
      .where(eq(schema.aiRuns.id, runId));

    logger.log("enrich-ai: done", {
      listingId,
      costUsd: result.costUsd,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return {
      listingId,
      aiRunId: runId,
      status: "success",
      costUsd: result.costUsd,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  },
});
