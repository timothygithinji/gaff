/**
 * Admin dashboard server functions — PR 9.5.
 *
 * Powers `/admin` (the four metric cards + recent runs) and `/admin/runs`
 * (a deeper "see all" view of the same runs union). Everything here is
 * read-only and household-scoped: the dashboard reflects work happening
 * on behalf of the caller's household, so the totals on screen line up
 * with what their schedules + searches actually produced.
 *
 * The runs feed is a UNION ALL across `scrape_runs` + `ai_runs` with a
 * `kind` discriminator. We hand the rows back ordered by `started_at
 * DESC` and let the client filter — the filter pills don't refire the
 * query, they just slice the cached list.
 *
 * Authorisation: caller must be in a household. Owner-vs-member gating
 * for the admin routes themselves lives client-side in the route
 * components (they consult `useHousehold().isOwner`); the server still
 * enforces household scoping so a non-owner who hand-rolls a request
 * gets back only their household's data, not someone else's.
 */
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  aiRuns,
  type enrichments,
  listings,
  type propertyClusters,
  scrapeRuns,
  searches,
} from "../../../db/schema";
import type { Env } from "../../server";
import { getCurrentUser } from "./session";

// -----------------------------------------------------------------------------
// Wire types
// -----------------------------------------------------------------------------

export type AdminMetrics = {
  spendThisMonth: {
    totalUsd: number;
    budgetUsd: number;
    percentUsed: number;
    sparkline: number[];
    deltaVsLastMonth: number;
  };
  listingsIngested24h: {
    total: number;
    ofGrandTotal: number;
    byPortal: { rightmove: number; zoopla: number; openrent: number };
  };
  aiCallsToday: {
    total: number;
    spentUsd: number;
    byModel: Array<{ model: string; count: number }>;
  };
  dedupeCrossPortal: {
    collapsedPct: number;
    threePortalClusters: number;
    twoPortalClusters: number;
    soloListings: number;
  };
};

export type RunRow = {
  id: string;
  task: string;
  modelLabel?: string;
  target: string;
  startedAt: Date;
  duration?: number;
  costUsd?: number;
  status: "running" | "success" | "failure";
  kind: "scrape" | "ai";
};

/**
 * Hardcoded monthly budget cap for v1. Lives here (not in env) because
 * it's a product-policy number, not a deployment setting — bumping it
 * is a deliberate code change and should land with whatever messaging
 * we decide to surface alongside it.
 */
const MONTHLY_BUDGET_USD = 15.0;

// -----------------------------------------------------------------------------
// Authz helper — mirrors `searches.ts:requireHouseholdId`.
// -----------------------------------------------------------------------------

async function requireHouseholdId(): Promise<string> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("unauthorized");
  }
  const db = getDb(env as unknown as Env);
  const membership = await db.query.householdMembers.findFirst({
    where: (hm, { eq: eqOp }) => eqOp(hm.userId, session.userId),
  });
  if (!membership) {
    throw new Error("no_household");
  }
  return membership.householdId;
}

// -----------------------------------------------------------------------------
// Model-label resolver
// -----------------------------------------------------------------------------

/**
 * Friendly label for a `model` column value. The DB stores raw model
 * ids like `claude-haiku-4-5`; the UI wants "Haiku 4.5". Unknown
 * values fall through to the raw string so a new model lands visible
 * (just unstyled) instead of disappearing.
 */
function modelLabelFor(model: string): string {
  if (model.includes("haiku-4-5")) {
    return "Haiku 4.5";
  }
  if (model.includes("haiku")) {
    return "Haiku";
  }
  if (model.includes("sonnet")) {
    return "Sonnet";
  }
  if (model === "epc") {
    return "EPC";
  }
  return model;
}

/**
 * Friendly label for a scrape_runs row. Today the only signal we have
 * is the portal — Zyte tier (HTTP vs browser) isn't on the row. v1.1
 * may add a column; for now we just say "Zyte" + portal.
 */
function scrapeModelLabelFor(portal: string): string {
  return `Zyte · ${portal}`;
}

// -----------------------------------------------------------------------------
// adminMetrics
// -----------------------------------------------------------------------------

type Db = ReturnType<typeof getDb>;

type TimeWindows = {
  now: Date;
  startOfMonth: Date;
  startOfLastMonth: Date;
  endOfLastMonth: Date;
  last24h: Date;
  last30d: Date;
  startOfToday: Date;
};

