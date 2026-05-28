/**
 * Per-listing AI enrichment task.
 *
 * Triggered fire-and-forget from `scrapeDetailTask.onSuccess` once a
 * detail-page scrape has populated `listings.rawJson` with the rich
 * `ListingDetail` shape (description, key features, floorplan URL, …).
 *
 * v2 (PROMPT_VERSION=v2.0.0) feeds the model far more than v1 did. The
 * task now gathers, in addition to the listing's own row:
 *
 *   - The cluster's other listings on different portals (for cross-portal
 *     price spread context).
 *   - Any existing geo enrichments on the headline listing's enrichment
 *     row (EPC, commute, broadband, crime, amenities, flood) so the model
 *     can reason about commute time, fibre availability, crime counts,
 *     etc. instead of guessing them from the description.
 *
 * The geo enrichments are written by sibling cluster tasks
 * (`enrich-epc.ts`, `enrich-commute.ts`, `enrich-broadband.ts`,
 * `enrich-crime.ts`, `enrich-amenities.ts`, `enrich-flood.ts`). They
 * key on `(listing_id, prompt_version)` so we look them up under the
 * v2 prompt version; if v2 is fresh and no row exists yet, we fall back
 * to whatever exists at any version (best-effort — geo data is geo data
 * regardless of which prompt is reading it).
 *
 * Flow:
 *
 *   1. Pre-flight `checkDailyBudget`. If at-or-over the $1/day cap,
 *      write a failure ai_runs row and return.
 *
 *   2. Load the listing + its raw JSON. If the row is missing or has
 *      no description, write a failure row (no grounding text → no point
 *      calling the model).
 *
 *   3. Gather context: cluster listings (for portal spread + cheapest)
 *      and any existing enrichment row for geo data.
 *
 *   4. INSERT ai_runs row in `running` state. Keyed on `ctx.run.id` so
 *      onFailure can finalise it.
 *
 *   5. Call `extractFeatures`. Zod-validates the tool response.
 *
 *   6. UPSERT enrichments row keyed on `(listing_id, prompt_version)`.
 *      Sets `features` + `aiRunId`. Existing geo fields stay untouched
 *      because we only set the columns we own here.
 *
 *   7. UPDATE ai_runs with status=success, cost, tokens, finished_at.
 */

import { logger, task } from "@trigger.dev/sdk";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { checkDailyBudget } from "../lib/ai/budget";
import { extractFeatures } from "../lib/ai/client";
import { AI_BUDGET, PROMPT_VERSION } from "../lib/ai/config";
import type {
  AmenitiesInput,
  CrimeInput,
  EnrichmentInput,
  ExtractContext,
  FloodInput,
  PortalSpreadRow,
  PromptNearestStation,
  PromptTenantPreferences,
} from "../lib/ai/prompt";
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
 * convenience.
 */
function readListingDetail(rawJson: unknown): ListingDetail | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  return rawJson as ListingDetail;
}

/** Project an Enrichment row's `crime` JSONB to the model-facing shape. */
function toCrimeInput(
  raw: typeof schema.enrichments.$inferSelect.crime
): CrimeInput | null {
  if (!raw) {
    return null;
  }
  const top = Object.entries(raw.byCategory ?? {})
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return { month: raw.month, total: raw.total, topCategories: top };
}

function toBroadbandInput(
  raw: typeof schema.enrichments.$inferSelect.broadband
): EnrichmentInput | null {
  if (!raw) {
    return null;
  }
  return {
    technology: raw.technology,
    downloadMbps: raw.downloadMbps,
    uploadMbps: raw.uploadMbps,
    fttpAvailable: raw.fttpAvailable,
  };
}

function toAmenitiesInput(
  raw: typeof schema.enrichments.$inferSelect.amenities
): AmenitiesInput | null {
  if (!raw) {
    return null;
  }
  return { withinMeters: raw.withinMeters, counts: raw.counts };
}

function toFloodInput(
  raw: typeof schema.enrichments.$inferSelect.flood
): FloodInput | null {
  if (!raw) {
    return null;
  }
  return { riskLevel: raw.riskLevel };
}

