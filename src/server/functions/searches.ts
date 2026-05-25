/**
 * Search CRUD server functions.
 *
 * Searches are the unit of work in Gaff — every `scrape_runs` row, every
 * `listings` row, every `swipes` row hangs off a `search_id`. They live
 * under a household (resolved from the caller's `household_members`
 * row); the household-scoping rule means a user can never see / edit
 * another household's search.
 *
 * The "where" lives on `searches.location` as a SearchLocation jsonb
 * (see `src/lib/search-location.ts`) — Google place + cached per-portal
 * tokens. Excluded places live as a jsonb array under
 * `exclude_locations`. Commute and transport targets each get their
 * own jsonb array column (`commute_targets`, `transport_targets`).
 * There is no AI-rules column — feature extraction lives in the prompt
 * itself, not as per-search toggles.
 *
 * Per-portal tokens (Rightmove locationIdentifier, Zoopla `q`, OpenRent
 * term+radius) are resolved at form-submit via `stampPortalRefs` and
 * cached on `location.portalRefs`. Resolution failures surface as
 * structured errors the form can render inline.
 *
 * Scrape cadence lives on Trigger.dev, not in our DB:
 *
 *   - `createSearch`  → INSERT + `createSchedule(externalId = search.id)`
 *   - `updateSearch`  → UPDATE + reconcile schedule by externalId
 *   - `archiveSearch` → flip `active=false` + `deactivateSchedule`
 *
 * Hard deletes are intentionally not supported — archiving (pausing the
 * schedule and flipping `active=false`) is the only destructive option
 * exposed to the user. Listings, runs, and swipes all hang off
 * `search_id`, so deleting a row would orphan that history.
 *
 * `cron: null` is the explicit "Off" sentinel — write the row with
 * `active=false` and skip schedule creation entirely.
 *
 * Place selection happens client-side via Google's Places autocomplete
 * (UK-restricted, primary types limited to postcode/locality/sublocality/
 * neighborhood). The schema here only checks the shape — the resolver
 * stack is what surfaces "no Rightmove match" etc.
 */
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { auth, tasks } from "@trigger.dev/sdk";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  type Search,
  aiRuns,
  listings,
  scrapeRuns,
  searches,
  swipes,
} from "../../../db/schema";
import {
  resolveOpenrent,
  resolveRightmove,
  resolveZoopla,
} from "../../lib/portal-locations";
import {
  type SearchLocation,
  searchLocationSchema,
} from "../../lib/search-location";
import {
  createSchedule,
  deactivateSchedule,
  findScheduleByExternalId,
  updateSchedule,
} from "./schedules";
import { getCurrentUser } from "./session";
import { requireHouseholdScope } from "./shortlist-helpers.server";

const SCRAPE_TASK_ID = "scrape-search";
const SCHEDULE_TIMEZONE = "Europe/London";

/**
 * Resolve the caller's household id, or throw. Centralising this keeps
 * every search-scoped server function honest — no way to forget the
 * authz gate.
 */
async function requireHouseholdId(): Promise<string> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("unauthorized");
  }
  const db = getDb();
  const membership = await db.query.householdMembers.findFirst({
    where: (hm, { eq: eqOp }) => eqOp(hm.userId, session.userId),
  });
  if (!membership) {
    throw new Error("no_household");
  }
  return membership.householdId;
}

/**
 * Fetch a search by id, scoped to the caller's household, or throw
 * `not_found`. Every mutating/reading search endpoint goes through this
 * so a user can never reach another household's row by guessing an id.
 */
async function findHouseholdSearch(
  db: ReturnType<typeof getDb>,
  searchId: string,
  householdId: string
) {
  const row = await db.query.searches.findFirst({
    where: (s, { eq: eqOp, and: andOp }) =>
      andOp(eqOp(s.id, searchId), eqOp(s.householdId, householdId)),
  });
  if (!row) {
    throw new Error("not_found");
  }
  return row;
}

/**
 * Best-effort environment tag for the dedup key. Lets two parallel
 * deploys (prod + a PR preview branch with shared Trigger project)
 * coexist without colliding on the same `externalId`.
 */
