/**
 * Imperative-schedule management for Trigger.dev tasks.
 *
 * Per-search scrape cadence lives on Trigger.dev — NOT in our DB. The
 * search's `id` is stored as the schedule's `externalId`, which lets us
 * round-trip from a `Search` row to its `ScheduleObject`. Cron string,
 * timezone, and active state are all read from the SDK; we never cache
 * them locally so the dashboard and the search edit screen all stay
 * in sync.
 *
 * Modelled on scout's `server/functions/schedules.ts` — same shape, same
 * paging-discard pattern, same task whitelist gate on "Run now". The
 * `findScheduleByExternalId` helper lists+filters client-side because
 * the SDK has no `findOne(externalId)` endpoint as of v4.
 */
import { createServerFn } from "@tanstack/react-start";
import type { AnyRunHandle, ScheduleObject } from "@trigger.dev/core/v3";
import { schedules, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

/**
 * Whitelist of task IDs that may be triggered via "Run now" on a
 * schedule row. Keeps the endpoint from becoming an arbitrary task
 * launcher — anything new needs a deliberate edit here. `scrape-search`
 * doesn't exist yet (PR 4 lands it) but the wrapper needs to be ready
 * to schedule it the moment it does, so it's whitelisted up front.
 */
const SCHEDULABLE_TASK_IDS = ["scrape-search"] as const;

const cronPatternSchema = z.string().trim().min(1, "cron expression required");
const timezoneSchema = z.string().trim().min(1).max(64).optional();

const createSchema = z.object({
  cron: cronPatternSchema,
  deduplicationKey: z.string().trim().min(1).max(128).optional(),
  externalId: z.string().trim().min(1).max(128).optional(),
  task: z.string().trim().min(1),
  timezone: timezoneSchema,
});

const updateSchema = z.object({
  cron: cronPatternSchema,
  externalId: z.string().trim().min(1).max(128).optional(),
  id: z.string().min(1),
  task: z.string().trim().min(1),
  timezone: timezoneSchema,
});

const idSchema = z.object({
  id: z.string().min(1),
});

export type ScheduleRow = ScheduleObject;

export const listSchedules = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScheduleRow[]> => {
    const page = await schedules.list({ perPage: 100 });
    return page.data;
  }
);

export const createSchedule = createServerFn({ method: "POST" })
  .inputValidator(createSchema)
  .handler(
    ({ data }): Promise<ScheduleRow> =>
      schedules.create({
        task: data.task,
        cron: data.cron,
        // Stable dedup key prevents duplicate writes when the same
        // create call retries; falls through to a UUID when the
        // caller hasn't supplied a domain-meaningful one.
        deduplicationKey: data.deduplicationKey ?? crypto.randomUUID(),
        externalId: data.externalId,
        timezone: data.timezone,
      })
  );

export const updateSchedule = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(
    ({ data }): Promise<ScheduleRow> =>
      schedules.update(data.id, {
        task: data.task,
        cron: data.cron,
        externalId: data.externalId,
        timezone: data.timezone,
      })
  );

export const activateSchedule = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(({ data }): Promise<ScheduleRow> => schedules.activate(data.id));

export const deactivateSchedule = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(({ data }): Promise<ScheduleRow> => schedules.deactivate(data.id));

export const deleteSchedule = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const deleted = await schedules.del(data.id);
    return { id: deleted.id };
  });

const runNowSchema = z.object({
  task: z.enum(SCHEDULABLE_TASK_IDS),
});

/**
 * Fire the underlying scheduled task immediately, bypassing the cron.
 * Tagged `trigger:manual` so the runs table can distinguish manual
 * firings from cron firings.
 */
export const runScheduleTaskNow = createServerFn({ method: "POST" })
  .inputValidator(runNowSchema)
  .handler(
    ({ data }): Promise<AnyRunHandle> =>
      tasks.trigger(
        data.task,
        {},
        {
          tags: [`task:${data.task}`, "trigger:manual"],
          idempotencyKey: `${data.task}-manual-${Date.now()}`,
          idempotencyKeyTTL: "1m",
        }
      )
  );

/**
 * Look up a schedule by the `externalId` we attached at create time
 * (i.e. the `searches.id`). The Trigger SDK has no `findOne` endpoint
 * as of v4 so we list + filter client-side. `perPage: 100` matches the
 * cap on `listSchedules`; if a household ever exceeds that we'd need
 * to walk pages.
 */
export async function findScheduleByExternalId(
  externalId: string
): Promise<ScheduleRow | undefined> {
  const page = await schedules.list({ perPage: 100 });
  return page.data.find((row) => row.externalId === externalId);
}