function toNearestStations(value: unknown): PromptNearestStation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (s): s is Record<string, unknown> => Boolean(s) && typeof s === "object"
    )
    .map((s) => ({
      name: typeof s.name === "string" ? s.name : "",
      distanceMiles:
        typeof s.distanceMiles === "number" ? s.distanceMiles : null,
      types: Array.isArray(s.types)
        ? (s.types.filter((t) => typeof t === "string") as string[])
        : [],
    }))
    .filter((s) => s.name);
}

function toTenantPreferences(value: unknown): PromptTenantPreferences | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const pick = (k: string): boolean | null => {
    const v = obj[k];
    return typeof v === "boolean" ? v : null;
  };
  const out: PromptTenantPreferences = {
    studentsAccepted: pick("studentsAccepted"),
    familiesAccepted: pick("familiesAccepted"),
    petsAccepted: pick("petsAccepted"),
    smokersAccepted: pick("smokersAccepted"),
    dssAccepted: pick("dssAccepted"),
  };
  const anySet = Object.values(out).some((v) => v !== null);
  return anySet ? out : null;
}

function toEpcCurrent(
  raw: typeof schema.enrichments.$inferSelect.epc
): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as { currentRating?: unknown };
  return typeof obj.currentRating === "string" ? obj.currentRating : null;
}

function toEpcPotential(
  raw: typeof schema.enrichments.$inferSelect.epc
): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as { potentialRating?: unknown };
  return typeof obj.potentialRating === "string" ? obj.potentialRating : null;
}

function toCommuteMinutes(
  raw: typeof schema.enrichments.$inferSelect.commuteMinutes
): Record<string, number> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Build the per-portal spread for the cluster. The cheapest row gets
 * `deltaFromCheapest: 0`; others get their delta vs the cheapest.
 */
function buildPortalSpread(
  rows: (typeof schema.listings.$inferSelect)[]
): PortalSpreadRow[] {
  if (rows.length === 0) {
    return [];
  }
  const prices = rows
    .map((r) => r.priceMonthly)
    .filter((p): p is number => typeof p === "number");
  const cheapest = prices.length > 0 ? Math.min(...prices) : null;
  return rows.map((r) => ({
    portal: r.portal,
    priceMonthly: r.priceMonthly,
    deltaFromCheapest:
      cheapest !== null && r.priceMonthly !== null
        ? r.priceMonthly - cheapest
        : null,
  }));
}