function envTag(): string {
  const e = env as unknown as {
    ENVIRONMENT?: string;
    BETTER_AUTH_URL?: string;
  };
  if (e.ENVIRONMENT) {
    return e.ENVIRONMENT;
  }
  if (e.BETTER_AUTH_URL?.includes("localhost")) {
    return "dev";
  }
  return "prod";
}

// -----------------------------------------------------------------------------
// Zod schemas
// -----------------------------------------------------------------------------

const portalSchema = z.enum(["rightmove", "zoopla", "openrent"]);

const commuteTargetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  lat: z.number().finite(),
  lng: z.number().finite(),
  maxMinutes: z.number().int().min(1).max(240),
  mode: z.string().trim().min(1).max(32),
});

const transportAmenitySchema = z.enum([
  "tube_station",
  "train_station",
  "bus_stop",
  "tram_stop",
]);
const transportModeSchema = z.enum(["walk", "cycle", "transit", "drive"]);
const transportTargetSchema = z.object({
  amenity: transportAmenitySchema,
  mode: transportModeSchema,
  maxMinutes: z.number().int().min(1).max(120),
});

const baseSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    portals: z.array(portalSchema).min(1, "At least one portal required"),
    location: searchLocationSchema,
    excludeLocations: z.array(searchLocationSchema).default([]),
    minBedrooms: z.number().int().min(0).max(10).nullable(),
    maxBedrooms: z.number().int().min(0).max(10).nullable(),
    minBathrooms: z.number().int().min(0).max(10).nullable(),
    maxBathrooms: z.number().int().min(0).max(10).nullable(),
    minPrice: z.number().int().min(0).max(20_000),
    maxPrice: z.number().int().min(0).max(20_000),
    /**
     * User-picked radius around the search location, in miles. The
     * form's slider produces values from a fixed Rightmove-style vocab
     * (`[0, 0.25, 0.5, 1, 3, 5, 10, 15, 20, 30, 40]`) but the server
     * accepts any finite non-negative value ≤ 40 — drift in the
     * front-end vocab shouldn't be a data-integrity failure. `0` =
     * "this area only".
     */
    radiusMiles: z.number().finite().min(0).max(40).default(0),
    propertyTypes: z.array(z.string().trim().min(1)).default([]),
    /**
     * `null` = no furnishing filter. Closed set is enforced here so we
     * never write a bogus token even if the form drifts.
     */
    furnished: z.enum(["furnished", "unfurnished"]).nullable().default(null),
    mustHaves: z.array(z.enum(["garden", "parking", "pets"])).default([]),
    /**
     * Listing categories to hide from results. Same pattern as
     * `mustHaves` but inverted in intent. Per-portal mapping in
     * `src/lib/portal-urls.ts`.
     */
    exclusions: z
      .array(z.enum(["student", "retirement", "house_share"]))
      .default([]),
    commuteTargets: z.array(commuteTargetSchema).default([]),
    transportTargets: z.array(transportTargetSchema).default([]),
    /** Cron string, or `null` for the explicit "Off" preset. */
    cron: z.string().trim().min(1).nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.minPrice > val.maxPrice) {
      ctx.addIssue({
        code: "custom",
        message: "Min price must be ≤ max price",
        path: ["minPrice"],
      });
    }
    if (
      val.minBedrooms !== null &&
      val.maxBedrooms !== null &&
      val.minBedrooms > val.maxBedrooms
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Min beds must be ≤ max beds",
        path: ["minBedrooms"],
      });
    }
    if (
      val.minBathrooms !== null &&
      val.maxBathrooms !== null &&
      val.minBathrooms > val.maxBathrooms
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Min baths must be ≤ max baths",
        path: ["minBathrooms"],
      });
    }
  });

const createSearchSchema = baseSearchSchema;

const updateSearchSchema = z
  .object({
    id: z.string().trim().min(1),
  })
  .and(baseSearchSchema);

const idSchema = z.object({ id: z.string().trim().min(1) });