function buildTimeWindows(): TimeWindows {
  const now = new Date();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  return {
    now,
    startOfMonth,
    startOfLastMonth: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    ),
    endOfLastMonth: startOfMonth,
    last24h: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    last30d: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    startOfToday: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ),
  };
}

/**
 * SUM(scrape_runs.cost) + SUM(ai_runs.cost) for the given window, for
 * runs belonging to a search this household owns. Extracted so the
 * "this month" and "last month" totals can share the same shape.
 */
async function totalSpendInWindow(
  db: Db,
  householdId: string,
  start: Date,
  end: Date | null
): Promise<number> {
  const scrapeWhere = end
    ? and(
        eq(searches.householdId, householdId),
        gte(scrapeRuns.startedAt, start),
        sql`${scrapeRuns.startedAt} < ${end}`
      )
    : and(
        eq(searches.householdId, householdId),
        gte(scrapeRuns.startedAt, start)
      );
  const aiWhere = end
    ? and(
        eq(searches.householdId, householdId),
        gte(aiRuns.startedAt, start),
        sql`${aiRuns.startedAt} < ${end}`
      )
    : and(eq(searches.householdId, householdId), gte(aiRuns.startedAt, start));

  const [scrapeRow, aiRow] = await Promise.all([
    db
      .select({ total: sql<string>`COALESCE(SUM(${scrapeRuns.costUsd}), 0)` })
      .from(scrapeRuns)
      .innerJoin(searches, eq(searches.id, scrapeRuns.searchId))
      .where(scrapeWhere),
    db
      .select({ total: sql<string>`COALESCE(SUM(${aiRuns.costUsd}), 0)` })
      .from(aiRuns)
      .innerJoin(listings, eq(listings.id, aiRuns.listingId))
      .innerJoin(searches, eq(searches.id, listings.searchId))
      .where(aiWhere),
  ]);
  return Number(scrapeRow[0]?.total ?? 0) + Number(aiRow[0]?.total ?? 0);
}

async function computeSpendMetric(
  db: Db,
  householdId: string,
  w: TimeWindows
): Promise<AdminMetrics["spendThisMonth"]> {
  const [totalUsd, lastMonthTotal, sparkRows] = await Promise.all([
    totalSpendInWindow(db, householdId, w.startOfMonth, null),
    totalSpendInWindow(db, householdId, w.startOfLastMonth, w.endOfLastMonth),
    loadSparklineRows(db, householdId, w.last30d),
  ]);
  const deltaVsLastMonth =
    lastMonthTotal === 0
      ? 0
      : ((totalUsd - lastMonthTotal) / lastMonthTotal) * 100;
  return {
    totalUsd,
    budgetUsd: MONTHLY_BUDGET_USD,
    percentUsed: (totalUsd / MONTHLY_BUDGET_USD) * 100,
    sparkline: buildSparkline(sparkRows, w.last30d, w.now),
    deltaVsLastMonth,
  };
}

async function loadSparklineRows(
  db: Db,
  householdId: string,
  since: Date
): Promise<Array<{ startedAt: Date; costUsd: number }>> {
  const [scrapeRows, aiRows] = await Promise.all([
    db
      .select({
        startedAt: scrapeRuns.startedAt,
        costUsd: scrapeRuns.costUsd,
      })
      .from(scrapeRuns)
      .innerJoin(searches, eq(searches.id, scrapeRuns.searchId))
      .where(
        and(
          eq(searches.householdId, householdId),
          gte(scrapeRuns.startedAt, since)
        )
      ),
    db
      .select({
        startedAt: aiRuns.startedAt,
        costUsd: aiRuns.costUsd,
      })
      .from(aiRuns)
      .innerJoin(listings, eq(listings.id, aiRuns.listingId))
      .innerJoin(searches, eq(searches.id, listings.searchId))
      .where(
        and(eq(searches.householdId, householdId), gte(aiRuns.startedAt, since))
      ),
  ]);
  return [...scrapeRows, ...aiRows].map((r) => ({
    startedAt: r.startedAt,
    costUsd: r.costUsd ? Number(r.costUsd) : 0,
  }));
}

