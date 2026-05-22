/**
 * `/admin/schedules` — scout-inspired schedule manager.
 *
 * Lists every Trigger.dev schedule (via `listSchedules()`), with:
 *   - task id + friendly cron string + next run (Europe/London)
 *   - externalId, linked back to `/searches/$id` when it looks like a
 *     search id and that search is in the caller's household
 *   - active/paused pill
 *   - "Run now" → fires the underlying task immediately (whitelist gate
 *     lives on the server function so the UI can't be coaxed into
 *     launching arbitrary tasks)
 *   - Pause / Resume → activate/deactivate
 *   - Edit → Radix Dialog with cron + timezone inputs
 *
 * Owner-only at the UI layer; the server functions still talk to
 * Trigger.dev, so a non-owner who pokes the endpoint can only see /
 * fire the whitelisted task ids. The household-side mapping (linking
 * externalId → search) is still household-scoped because we look up
 * searches via `listSearches()`.
 */
import * as Dialog from "@radix-ui/react-dialog";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ScheduleObject } from "@trigger.dev/core/v3";
import { useState } from "react";
import { OwnerGate } from "../../components/admin/owner-gate";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import {
  activateSchedule,
  deactivateSchedule,
  listSchedules,
  runScheduleTaskNow,
  updateSchedule,
} from "../../server/functions/schedules";
import { listSearches } from "../../server/functions/searches";

const schedulesQueryOptions = {
  queryKey: ["admin", "schedules"] as const,
  queryFn: () => listSchedules(),
  staleTime: 15_000,
};

const searchesQueryOptions = {
  queryKey: ["searches"] as const,
  queryFn: () => listSearches(),
  staleTime: 30_000,
};

const SCHEDULABLE_TASK_IDS = ["scrape-search"] as const;
type SchedulableTaskId = (typeof SCHEDULABLE_TASK_IDS)[number];

export const Route = createFileRoute("/admin/schedules")({
  // No loader-side prefetch: schedules data goes through Trigger.dev
  // (always works) but `listSearches()` needs a session, so we leave
  // the queries to fire client-side under the OwnerGate.
  component: AdminSchedulesPage,
});

function AdminSchedulesPage() {
  return (
    <OwnerGate>
      <SchedulesScreen />
    </OwnerGate>
  );
}

function SchedulesScreen() {
  const { data: schedules } = useSuspenseQuery(schedulesQueryOptions);
  const { data: searches } = useSuspenseQuery(searchesQueryOptions);
  const searchById = new Map(searches.map((s) => [s.id, s] as const));

  return (
    <div className="flex min-h-screen bg-ground">
      <AdminSidebar />
      <main className="flex-1 px-10 py-8">
        <header className="mb-8">
          <p className="font-semibold text-[11px] text-copper uppercase tracking-[0.14em]">
            System · Schedules
          </p>
          <h1 className="mt-2 font-serif text-3xl text-ink">Schedules</h1>
          <p className="mt-2 text-brass text-sm">
            Every Trigger.dev schedule, live. Edit cron + timezone, pause, or
            fire manually — no need to leave the app.
          </p>
        </header>

        {schedules.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-brass/15 bg-bone">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper text-brass text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold">Task</th>
                  <th className="px-4 py-3 font-semibold">Cron</th>
                  <th className="px-4 py-3 font-semibold">Next run</th>
                  <th className="px-4 py-3 font-semibold">External</th>
                  <th className="px-4 py-3 font-semibold">State</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brass/10">
                {schedules.map((s) => (
                  <ScheduleRow
                    key={s.id}
                    linkedSearchName={
                      s.externalId
                        ? (searchById.get(s.externalId)?.name ?? null)
                        : null
                    }
                    row={s}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-bone p-8 text-center">
      <p className="font-serif text-2xl text-ink">No schedules yet</p>
      <p className="mt-2 text-brass text-sm">
        Each active search creates a schedule on Trigger.dev. Make one in
        Searches and it'll show up here.
      </p>
    </div>
  );
}

function ScheduleRow({
  row,
  linkedSearchName,
}: {
  row: ScheduleObject;
  linkedSearchName: string | null;
}) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium text-ink">{row.task}</td>
      <td className="px-4 py-3 text-brass">
        <code className="rounded bg-ground px-2 py-0.5 text-[12px] text-ink">
          {row.generator.expression}
        </code>
        <span className="ml-2 text-brass/70 text-xs">{row.timezone}</span>
      </td>
      <td className="px-4 py-3 text-brass">{formatNextRun(row.nextRun)}</td>
      <td className="px-4 py-3 text-brass">
        {row.externalId ? (
          linkedSearchName ? (
            <Link
              className="text-copper underline"
              params={{ id: row.externalId }}
              to="/searches/$id"
            >
              {linkedSearchName}
            </Link>
          ) : (
            <span className="font-mono text-brass/80 text-xs">
              {row.externalId}
            </span>
          )
        ) : (
          <span className="text-brass/60">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {row.active ? (
          <span className="rounded-full bg-[#7A8C5C]/15 px-2 py-0.5 text-[#3F4A2F] text-[11px] uppercase tracking-wide">
            Active
          </span>
        ) : (
          <span className="rounded-full bg-brass/15 px-2 py-0.5 text-[11px] text-brass uppercase tracking-wide">
            Paused
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          {isSchedulableTask(row.task) && <RunNowButton task={row.task} />}
          <TogglePauseButton id={row.id} isActive={row.active} />
          <EditScheduleButton schedule={row} />
        </div>
      </td>
    </tr>
  );
}

function isSchedulableTask(task: string): task is SchedulableTaskId {
  return (SCHEDULABLE_TASK_IDS as readonly string[]).includes(task);
}

function RunNowButton({ task }: { task: SchedulableTaskId }) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => runScheduleTaskNow({ data: { task } }),
    onError: (e: Error) => setError(e.message ?? "Run failed"),
    onSuccess: () => setError(null),
  });
  return (
    <div className="flex flex-col items-end">
      <button
        className="rounded-full bg-copper px-3 py-1 font-medium text-bone text-xs disabled:opacity-50"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        type="button"
      >
        {mutation.isPending ? "Firing…" : "Run now"}
      </button>
      {error && <span className="mt-1 text-[#B05A38] text-xs">{error}</span>}
    </div>
  );
}

function TogglePauseButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      isActive
        ? deactivateSchedule({ data: { id } })
        : activateSchedule({ data: { id } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: schedulesQueryOptions.queryKey }),
  });
  return (
    <button
      className="rounded-full border border-brass/30 px-3 py-1 text-brass text-xs disabled:opacity-50"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      type="button"
    >
      {togglePauseLabel(mutation.isPending, isActive)}
    </button>
  );
}