export const enrichAiTask = task({
  id: "enrich-ai",
  queue: scrapeQueue,
  maxDuration: 120,

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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear, well-commented pipeline; splitting would obscure the order of writes vs reads.
  run: async (payload: EnrichAiPayload, { ctx }): Promise<EnrichAiOutput> => {
    const db = getDb();
    const { listingId } = payload;
    const runId = ctx.run.id;

    // STEP 1: pre-flight budget.
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

    // STEP 2: load the listing + its raw_json.
    const listing = await db.query.listings.findFirst({
      where: (l, { eq: eqOp }) => eqOp(l.id, listingId),
    });
    if (!listing) {
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

    // STEP 3: gather context — sibling cluster listings + any existing
    // enrichment row for this listing (sourced for geo data).
    const clusterListings = listing.clusterId
      ? await db
          .select()
          .from(schema.listings)
          .where(eq(schema.listings.clusterId, listing.clusterId))
      : [listing];

    // Take whichever enrichment row exists at the highest prompt version
    // — geo fields are written by sibling tasks and don't change with
    // prompt revisions, so the newest row is the best source.
    const existingEnrichmentRows = await db
      .select()
      .from(schema.enrichments)
      .where(eq(schema.enrichments.listingId, listingId))
      .orderBy(desc(schema.enrichments.promptVersion))
      .limit(1);
    const geo = existingEnrichmentRows[0];

    const context: ExtractContext = {
      listing: {
        portal: detail.portal,
        title: detail.title,
        addressRaw: detail.addressRaw,
        postcode: detail.postcode ?? listing.postcode ?? null,
        priceMonthly: detail.priceMonthly ?? listing.priceMonthly ?? null,
        bedrooms: detail.bedrooms ?? listing.bedrooms ?? null,
        bathrooms: detail.bathrooms ?? listing.bathrooms ?? null,
        propertyType: detail.propertyType ?? listing.propertyType ?? null,
        sizeSqFt: detail.sizeSqFt ?? listing.sizeSqFt ?? null,
        councilTaxBand: detail.councilTaxBand ?? listing.councilTaxBand ?? null,
        publishedAt: detail.publishedAt ?? null,
        description: detail.description ?? null,
        keyFeatures: detail.keyFeatures ?? [],
        tags: detail.tags ?? [],
        furnished: detail.furnished ?? null,
        deposit: detail.deposit ?? null,
        minimumTermMonths: detail.minimumTermMonths ?? null,
        letType: detail.letType ?? null,
        billsIncluded:
          typeof detail.billsIncluded === "boolean"
            ? detail.billsIncluded
            : null,
        serviceChargeAnnual: detail.serviceChargeAnnual ?? null,
        groundRentAnnual: detail.groundRentAnnual ?? null,
        feesText: detail.feesText ?? null,
        agentName: detail.agentName ?? null,
        epcRatingFromPortal: detail.epcRating ?? null,
        floorplanUrl: detail.floorplanUrl ?? null,
        nearestStations: toNearestStations(detail.nearestStations),
        tenantPreferences: toTenantPreferences(detail.tenantPreferences),
        materialInfo: detail.materialInfo
          ? {
              heating: detail.materialInfo.heating ?? null,
              parking: detail.materialInfo.parking ?? null,
              garden: detail.materialInfo.garden ?? null,
              electricity: detail.materialInfo.electricity ?? null,
              water: detail.materialInfo.water ?? null,
              sewerage: detail.materialInfo.sewerage ?? null,
              accessibility: detail.materialInfo.accessibility ?? null,
            }
          : null,
        floodDisclosure: detail.floodDisclosure
          ? {
              floodedInLastFiveYears:
                detail.floodDisclosure.floodedInLastFiveYears ?? null,
              floodDefences: detail.floodDisclosure.floodDefences ?? null,
              floodSources: detail.floodDisclosure.floodSources ?? [],
            }
          : null,
        listedBuilding:
          typeof detail.listedBuilding === "boolean"
            ? detail.listedBuilding
            : null,
        councilTaxExempt:
          typeof detail.councilTaxExempt === "boolean"
            ? detail.councilTaxExempt
            : null,
        agentAffiliations: detail.agentAffiliations ?? [],
      },
      enrichment: {
        epcCurrent: toEpcCurrent(geo?.epc ?? null),
        epcPotential: toEpcPotential(geo?.epc ?? null),
        commuteMinutes: toCommuteMinutes(geo?.commuteMinutes ?? null),
        broadband: toBroadbandInput(geo?.broadband ?? null),
        crime: toCrimeInput(geo?.crime ?? null),
        amenities: toAmenitiesInput(geo?.amenities ?? null),
        flood: toFloodInput(geo?.flood ?? null),
      },
      portalSpread: buildPortalSpread(clusterListings),
    };

    // STEP 4: INSERT ai_runs row in `running` state.
    //
    // `id` is the stable Trigger run id, so on a retried attempt this row
    // already exists — without onConflictDoNothing the re-insert hits a
    // duplicate-PK error that masks the real first-attempt failure and
    // prevents the retry from ever reaching the Anthropic call.
    await db
      .insert(schema.aiRuns)
      .values({
        id: runId,
        listingId,
        promptVersion: PROMPT_VERSION,
        model: AI_BUDGET.model,
        status: "running",
      })
      .onConflictDoNothing({ target: schema.aiRuns.id });

    // STEP 5: call Anthropic.
    const { ANTHROPIC_API_KEY } = env();
    logger.log("enrich-ai: calling Anthropic", {
      listingId,
      model: AI_BUDGET.model,
      promptVersion: PROMPT_VERSION,
      hasGeo: Boolean(geo),
    });
    const result = await extractFeatures({
      context,
      apiKey: ANTHROPIC_API_KEY,
    });

    // STEP 6: upsert enrichments. The row may already exist at this
    // prompt version if a sibling geo task wrote it first; in that case
    // we patch our two columns (features + aiRunId) and leave the geo
    // fields untouched.
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
      .onConflictDoUpdate({
        target: [
          schema.enrichments.listingId,
          schema.enrichments.promptVersion,
        ],
        set: {
          features: result.features as unknown as FeaturesJson,
          aiRunId: runId,
        },
      });

    // STEP 7: finalise ai_runs as success.
    await db
      .update(schema.aiRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd.toFixed(6),
      })
      .where(and(eq(schema.aiRuns.id, runId)));

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