// -----------------------------------------------------------------------------
// Shape stored in the `searches` row
// -----------------------------------------------------------------------------

/**
 * `SearchRow` mirrors the DB row exactly — `excludeOutcodes` is a top-
 * level text[] column, `commuteTargets` / `transportTargets` are typed
 * jsonb arrays. No further read transformation is needed; the column
 * `$type<>` annotations on `db/schema.ts` already carry the precise
 * shape over the wire.
 */
export type SearchRow = Search;

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export const listSearches = createServerFn({ method: "GET" }).handler(
  async (): Promise<SearchRow[]> => {
    const householdId = await requireHouseholdId();
    const db = getDb();
    const rows = await db
      .select()
      .from(searches)
      .where(eq(searches.householdId, householdId))
      .orderBy(desc(searches.createdAt));
    return rows;
  }
);

export const getSearch = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<SearchRow> => {
    const householdId = await requireHouseholdId();
    const db = getDb();
    return findHouseholdSearch(db, data.id, householdId);
  });

// -----------------------------------------------------------------------------
// Resolve helpers
// -----------------------------------------------------------------------------

/**
 * Resolve per-portal tokens for the selected portals and stamp them
 * onto `location.portalRefs`. Only portals listed on the search get
 * resolved — saving an OpenRent-only search shouldn't fail because
 * Rightmove can't index the place. A resolver throwing
 * `PortalResolveError` aborts the whole save with a structured message
 * the form can render inline.
 *
 * Excludes are NOT resolved per-portal: excludes are filter-time, not
 * URL-time. We strip any portalRefs the client might have sent on
 * exclude locations for the same reason.
 */
async function stampPortalRefs(
  location: SearchLocation,
  portals: ("rightmove" | "zoopla" | "openrent")[]
): Promise<SearchLocation> {
  const portalRefs: SearchLocation["portalRefs"] = {};

  // Run independent resolvers in parallel — Rightmove's is the only
  // one that does network I/O, but the shape stays consistent if we
  // ever add a portal whose resolver also fetches.
  const tasks: Promise<void>[] = [];
  if (portals.includes("rightmove")) {
    tasks.push(
      resolveRightmove(location).then((ref) => {
        portalRefs.rightmove = ref;
      })
    );
  }
  if (portals.includes("zoopla")) {
    // Sync resolver — wrapped in a promise so the array stays uniform.
    portalRefs.zoopla = resolveZoopla(location);
  }
  if (portals.includes("openrent")) {
    portalRefs.openrent = resolveOpenrent(location);
  }
  await Promise.all(tasks);

  return { ...location, portalRefs };
}

function stripExcludeRefs(excludes: SearchLocation[]): SearchLocation[] {
  return excludes.map((loc) => ({ ...loc, portalRefs: {} }));
}

// -----------------------------------------------------------------------------
// Writes
// -----------------------------------------------------------------------------

export type CreateSearchResult = {
  search: SearchRow;
  scheduleId: string | null;
};

export const createSearch = createServerFn({ method: "POST" })
  .inputValidator(createSearchSchema)
  .handler(async ({ data }): Promise<CreateSearchResult> => {
    const householdId = await requireHouseholdId();
    const db = getDb();

    const id = nanoid();
    const location = await stampPortalRefs(data.location, data.portals);
    const excludeLocations = stripExcludeRefs(data.excludeLocations);
    const isOff = data.cron === null;

    const inserted = await db
      .insert(searches)
      .values({
        id,
        householdId,
        name: data.name,
        portals: data.portals,
        location,
        excludeLocations,
        minBedrooms: data.minBedrooms ?? null,
        maxBedrooms: data.maxBedrooms ?? null,
        minBathrooms: data.minBathrooms ?? null,
        maxBathrooms: data.maxBathrooms ?? null,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        // Drizzle `numeric` is a string at the boundary; the column
        // stores up to 2 decimal places (precision: 5, scale: 2).
        radiusMiles: data.radiusMiles.toFixed(2),
        propertyTypes: data.propertyTypes,
        furnished: data.furnished ?? null,
        mustHaves: data.mustHaves,
        exclusions: data.exclusions,
        commuteTargets: data.commuteTargets,
        transportTargets: data.transportTargets,
        active: !isOff,
      })
      .returning()
      .then((rows) => rows[0]);
    if (!inserted) {
      throw new Error("insert_failed");
    }
    const insertedRow: SearchRow = inserted;

    if (isOff || !data.cron) {
      return { search: insertedRow, scheduleId: null };
    }

    const schedule = await createSchedule({
      data: {
        task: SCRAPE_TASK_ID,
        cron: data.cron,
        externalId: insertedRow.id,
        timezone: SCHEDULE_TIMEZONE,
        deduplicationKey: `scrape-search:${envTag()}:${insertedRow.id}`,
      },
    });

    return { search: insertedRow, scheduleId: schedule.id };
  });