async function computeIngestedMetric(
  db: Db,
  householdId: string,
  w: TimeWindows
): Promise<{
  metric: AdminMetrics["listingsIngested24h"];
  grandTotal: number;
}> {
  const [ingestedRows, grandTotalRow] = await Promise.all([
    db
      .select({
        portal: listings.portal,
        count: sql<string>`COUNT(*)`,
      })
      .from(listings)
      .innerJoin(searches, eq(searches.id, listings.searchId))
      .where(
        and(
          eq(searches.householdId, householdId),
          gte(listings.firstSeenAt, w.last24h)
        )
      )
      .groupBy(listings.portal),
    db
      .select({ count: sql<string>`COUNT(*)` })
      .from(listings)
      .innerJoin(searches, eq(searches.id, listings.searchId))
      .where(eq(searches.householdId, householdId)),
  ]);

  const byPortal = { rightmove: 0, zoopla: 0, openrent: 0 };
  for (const row of ingestedRows) {
    const key = row.portal as keyof typeof byPortal;
    if (key in byPortal) {
      byPortal[key] = Number(row.count);
    }
  }
  const total24h = byPortal.rightmove + byPortal.zoopla + byPortal.openrent;
  const grandTotal = Number(grandTotalRow[0]?.count ?? 0);
  return {
    metric: {
      total: total24h,
      ofGrandTotal: grandTotal,
      byPortal,
    },
    grandTotal,
  };
}

async function computeAiCallsMetric(
  db: Db,
  householdId: string,
  w: TimeWindows
): Promise<AdminMetrics["aiCallsToday"]> {
  const [aiTodayRows, aiTodayCost] = await Promise.all([
    db
      .select({
        model: aiRuns.model,
        count: sql<string>`COUNT(*)`,
      })
      .from(aiRuns)
      .innerJoin(listings, eq(listings.id, aiRuns.listingId))
      .innerJoin(searches, eq(searches.id, listings.searchId))
      .where(
        and(
          eq(searches.householdId, householdId),
          gte(aiRuns.startedAt, w.startOfToday)
        )
      )
      .groupBy(aiRuns.model),
    db
      .select({ total: sql<string>`COALESCE(SUM(${aiRuns.costUsd}), 0)` })
      .from(aiRuns)
      .innerJoin(listings, eq(listings.id, aiRuns.listingId))
      .innerJoin(searches, eq(searches.id, listings.searchId))
      .where(
        and(
          eq(searches.householdId, householdId),
          gte(aiRuns.startedAt, w.startOfToday)
        )
      ),
  ]);
  const total = aiTodayRows.reduce((sum, r) => sum + Number(r.count), 0);
  return {
    total,
    spentUsd: Number(aiTodayCost[0]?.total ?? 0),
    byModel: aiTodayRows.map((r) => ({
      model: modelLabelFor(r.model),
      count: Number(r.count),
    })),
  };
}

async function computeDedupeMetric(
  db: Db,
  householdId: string,
  grandTotal: number
): Promise<AdminMetrics["dedupeCrossPortal"]> {
  const clusterPortalRows = await db
    .select({
      clusterId: listings.clusterId,
      portal: listings.portal,
    })
    .from(listings)
    .innerJoin(searches, eq(searches.id, listings.searchId))
    .where(eq(searches.householdId, householdId))
    .groupBy(listings.clusterId, listings.portal);

  return bucketDedupe(clusterPortalRows, grandTotal);
}

function bucketDedupe(
  rows: Array<{ clusterId: string | null; portal: string }>,
  grandTotal: number
): AdminMetrics["dedupeCrossPortal"] {
  const portalsPerCluster = new Map<string, Set<string>>();
  let listingsWithoutCluster = 0;
  for (const row of rows) {
    if (!row.clusterId) {
      listingsWithoutCluster += 1;
      continue;
    }
    const set = portalsPerCluster.get(row.clusterId) ?? new Set<string>();
    set.add(row.portal);
    portalsPerCluster.set(row.clusterId, set);
  }
  let three = 0;
  let two = 0;
  let solo = 0;
  for (const set of portalsPerCluster.values()) {
    if (set.size >= 3) {
      three += 1;
    } else if (set.size === 2) {
      two += 1;
    } else {
      solo += 1;
    }
  }
  solo += listingsWithoutCluster;
  const collapsedListings = three * 3 + two * 2;
  const collapsedPct =
    grandTotal === 0 ? 0 : (collapsedListings / grandTotal) * 100;
  return {
    collapsedPct,
    threePortalClusters: three,
    twoPortalClusters: two,
    soloListings: solo,
  };
}

