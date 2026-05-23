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
 * `findScheduleByExternalId` lives in `src/lib/schedule-lookup.ts` so
 * the Trigger worker can import it without pulling `@tanstack/react-start`
 * into the worker bundle. We re-export it here so existing web-side
 * callers keep working without import-path churn.
 */
import { createServerFn } from "@tanstack/react-start";
import type { ScheduleObject } from "@trigger.dev/core/v3";
import { schedules } from "@trigger.dev/sdk";
import { z } from "zod";

export { findScheduleByExternalId } from "../../lib/schedule-lookup";

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

export const deactivateSchedule = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(({ data }): Promise<ScheduleRow> => schedules.deactivate(data.id));