export type UpdateSearchResult = {
  search: SearchRow;
  scheduleId: string | null;
};

export const updateSearch = createServerFn({ method: "POST" })
  .inputValidator(updateSearchSchema)
  .handler(async ({ data }): Promise<UpdateSearchResult> => {
    const householdId = await requireHouseholdId();
    const db = getDb();

    // Confirm the row belongs to the caller's household before touching it.
    await findHouseholdSearch(db, data.id, householdId);

    const location = await stampPortalRefs(data.location, data.portals);
    const excludeLocations = stripExcludeRefs(data.excludeLocations);
    const isOff = data.cron === null;

    const updated = await db
      .update(searches)
      .set({
        name: data.name,
        portals: data.portals,
        location,
        excludeLocations,
        minBedrooms: data.minBedrooms ?? null,
        maxBedrooms: data.maxBedrooms ?? null,
        minBathrooms: data.minBathrooms ?? null,
        maxBathrooms: data.maxBathrooms ?? null,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        radiusMiles: data.radiusMiles.toFixed(2),
        propertyTypes: data.propertyTypes,
        furnished: data.furnished ?? null,
        mustHaves: data.mustHaves,
        exclusions: data.exclusions,
        commuteTargets: data.commuteTargets,
        transportTargets: data.transportTargets,
        active: !isOff,
      })
      .where(
        and(eq(searches.id, data.id), eq(searches.householdId, householdId))
      )
      .returning()
      .then((rows) => rows[0]);
    if (!updated) {
      throw new Error("update_failed");
    }
    const updatedRow: SearchRow = updated;

    // Reconcile schedule state.
    const existingSchedule = await findScheduleByExternalId(updatedRow.id);

    if (isOff) {
      if (existingSchedule?.active) {
        await deactivateSchedule({ data: { id: existingSchedule.id } });
      }
      return {
        search: updatedRow,
        scheduleId: existingSchedule?.id ?? null,
      };
    }

    if (!data.cron) {
      return {
        search: updatedRow,
        scheduleId: existingSchedule?.id ?? null,
      };
    }

    if (existingSchedule) {
      const refreshed = await updateSchedule({
        data: {
          id: existingSchedule.id,
          task: SCRAPE_TASK_ID,
          cron: data.cron,
          externalId: updatedRow.id,
          timezone: SCHEDULE_TIMEZONE,
        },
      });
      return { search: updatedRow, scheduleId: refreshed.id };
    }

    // Transitioning off → on. Create a fresh schedule.
    const created = await createSchedule({
      data: {
        task: SCRAPE_TASK_ID,
        cron: data.cron,
        externalId: updatedRow.id,
        timezone: SCHEDULE_TIMEZONE,
        deduplicationKey: `scrape-search:${envTag()}:${updatedRow.id}`,
      },
    });
    return { search: updatedRow, scheduleId: created.id };
  });

export const archiveSearch = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const householdId = await requireHouseholdId();
    const db = getDb();
    await findHouseholdSearch(db, data.id, householdId);
    await db
      .update(searches)
      .set({ active: false })
      .where(
        and(eq(searches.id, data.id), eq(searches.householdId, householdId))
      );

    const schedule = await findScheduleByExternalId(data.id);
    if (schedule?.active) {
      await deactivateSchedule({ data: { id: schedule.id } });
    }
    return { ok: true };
  });