export const adminMetrics = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminMetrics> => {
    const householdId = await requireHouseholdId();
    const db = getDb(env as unknown as Env);
    const windows = buildTimeWindows();

    const [spend, ingested, aiCalls] = await Promise.all([
      computeSpendMetric(db, householdId, windows),
      computeIngestedMetric(db, householdId, windows),
      computeAiCallsMetric(db, householdId, windows),
    ]);
    const dedupe = await computeDedupeMetric(
      db,
      householdId,
      ingested.grandTotal
    );

    return {
      spendThisMonth: spend,
      listingsIngested24h: ingested.metric,
      aiCallsToday: aiCalls,
      dedupeCrossPortal: dedupe,
    };
  }
);

/**
 * Bucket a flat list of cost rows into 30 daily totals ending at `now`.
 * Days with no spend stay at 0. Returns oldest → newest so the SVG
 * renderer can just `path` left-to-right.
 */
function buildSparkline(
  rows: Array<{ startedAt: Date; costUsd: number }>,
  start: Date,
  end: Date
): number[] {
  const days = 30;
  const buckets = new Array<number>(days).fill(0);
  const startMs = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );
  const oneDayMs = 24 * 60 * 60 * 1000;
  const endIdx = Math.min(
    days - 1,
    Math.floor((end.getTime() - startMs) / oneDayMs)
  );
  for (const row of rows) {
    const idx = Math.floor((row.startedAt.getTime() - startMs) / oneDayMs);
    if (idx >= 0 && idx <= endIdx) {
      buckets[idx] = (buckets[idx] ?? 0) + row.costUsd;
    }
  }
  return buckets;
}

// -----------------------------------------------------------------------------
// listRecentRuns
// -----------------------------------------------------------------------------

const listRecentRunsSchema = z.object({
  filter: z.enum(["all", "scrape", "enrich", "ai"]).default("all"),
  limit: z.number().int().min(1).max(500).default(50),
});

export const listRecentRuns = createServerFn({ method: "GET" })
  .inputValidator(listRecentRunsSchema)
  .handler(async ({ data }): Promise<RunRow[]> => {
    const householdId = await requireHouseholdId();
    const db = getDb(env as unknown as Env);
    const limit = data.limit;

    const wantScrape = data.filter === "all" || data.filter === "scrape";
    // "ai" = AI calls excluding the EPC pseudo-model.
    // "enrich" = the EPC pseudo-model only.
    // "all" includes both.
    const wantAi = data.filter === "all" || data.filter === "ai";
    const wantEnrich = data.filter === "all" || data.filter === "enrich";

    // Pull rows from each side then merge in-memory. Postgres can do
    // UNION ALL natively but mixing two heterogeneous shapes through
    // Drizzle's typed builder is uglier than just running both queries
    // — they're both indexed on (started_at DESC) and the limit caps
    // memory cost.
    const scrapeRowsPromise = wantScrape
      ? db
          .select({
            id: scrapeRuns.id,
            startedAt: scrapeRuns.startedAt,
            finishedAt: scrapeRuns.finishedAt,
            status: scrapeRuns.status,
            costUsd: scrapeRuns.costUsd,
            portal: scrapeRuns.portal,
            searchName: searches.name,
            outcodes: searches.outcodes,
          })
          .from(scrapeRuns)
          .innerJoin(searches, eq(searches.id, scrapeRuns.searchId))
          .where(eq(searches.householdId, householdId))
          .orderBy(desc(scrapeRuns.startedAt))
          .limit(limit)
      : Promise.resolve([]);

    const aiRowsPromise =
      wantAi || wantEnrich
        ? db
            .select({
              id: aiRuns.id,
              startedAt: aiRuns.startedAt,
              finishedAt: aiRuns.finishedAt,
              status: aiRuns.status,
              costUsd: aiRuns.costUsd,
              model: aiRuns.model,
              listingId: aiRuns.listingId,
              listingTitle: listings.title,
              portal: listings.portal,
            })
            .from(aiRuns)
            .leftJoin(listings, eq(listings.id, aiRuns.listingId))
            .innerJoin(searches, eq(searches.id, listings.searchId))
            .where(eq(searches.householdId, householdId))
            .orderBy(desc(aiRuns.startedAt))
            .limit(limit)
        : Promise.resolve([]);

    const [scrapeData, aiData] = await Promise.all([
      scrapeRowsPromise,
      aiRowsPromise,
    ]);

    const scrapeMapped: RunRow[] = scrapeData.map((r) => ({
      id: r.id,
      kind: "scrape" as const,
      task: "scrape-search",
      modelLabel: scrapeModelLabelFor(r.portal),
      target: `${r.portal} · ${r.searchName} · ${r.outcodes.join(", ")}`,
      startedAt: r.startedAt,
      duration: durationSeconds(r.startedAt, r.finishedAt),
      costUsd: r.costUsd ? Number(r.costUsd) : undefined,
      status: r.status,
    }));

    const aiMapped: RunRow[] = aiData
      // Apply the "enrich" vs "ai" split — `epc` rows belong to enrich,
      // everything else belongs to ai. When the caller asked for "all"
      // we keep everything.
      .filter((r) => {
        if (data.filter === "all") {
          return true;
        }
        if (data.filter === "enrich") {
          return r.model === "epc";
        }
        return r.model !== "epc";
      })
      .map((r) => ({
        id: r.id,
        kind: "ai" as const,
        task: r.model === "epc" ? "enrich-epc" : "enrich-ai",
        modelLabel: modelLabelFor(r.model),
        target: r.listingTitle
          ? `listing · ${r.listingTitle}`
          : (r.listingId ?? "—"),
        startedAt: r.startedAt,
        duration: durationSeconds(r.startedAt, r.finishedAt),
        costUsd: r.costUsd ? Number(r.costUsd) : undefined,
        status: r.status,
      }));

    const merged = [...scrapeMapped, ...aiMapped]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);

    return merged;
  });