function togglePauseLabel(pending: boolean, active: boolean): string {
  if (pending) {
    return "…";
  }
  return active ? "Pause" : "Resume";
}

function EditScheduleButton({ schedule }: { schedule: ScheduleObject }) {
  const [open, setOpen] = useState(false);
  const [cron, setCron] = useState(schedule.generator.expression);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      updateSchedule({
        data: {
          id: schedule.id,
          task: schedule.task,
          cron,
          timezone,
          externalId: schedule.externalId ?? undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schedulesQueryOptions.queryKey });
      setError(null);
      setOpen(false);
    },
    onError: (e: Error) => setError(e.message ?? "Update failed"),
  });

  return (
    <Dialog.Root
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setCron(schedule.generator.expression);
          setTimezone(schedule.timezone);
          setError(null);
        }
      }}
      open={open}
    >
      <Dialog.Trigger asChild>
        <button
          className="rounded-full border border-brass/30 px-3 py-1 text-brass text-xs"
          type="button"
        >
          Edit
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md rounded-lg bg-paper p-6 shadow-xl">
          <Dialog.Title className="font-serif text-ink text-lg">
            Edit schedule
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-brass text-sm">
            Updates fire immediately on Trigger.dev — the next run reschedules
            to match.
          </Dialog.Description>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="block text-brass text-xs uppercase tracking-wide">
                Cron
              </span>
              <input
                className="mt-1 w-full rounded border border-brass/30 bg-ground px-3 py-2 font-mono text-ink text-sm"
                onChange={(e) => setCron(e.target.value)}
                value={cron}
              />
            </label>
            <label className="block">
              <span className="block text-brass text-xs uppercase tracking-wide">
                Timezone (IANA)
              </span>
              <input
                className="mt-1 w-full rounded border border-brass/30 bg-ground px-3 py-2 text-ink text-sm"
                onChange={(e) => setTimezone(e.target.value)}
                value={timezone}
              />
            </label>
            {error && <p className="text-[#B05A38] text-sm">{error}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                className="rounded-md px-4 py-2 text-ink text-sm"
                type="button"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              className="rounded-md bg-copper px-4 py-2 text-bone text-sm disabled:opacity-50"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              type="button"
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Friendly next-run formatter. Trigger.dev gives us a UTC Date; we
 * render in `Europe/London` since every search we create defaults to
 * that timezone, and unset nextRun (e.g. paused schedules) shows "—".
 */
function formatNextRun(nextRun: Date | null | undefined): string {
  if (!nextRun) {
    return "—";
  }
  const d = nextRun instanceof Date ? nextRun : new Date(nextRun);
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