/**
 * Trigger an on-demand scrape for a single search. Bypasses the
 * Trigger.dev schedule and fans out directly to `scrape-portal` per
 * selected portal — same fan-out shape the scheduled `scrape-search`
 * task uses, just kicked off manually.
 *
 * Tags every spawned run with a unique `run-now:<searchId>:<ts>` tag
 * and mints a short-lived public access token scoped to that tag, so
 * the client can subscribe via `useRealtimeRunsWithTag` to keep the
 * spinner active until every per-portal run is in a terminal state.
 *
 * Works even when the search is paused (`active=false`) — the user
 * explicitly asked us to scrape, so we don't gate on the schedule
 * state.
 */
export type RunSearchNowResult = {
  /** Tag attached to every spawned run; the client subscribes to it. */
  tag: string;
  runIds: string[];
  /** Public access token scoped to the tag, valid for 1 hour. */
  publicAccessToken: string;
};

export const runSearchNow = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<RunSearchNowResult> => {
    const householdId = await requireHouseholdId();
    const db = getDb();
    const search = await findHouseholdSearch(db, data.id, householdId);
    if (search.portals.length === 0) {
      throw new Error("no_portals_selected");
    }
    // Unique per-click tag — same searchId triggered twice in a row
    // should yield two distinct subscribe-able batches so the UI never
    // confuses an old run's status with a new click's.
    const tag = `run-now:${search.id}:${Date.now()}`;
    const handles = await Promise.all(
      search.portals.map((portal) =>
        tasks.trigger(
          "scrape-portal",
          { searchId: search.id, portal },
          { tags: [tag] }
        )
      )
    );
    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { tags: [tag] } },
      expirationTime: "1h",
    });
    return {
      tag,
      runIds: handles.map((h) => h.id),
      publicAccessToken,
    };
  });

// -----------------------------------------------------------------------------
// Portfolio aggregations — powers the desktop `/searches` view's metric
// strip, per-card stats footer, and 7-day pulse chart in one round-trip.
// -----------------------------------------------------------------------------

export type SearchesPerSearchStats = {
  searchId: string;
  listingsThisWeek: number;
  inQueue: number;
  keptLast30d: number;
  lastRunAt: Date | null;
};

export type SearchesPortfolioTotals = {
  activeSearches: number;
  totalSearches: number;
  listingsThisWeek: number;
  listingsLastWeek: number;
  /** % delta vs last week. 0 when last week is 0 (no division-by-zero). */
  listingsThisWeekDeltaPct: number;
  inQueueTotal: number;
  spendThisMonthUsd: number;
  spendCapUsd: number;
};

export type SearchesPortfolio = {
  perSearch: SearchesPerSearchStats[];
  totals: SearchesPortfolioTotals;
  /**
   * Daily counts of new listings across all the household's searches
   * over the trailing 7 days, oldest → newest. The component renders
   * these as a bar chart; index 6 is "today".
   */
  pulseLast7Days: number[];
};

/**
 * Hardcoded monthly budget cap — move to a settings table when the
 * cap needs to be configurable per household.
 */
const PORTFOLIO_BUDGET_USD = 15.0;

