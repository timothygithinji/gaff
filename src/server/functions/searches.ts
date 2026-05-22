/**
 * Search CRUD server functions.
 *
 * Searches are the unit of work in Gaff — every `scrape_runs` row, every
 * `listings` row, every `swipes` row hangs off a `search_id`. They live
 * under a household (resolved from the caller's `household_members`
 * row); the household-scoping rule means a user can never see / edit
 * another household's search.
 *
 * Scrape cadence lives on Trigger.dev, not in our DB:
 *
 *   - `createSearch`  → INSERT + `createSchedule(externalId = search.id)`
 *   - `updateSearch`  → UPDATE + reconcile schedule by externalId
 *   - `archiveSearch` → flip `active=false` + `deactivateSchedule`
 *   - `deleteSearch`  → `deleteSchedule` + DELETE row
 *
 * `cron: null` is the explicit "Off" sentinel — write the row with
 * `active=false` and skip schedule creation entirely.
 *
 * Outcodes are validated client-side via `lookupOutcode` against the
 * typed postcodes.io client before the form ever submits, so the schema
 * here only enforces shape (uppercase, trimmed, non-empty).
 */
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import { type Search, searches } from "../../../db/schema";
import type { Env } from "../../server";
import {
  createSchedule,
  deactivateSchedule,
  deleteSchedule as deleteScheduleFn,
  findScheduleByExternalId,
  updateSchedule,
} from "./schedules";
import { getCurrentUser } from "./session";

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
  const db = getDb(env as unknown as Env);
  const membership = await db.query.householdMembers.findFirst({
    where: (hm, { eq: eqOp }) => eqOp(hm.userId, session.userId),
  });
  if (!membership) {
    throw new Error("no_household");
  }
  return membership.householdId;
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

const aiRuleSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  body: z.string().trim().optional(),
  enabled: z.boolean(),
  /** Free-form custom rules carry their full prompt text here. */
  customPrompt: z.string().trim().optional(),
});

const baseSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    portals: z.array(portalSchema).min(1, "At least one portal required"),
    outcodes: z
      .array(z.string().trim().min(1).max(8))
      .min(1, "At least one outcode required"),
    excludeOutcodes: z.array(z.string().trim().min(1).max(8)).default([]),
    minBedrooms: z.number().int().min(0).max(10).nullable(),
    maxBedrooms: z.number().int().min(0).max(10).nullable(),
    minBathrooms: z.number().int().min(0).max(10).nullable(),
    maxBathrooms: z.number().int().min(0).max(10).nullable(),
    minPrice: z.number().int().min(0).max(20_000),
    maxPrice: z.number().int().min(0).max(20_000),
    propertyTypes: z.array(z.string().trim().min(1)).default([]),
    commuteTargets: z.array(commuteTargetSchema).default([]),
    aiRules: z.array(aiRuleSchema).default([]),
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
 * The `aiRules` jsonb column carries both the toggle state of the
 * preset rules and any custom user-authored rules. The shape is
 * intentionally permissive so PR 6 can extend it without a migration.
 */
export type StoredAiRules = {
  rules: Array<{
    id: string;
    label: string;
    body?: string;
    enabled: boolean;
    customPrompt?: string;
  }>;
  /**
   * Excluded outcodes live here too — the table only has one `outcodes`
   * array column, so we tuck the EXCLUDE list inside the same jsonb
   * blob to keep the schema migration-free for PR 3.
   */
  excludeOutcodes: string[];
};

/** Strongly-typed accessor for the otherwise `unknown`-typed jsonb column. */
export function readAiRules(value: unknown): StoredAiRules {
  if (
    typeof value === "object" &&
    value !== null &&
    "rules" in value &&
    Array.isArray((value as { rules: unknown }).rules)
  ) {
    const v = value as Partial<StoredAiRules>;
    return {
      rules: (v.rules ?? []).map((r) => ({
        id: String(r.id ?? ""),
        label: String(r.label ?? ""),
        body: r.body,
        enabled: Boolean(r.enabled),
        customPrompt: r.customPrompt,
      })),
      excludeOutcodes: Array.isArray(v.excludeOutcodes)
        ? v.excludeOutcodes.map((o) => String(o))
        : [],
    };
  }
  return { rules: [], excludeOutcodes: [] };
}

