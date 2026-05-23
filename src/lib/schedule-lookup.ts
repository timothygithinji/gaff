/**
 * Framework-agnostic schedule lookup helper.
 *
 * Lives outside `src/server/functions/schedules.ts` so the Trigger.dev
 * worker can import it without pulling `@tanstack/react-start` (and the
 * rest of the server-function machinery) into its bundle. The legacy
 * `src/server/functions/schedules.ts` re-exports this so existing
 * web-side callers keep working without import-path churn.
 */
import type { ScheduleObject } from "@trigger.dev/core/v3";
import { schedules } from "@trigger.dev/sdk";

/**
 * Look up a schedule by the `externalId` we attached at create time
 * (i.e. the `searches.id`). The Trigger SDK has no `findOne` endpoint
 * as of v4 so we list + filter client-side. `perPage: 100` matches the
 * cap on `listSchedules`; if a household ever exceeds that we'd need
 * to walk pages.
 */
export async function findScheduleByExternalId(
  externalId: string
): Promise<ScheduleObject | undefined> {
  const page = await schedules.list({ perPage: 100 });
  return page.data.find((row) => row.externalId === externalId);
}