export const getSearchesPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<SearchesPortfolio> => {
    const { householdId, memberUserIds, currentUserId } =
      await requireHouseholdScope();
    const db = getDb();

    const searchRows = await db
      .select()
      .from(searches)
      .where(eq(searches.householdId, householdId));
    const totalSearches = searchRows.length;
    const activeSearches = searchRows.filter((s) => s.active).length;
    const searchIds = searchRows.map((s) => s.id);

    const now = new Date();
    const startOfThisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfLastWeek = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );

    if (searchIds.length === 0) {
      return {
        perSearch: [],
        totals: {
          activeSearches: 0,
          totalSearches: 0,
          listingsThisWeek: 0,
          listingsLastWeek: 0,
          listingsThisWeekDeltaPct: 0,
          inQueueTotal: 0,
          spendThisMonthUsd: 0,
          spendCapUsd: PORTFOLIO_BUDGET_USD,
        },
        pulseLast7Days: new Array(7).fill(0),
      };
    }

    // Fire everything in parallel — five small queries.
    const [
      thisWeekListings,
      lastWeekListings,
      keptRows,
      lastRunRows,
      clusterRows,
      mySwipesRows,
      householdSkipRows,
      spendRows,
    ] = await Promise.all([
      // Listings per search in the last 7d. We also need each row's
      // firstSeenAt so we can bucket the pulse chart in JS.
      db
        .select({
          searchId: listings.searchId,
          firstSeenAt: listings.firstSeenAt,
        })
        .from(listings)
        .where(
          and(
            inArray(listings.searchId, searchIds),
            gte(listings.firstSeenAt, startOfThisWeek)
          )
        ),
      // 7d–14d ago window for the week-over-week delta.
      db
        .select({ searchId: listings.searchId })
        .from(listings)
        .where(
          and(
            inArray(listings.searchId, searchIds),
            gte(listings.firstSeenAt, startOfLastWeek),
            sql`${listings.firstSeenAt} < ${startOfThisWeek}`
          )
        ),
      // Current user's keep/shortlist swipes in the last 30 days.
      db
        .select({
          searchId: swipes.searchId,
          outcome: swipes.outcome,
        })
        .from(swipes)
        .where(
          and(
            eq(swipes.userId, currentUserId),
            inArray(swipes.searchId, searchIds),
            gte(swipes.createdAt, start30d),
            inArray(swipes.outcome, ["keep", "shortlist"])
          )
        ),
      // Most recent scrape_run per search.
      db
        .select({
          searchId: scrapeRuns.searchId,
          lastRunAt: sql<Date>`MAX(${scrapeRuns.startedAt})`,
        })
        .from(scrapeRuns)
        .where(inArray(scrapeRuns.searchId, searchIds))
        .groupBy(scrapeRuns.searchId),
      // (search_id, cluster_id) pairs — the raw material for in-queue.
      db
        .select({
          searchId: listings.searchId,
          clusterId: listings.clusterId,
        })
        .from(listings)
        .where(
          and(
            inArray(listings.searchId, searchIds),
            sql`${listings.clusterId} IS NOT NULL`
          )
        ),
      // Current user's swipes (any outcome) — these clusters drop out.
      db
        .select({ clusterId: swipes.clusterId })
        .from(swipes)
        .where(eq(swipes.userId, currentUserId)),
      // Household-wide skip swipes — asymmetric veto hides cards from
      // the rest of the household.
      db
        .select({ clusterId: swipes.clusterId })
        .from(swipes)
        .where(
          and(inArray(swipes.userId, memberUserIds), eq(swipes.outcome, "skip"))
        ),
      // Spend this month (scrape + ai). Cost is stored numeric → string
      // in the row; cast + sum.
      Promise.all([
        db
          .select({
            total: sql<string>`COALESCE(SUM(${scrapeRuns.costUsd}), 0)`,
          })
          .from(scrapeRuns)
          .where(
            and(
              inArray(scrapeRuns.searchId, searchIds),
              gte(scrapeRuns.startedAt, startOfMonth)
            )
          ),
        db
          .select({
            total: sql<string>`COALESCE(SUM(${aiRuns.costUsd}), 0)`,
          })
          .from(aiRuns)
          .innerJoin(listings, eq(listings.id, aiRuns.listingId))
          .where(
            and(
              inArray(listings.searchId, searchIds),
              gte(aiRuns.startedAt, startOfMonth)
            )
          ),
      ]),
    ]);

    const { listingsThisWeekBySearch, pulseLast7Days } = bucketListingsAndPulse(
      thisWeekListings,
      now
    );
    const keptBySearch = countBySearchId(keptRows);
    const lastRunBySearch = mapLastRun(lastRunRows);
    const queueClustersBySearch = bucketQueueClusters(
      clusterRows,
      new Set(mySwipesRows.map((s) => s.clusterId)),
      new Set(householdSkipRows.map((s) => s.clusterId))
    );

    const perSearch: SearchesPerSearchStats[] = searchRows.map((s) => ({
      searchId: s.id,
      listingsThisWeek: listingsThisWeekBySearch.get(s.id) ?? 0,
      inQueue: queueClustersBySearch.get(s.id)?.size ?? 0,
      keptLast30d: keptBySearch.get(s.id) ?? 0,
      lastRunAt: lastRunBySearch.get(s.id) ?? null,
    }));

    const listingsThisWeek = thisWeekListings.length;
    const listingsLastWeek = lastWeekListings.length;
    const listingsThisWeekDeltaPct =
      listingsLastWeek === 0
        ? 0
        : ((listingsThisWeek - listingsLastWeek) / listingsLastWeek) * 100;

    const [scrapeSpend, aiSpend] = spendRows;
    const spendThisMonthUsd =
      Number(scrapeSpend[0]?.total ?? 0) + Number(aiSpend[0]?.total ?? 0);

    const inQueueTotal = countDistinct(queueClustersBySearch);

    return {
      perSearch,
      totals: {
        activeSearches,
        totalSearches,
        listingsThisWeek,
        listingsLastWeek,
        listingsThisWeekDeltaPct,
        inQueueTotal,
        spendThisMonthUsd,
        spendCapUsd: PORTFOLIO_BUDGET_USD,
      },
      pulseLast7Days,
    };
  }
);

