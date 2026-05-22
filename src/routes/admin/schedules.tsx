/**
 * `/admin/schedules` — scout-inspired schedule manager.
 *
 * Lists every Trigger.dev schedule (via `listSchedules()`), with:
 *   - task id + friendly cron string + next run (Europe/London)
 *   - externalId, linked back to `/searches/$id` when it looks like a
 *     search id and that search is in the caller's household
 *   - active/paused pill (flips optimistically)
 *   - "Run now" → fires the underlying task immediately (whitelist gate
 *     lives on the server function so the UI can't be coaxed into
 *     launching arbitrary tasks). Shows a "Running…" pill on the row
 *     until the mutation settles.
 *   - Pause / Resume → activate/deactivate, optimistic flip
 *   - Edit → TanStack Form dialog with cron + timezone inputs,
 *     optimistic patch on submit
 *   - Delete → optimistic remove from the schedules cache
 *
 * Owner-only at the UI layer; the server functions still talk to
 * Trigger.dev, so a non-owner who pokes the endpoint can only see /
 * fire the whitelisted task ids. The household-side mapping (linking
 * externalId → search) is still household-scoped because we look up
 * searches via `listSearches()`.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ScheduleObject } from "@trigger.dev/core/v3";
import { useState } from "react";
import { z } from "zod";
import { OwnerGate } from "../../components/admin/owner-gate";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { requireSession } from "../../lib/auth-guard";
import { queryKeys } from "../../lib/query-keys";
import {
  activateSchedule,
  deactivateSchedule,
  deleteSchedule,
  listSchedules,
  runScheduleTaskNow,
  updateSchedule,
} from "../../server/functions/schedules";
import { listSearches } from "../../server/functions/searches";

const schedulesQueryOptions = {
  queryKey: queryKeys.schedules(),
  queryFn: () => listSchedules(),
  staleTime: 15_000,
};

const searchesQueryOptions = {
  queryKey: queryKeys.searches(),
  queryFn: () => listSearches(),
  staleTime: 30_000,
};

const SCHEDULABLE_TASK_IDS = ["scrape-search"] as const;
type SchedulableTaskId = (typeof SCHEDULABLE_TASK_IDS)[number];

const cronSchema = z.string().trim().min(1, "Cron expression required");
const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone required")
  .max(64, "Timezone too long");

export const Route = createFileRoute("/admin/schedules")({
  beforeLoad: ({ context }) => {
    requireSession(
      context as { currentUserId: string | null },
      "/admin/schedules"
    );
  },
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
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 px-10 py-8">
        <header className="mb-8">
          <p className="font-semibold text-[11px] text-primary uppercase tracking-[0.14em]">
            System · Schedules
          </p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">
            Schedules
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Every Trigger.dev schedule, live. Edit cron + timezone, pause, or
            fire manually — no need to leave the app.
          </p>
        </header>

        {schedules.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-muted">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted-foreground text-xs uppercase tracking-wide">
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
              <tbody className="divide-y divide-border">
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
    <div className="rounded-2xl bg-muted p-8 text-center">
      <p className="font-serif text-2xl text-foreground">No schedules yet</p>
      <p className="mt-2 text-muted-foreground text-sm">
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
      <td className="px-4 py-3 font-medium text-foreground">{row.task}</td>
      <td className="px-4 py-3 text-muted-foreground">
        <code className="rounded bg-background px-2 py-0.5 text-[12px] text-foreground">
          {row.generator.expression}
        </code>
        <span className="ml-2 text-muted-foreground/70 text-xs">
          {row.timezone}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatNextRun(row.nextRun)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {row.externalId ? (
          linkedSearchName ? (
            <Link
              className="text-primary underline"
              params={{ id: row.externalId }}
              to="/searches/$id"
            >
              {linkedSearchName}
            </Link>
          ) : (
            <span className="font-mono text-muted-foreground/80 text-xs">
              {row.externalId}
            </span>
          )
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {row.active ? (
          <span className="rounded-full bg-[#7A8C5C]/15 px-2 py-0.5 text-[#3F4A2F] text-[11px] uppercase tracking-wide">
            Active
          </span>
        ) : (
          <span className="rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[11px] text-muted-foreground uppercase tracking-wide">
            Paused
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          {isSchedulableTask(row.task) && <RunNowButton task={row.task} />}
          <TogglePauseButton id={row.id} isActive={row.active} />
          <EditScheduleButton schedule={row} />
          <DeleteScheduleButton id={row.id} />
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
  // Local "running" pill state that flips off on settled — no schedule
  // cache write is needed here (run-now doesn't change the schedule
  // shape itself; the run shows up in Runs).
  const mutation = useMutation({
    mutationFn: () => runScheduleTaskNow({ data: { task } }),
    onError: (e: Error) => setError(e.message ?? "Run failed"),
    onSuccess: () => setError(null),
  });
  return (
    <div className="flex flex-col items-end">
      <button
        className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-xs disabled:opacity-50"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        type="button"
      >
        {mutation.isPending ? "Running…" : "Run now"}
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
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      isActive
        ? deactivateSchedule({ data: { id } })
        : activateSchedule({ data: { id } }),
    // Optimistic: flip the `active` flag on the matching row in the
    // schedules cache so the pill paints the new state instantly.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.schedules() });
      const prev = qc.getQueryData<ScheduleObject[]>(queryKeys.schedules());
      if (prev) {
        qc.setQueryData<ScheduleObject[]>(
          queryKeys.schedules(),
          prev.map((row) =>
            row.id === id ? { ...row, active: !isActive } : row
          )
        );
      }
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.schedules(), ctx.prev);
      }
      setError(e.message ?? "Toggle failed");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() });
    },
  });
  return (
    <div className="flex flex-col items-end">
      <button
        className="rounded-full border border-border px-3 py-1 text-muted-foreground text-xs disabled:opacity-50"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        type="button"
      >
        {togglePauseLabel(mutation.isPending, isActive)}
      </button>
      {error && <span className="mt-1 text-[#B05A38] text-xs">{error}</span>}
    </div>
  );
}

function togglePauseLabel(pending: boolean, active: boolean): string {
  if (pending) {
    return "…";
  }
  return active ? "Pause" : "Resume";
}

function DeleteScheduleButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => deleteSchedule({ data: { id } }),
    // Optimistic: drop the row from the cache so the table re-paints
    // without the deleted schedule. Trigger.dev returns `{ id }` on
    // success so there's nothing to reconcile beyond invalidation.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.schedules() });
      const prev = qc.getQueryData<ScheduleObject[]>(queryKeys.schedules());
      if (prev) {
        qc.setQueryData<ScheduleObject[]>(
          queryKeys.schedules(),
          prev.filter((row) => row.id !== id)
        );
      }
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.schedules(), ctx.prev);
      }
      setError(e.message ?? "Delete failed");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() });
    },
  });
  return (
    <div className="flex flex-col items-end">
      <button
        className="rounded-full border border-[#B05A38]/40 px-3 py-1 text-[#B05A38] text-xs disabled:opacity-50"
        disabled={mutation.isPending}
        onClick={() => {
          if (
            typeof window !== "undefined" &&
            !window.confirm("Delete this schedule?")
          ) {
            return;
          }
          mutation.mutate();
        }}
        type="button"
      >
        {mutation.isPending ? "…" : "Delete"}
      </button>
      {error && <span className="mt-1 text-[#B05A38] text-xs">{error}</span>}
    </div>
  );
}

function EditScheduleButton({ schedule }: { schedule: ScheduleObject }) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (values: { cron: string; timezone: string }) =>
      updateSchedule({
        data: {
          id: schedule.id,
          task: schedule.task,
          cron: values.cron,
          timezone: values.timezone,
          externalId: schedule.externalId ?? undefined,
        },
      }),
    // Optimistic: patch the cached row's cron/timezone so the table
    // reflects the new shape before Trigger.dev's response lands.
    onMutate: async (values) => {
      await qc.cancelQueries({ queryKey: queryKeys.schedules() });
      const prev = qc.getQueryData<ScheduleObject[]>(queryKeys.schedules());
      if (prev) {
        qc.setQueryData<ScheduleObject[]>(
          queryKeys.schedules(),
          prev.map((row) =>
            row.id === schedule.id
              ? {
                  ...row,
                  timezone: values.timezone,
                  generator: { ...row.generator, expression: values.cron },
                }
              : row
          )
        );
      }
      return { prev };
    },
    onSuccess: () => {
      setSubmitError(null);
      setOpen(false);
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.schedules(), ctx.prev);
      }
      setSubmitError(e.message ?? "Update failed");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() });
    },
  });

  // TanStack Form replaces the previous React-state pair. We re-key the
  // form to the schedule's id so opening the dialog after editing a
  // different row re-hydrates from that row's values.
  const form = useForm({
    defaultValues: {
      cron: schedule.generator.expression,
      timezone: schedule.timezone,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value);
    },
  });

  return (
    <Dialog.Root
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          form.reset({
            cron: schedule.generator.expression,
            timezone: schedule.timezone,
          });
          setSubmitError(null);
        }
      }}
      open={open}
    >
      <Dialog.Trigger asChild>
        <button
          className="rounded-full border border-border px-3 py-1 text-muted-foreground text-xs"
          type="button"
        >
          Edit
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md rounded-lg bg-card p-6 shadow-xl">
          <Dialog.Title className="font-serif text-foreground text-lg">
            Edit schedule
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-muted-foreground text-sm">
            Updates fire immediately on Trigger.dev — the next run reschedules
            to match.
          </Dialog.Description>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <div className="mt-4 space-y-3">
              <form.Field name="cron" validators={{ onChange: cronSchema }}>
                {(field) => (
                  <label className="block">
                    <span className="block text-muted-foreground text-xs uppercase tracking-wide">
                      Cron
                    </span>
                    <input
                      className="mt-1 w-full rounded border border-border bg-background px-3 py-2 font-mono text-foreground text-sm"
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      type="text"
                      value={field.state.value}
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <span className="mt-1 block text-[#B05A38] text-xs">
                        {fieldErrorMessage(field.state.meta.errors)}
                      </span>
                    ) : null}
                  </label>
                )}
              </form.Field>
              <form.Field
                name="timezone"
                validators={{ onChange: timezoneSchema }}
              >
                {(field) => (
                  <label className="block">
                    <span className="block text-muted-foreground text-xs uppercase tracking-wide">
                      Timezone (IANA)
                    </span>
                    <input
                      className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground text-sm"
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      type="text"
                      value={field.state.value}
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <span className="mt-1 block text-[#B05A38] text-xs">
                        {fieldErrorMessage(field.state.meta.errors)}
                      </span>
                    ) : null}
                  </label>
                )}
              </form.Field>
              {submitError && (
                <p className="text-[#B05A38] text-sm">{submitError}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  className="rounded-md px-4 py-2 text-foreground text-sm"
                  type="button"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <form.Subscribe
                selector={(s) => [s.canSubmit, s.isSubmitting] as const}
              >
                {([canSubmit, isSubmitting]) => (
                  <button
                    className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm disabled:opacity-50"
                    disabled={!canSubmit || isSubmitting || mutation.isPending}
                    type="submit"
                  >
                    {isSubmitting || mutation.isPending ? "Saving…" : "Save"}
                  </button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * TanStack Form's `meta.errors` is a heterogenous array — Zod issues
 * arrive as objects with a `message` field, custom validators may
 * return raw strings. Normalise to a single line.
 */
function fieldErrorMessage(errors: readonly unknown[]): string {
  return errors
    .map((e) => {
      if (typeof e === "string") {
        return e;
      }
      if (
        e &&
        typeof e === "object" &&
        "message" in e &&
        typeof (e as { message: unknown }).message === "string"
      ) {
        return (e as { message: string }).message;
      }
      return "";
    })
    .filter(Boolean)
    .join(" · ");
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