function durationSeconds(
  startedAt: Date,
  finishedAt: Date | null
): number | undefined {
  if (!finishedAt) {
    return;
  }
  const seconds = (finishedAt.getTime() - startedAt.getTime()) / 1000;
  if (seconds < 0) {
    return;
  }
  return Math.round(seconds);
}

// -----------------------------------------------------------------------------
// Counts per filter — used by the filter pills so they can show "All 42 /
// Scrape 10 / Enrich 8 / AI 24" without each pill re-running the full
// query. Cheap COUNT(*) queries; we run them in parallel.
// -----------------------------------------------------------------------------

export type RunFilterCounts = {
  all: number;
  scrape: number;
  enrich: number;
  ai: number;
};

export const runFilterCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<RunFilterCounts> => {
    const householdId = await requireHouseholdId();
    const db = getDb(env as unknown as Env);

    const [scrapeCountRow, enrichCountRow, aiCountRow] = await Promise.all([
      db
        .select({ count: sql<string>`COUNT(*)` })
        .from(scrapeRuns)
        .innerJoin(searches, eq(searches.id, scrapeRuns.searchId))
        .where(eq(searches.householdId, householdId)),
      db
        .select({ count: sql<string>`COUNT(*)` })
        .from(aiRuns)
        .innerJoin(listings, eq(listings.id, aiRuns.listingId))
        .innerJoin(searches, eq(searches.id, listings.searchId))
        .where(
          and(eq(searches.householdId, householdId), eq(aiRuns.model, "epc"))
        ),
      db
        .select({ count: sql<string>`COUNT(*)` })
        .from(aiRuns)
        .innerJoin(listings, eq(listings.id, aiRuns.listingId))
        .innerJoin(searches, eq(searches.id, listings.searchId))
        .where(
          and(
            eq(searches.householdId, householdId),
            sql`${aiRuns.model} <> 'epc'`
          )
        ),
    ]);

    const scrape = Number(scrapeCountRow[0]?.count ?? 0);
    const enrich = Number(enrichCountRow[0]?.count ?? 0);
    const ai = Number(aiCountRow[0]?.count ?? 0);
    return {
      all: scrape + enrich + ai,
      scrape,
      enrich,
      ai,
    };
  }
);

// `enrichments` and `propertyClusters` are referenced from `import` so
// type-only imports don't get pruned even if a future refactor stops
// using them directly. Keeping them out of the runtime path explicitly.
export type _AdminAdjacentTypes = {
  cluster: typeof propertyClusters.$inferSelect;
  enrichment: typeof enrichments.$inferSelect;
};