/**
 * Bucket the trailing-7-days listings into per-search counts AND the
 * 7-day pulse chart. Index 0 of `pulseLast7Days` is 6 days ago in UTC;
 * index 6 is today. A row whose `firstSeenAt` somehow falls outside
 * the window is dropped from the pulse (still counted per-search).
 */
function bucketListingsAndPulse(
  rows: { searchId: string; firstSeenAt: Date }[],
  now: Date
): { listingsThisWeekBySearch: Map<string, number>; pulseLast7Days: number[] } {
  const listingsThisWeekBySearch = new Map<string, number>();
  const pulseLast7Days = new Array<number>(7).fill(0);
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfPulseUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 6
  );
  for (const r of rows) {
    listingsThisWeekBySearch.set(
      r.searchId,
      (listingsThisWeekBySearch.get(r.searchId) ?? 0) + 1
    );
    const idx = Math.floor(
      (new Date(r.firstSeenAt).getTime() - startOfPulseUtc) / dayMs
    );
    if (idx >= 0 && idx < 7) {
      pulseLast7Days[idx] = (pulseLast7Days[idx] ?? 0) + 1;
    }
  }
  return { listingsThisWeekBySearch, pulseLast7Days };
}

function countBySearchId<T extends { searchId: string }>(
  rows: T[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    out.set(r.searchId, (out.get(r.searchId) ?? 0) + 1);
  }
  return out;
}

function mapLastRun(
  rows: { searchId: string; lastRunAt: Date | null }[]
): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const r of rows) {
    if (r.lastRunAt) {
      out.set(r.searchId, new Date(r.lastRunAt));
    }
  }
  return out;
}

/**
 * Per-search distinct cluster ids remaining in the queue, after the
 * household-skip veto + the current user's already-swiped set.
 */
function bucketQueueClusters(
  clusterRows: { searchId: string; clusterId: string | null }[],
  mySwiped: Set<string | null>,
  householdSkip: Set<string | null>
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of clusterRows) {
    if (!r.clusterId) {
      continue;
    }
    if (mySwiped.has(r.clusterId) || householdSkip.has(r.clusterId)) {
      continue;
    }
    const set = out.get(r.searchId) ?? new Set<string>();
    set.add(r.clusterId);
    out.set(r.searchId, set);
  }
  return out;
}

/** Distinct count of values across all sets in a Map<key, Set<value>>. */
function countDistinct(map: Map<string, Set<string>>): number {
  const seen = new Set<string>();
  for (const set of map.values()) {
    for (const v of set) {
      seen.add(v);
    }
  }
  return seen.size;
}