/**
 * Search row over-the-wire. The DB column types `aiRules` as `jsonb`
 * (i.e. `unknown`), which TanStack Start refuses to serialise — so the
 * read functions widen it to `StoredAiRules` here and the writers
 * round-trip it through `readAiRules` to enforce the shape on the way
 * back in.
 */
export type SearchRow = Omit<Search, "aiRules"> & {
  aiRules: StoredAiRules;
};

function toSearchRow(row: Search): SearchRow {
  return { ...row, aiRules: readAiRules(row.aiRules) };
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export const listSearches = createServerFn({ method: "GET" }).handler(
  async (): Promise<SearchRow[]> => {
    const householdId = await requireHouseholdId();
    const db = getDb(env as unknown as Env);
    const rows = await db
      .select()
      .from(searches)
      .where(eq(searches.householdId, householdId))
      .orderBy(desc(searches.createdAt));
    return rows.map(toSearchRow);
  }
);

export const getSearch = createServerFn({ method: "GET" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<SearchRow> => {
    const householdId = await requireHouseholdId();
    const db = getDb(env as unknown as Env);
    const row = await db.query.searches.findFirst({
      where: (s, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(s.id, data.id), eqOp(s.householdId, householdId)),
    });
    if (!row) {
      throw new Error("not_found");
    }
    return toSearchRow(row);
  });

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
    const db = getDb(env as unknown as Env);

    const id = nanoid();
    const outcodes = data.outcodes.map((o) => o.trim().toUpperCase());
    const excludeOutcodes = data.excludeOutcodes.map((o) =>
      o.trim().toUpperCase()
    );
    const isOff = data.cron === null;

    const aiRules: StoredAiRules = {
      rules: data.aiRules,
      excludeOutcodes,
    };

    const inserted = await db
      .insert(searches)
      .values({
        id,
        householdId,
        name: data.name,
        portals: data.portals,
        outcodes,
        minBedrooms: data.minBedrooms ?? null,
        maxBedrooms: data.maxBedrooms ?? null,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        propertyTypes: data.propertyTypes,
        commuteTargets: data.commuteTargets,
        aiRules,
        active: !isOff,
      })
      .returning()
      .then((rows) => rows[0]);
    if (!inserted) {
      throw new Error("insert_failed");
    }
    const insertedRow = toSearchRow(inserted);

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
    const db = getDb(env as unknown as Env);

    // Confirm the row belongs to the caller's household before touching it.
    const existing = await db.query.searches.findFirst({
      where: (s, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(s.id, data.id), eqOp(s.householdId, householdId)),
    });
    if (!existing) {
      throw new Error("not_found");
    }

    const outcodes = data.outcodes.map((o) => o.trim().toUpperCase());
    const excludeOutcodes = data.excludeOutcodes.map((o) =>
      o.trim().toUpperCase()
    );
    const isOff = data.cron === null;

    const aiRules: StoredAiRules = {
      rules: data.aiRules,
      excludeOutcodes,
    };

    const updated = await db
      .update(searches)
      .set({
        name: data.name,
        portals: data.portals,
        outcodes,
        minBedrooms: data.minBedrooms ?? null,
        maxBedrooms: data.maxBedrooms ?? null,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        propertyTypes: data.propertyTypes,
        commuteTargets: data.commuteTargets,
        aiRules,
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
    const updatedRow = toSearchRow(updated);

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
    const db = getDb(env as unknown as Env);
    const existing = await db.query.searches.findFirst({
      where: (s, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(s.id, data.id), eqOp(s.householdId, householdId)),
    });
    if (!existing) {
      throw new Error("not_found");
    }
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

export const deleteSearch = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const householdId = await requireHouseholdId();
    const db = getDb(env as unknown as Env);
    const existing = await db.query.searches.findFirst({
      where: (s, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(s.id, data.id), eqOp(s.householdId, householdId)),
    });
    if (!existing) {
      throw new Error("not_found");
    }

    // Delete the schedule FIRST. If we deleted the row first and the
    // schedule delete then failed, we'd have an orphan firing against a
    // gone search id. Schedule-first means a failure here aborts the
    // DB delete and leaves a consistent state.
    const schedule = await findScheduleByExternalId(data.id);
    if (schedule) {
      await deleteScheduleFn({ data: { id: schedule.id } });
    }

    await db
      .delete(searches)
      .where(
        and(eq(searches.id, data.id), eq(searches.householdId, householdId))
      );

    return { ok: true };
  });
