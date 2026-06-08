/**
 * "Notes & viewing" editor for a pipeline card.
 *
 * A controlled modal (parent owns the open flag so it can be opened from
 * a card's ⋯ menu) that edits the household's shared notes + scheduled
 * viewing for a cluster. Self-contained on the data side: it owns the
 * `setPipelineDetails` mutation and optimistically patches the cached
 * pipeline so the card's chips update on the next frame, then invalidates
 * the shortlist family on settle.
 */
import { GoogleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PIPELINE_STATUSES } from "../../lib/pipeline-status";
import { queryKeys } from "../../lib/query-keys";
import {
  type PipelineCard,
  type PipelineColumns,
  setPipelineDetails,
} from "../../server/functions/pipeline";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DEFAULT_VIEWING_DURATION_MINUTES,
  buildGoogleCalendarUrl,
} from "./pipeline-shared";

/** Date → `YYYY-MM-DDTHH:mm` in local time, for `datetime-local` value. */
function toDatetimeLocalValue(date: Date | null): string {
  if (!date) {
    return "";
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Patch one card's notes + viewing date in the cached board. */
function patchCard(
  columns: PipelineColumns,
  clusterId: string,
  notes: string | null,
  viewingDate: Date | null,
  viewingDurationMinutes: number | null
): PipelineColumns {
  const next = {} as PipelineColumns;
  for (const status of PIPELINE_STATUSES) {
    next[status] = columns[status].map((c) =>
      c.clusterId === clusterId
        ? { ...c, notes, viewingDate, viewingDurationMinutes }
        : c
    );
  }
  return next;
}

/** Viewing-length options offered in the modal (minutes). */
const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;

function durationLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function NotesViewingDialog({
  card,
  open,
  onOpenChange,
}: {
  card: PipelineCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(card.notes ?? "");
  const [viewingDate, setViewingDate] = useState(
    toDatetimeLocalValue(card.viewingDate)
  );
  const [duration, setDuration] = useState<number>(
    card.viewingDurationMinutes ?? DEFAULT_VIEWING_DURATION_MINUTES
  );
  const [error, setError] = useState<string | null>(null);

  // Reseed the fields from the card each time the modal opens — the card
  // may have changed (or been edited elsewhere) since last time.
  useEffect(() => {
    if (open) {
      setNotes(card.notes ?? "");
      setViewingDate(toDatetimeLocalValue(card.viewingDate));
      setDuration(card.viewingDurationMinutes ?? DEFAULT_VIEWING_DURATION_MINUTES);
      setError(null);
    }
  }, [open, card.notes, card.viewingDate, card.viewingDurationMinutes]);

  const mutation = useMutation({
    mutationFn: (input: {
      notes: string;
      viewingDate: string | null;
      viewingDurationMinutes: number | null;
    }) => setPipelineDetails({ data: { clusterId: card.clusterId, ...input } }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: queryKeys.shortlist() });
      const previous = qc.getQueryData<PipelineColumns>(
        queryKeys.shortlistPipeline()
      );
      if (previous) {
        const trimmed = input.notes.trim();
        qc.setQueryData<PipelineColumns>(
          queryKeys.shortlistPipeline(),
          patchCard(
            previous,
            card.clusterId,
            trimmed.length > 0 ? trimmed : null,
            input.viewingDate ? new Date(input.viewingDate) : null,
            input.viewingDate ? input.viewingDurationMinutes : null
          )
        );
      }
      return { previous };
    },
    onError: (e: Error, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKeys.shortlistPipeline(), ctx.previous);
      }
      setError(e.message ?? "Couldn't save. Try again.");
    },
    onSuccess: () => {
      onOpenChange(false);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.shortlist() });
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              notes,
              viewingDate: viewingDate.trim() ? viewingDate : null,
              viewingDurationMinutes: viewingDate.trim() ? duration : null,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-navy">Notes &amp; viewing</DialogTitle>
            <DialogDescription>
              Shared with everyone in your household — jot down what to ask the
              agent and pin a viewing date for{" "}
              <span className="text-foreground">{card.headline.addressRaw}</span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label
              className="font-semibold text-[12px] text-navy"
              htmlFor="viewing-date"
            >
              Viewing date
            </label>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                id="viewing-date"
                onChange={(e) => setViewingDate(e.target.value)}
                type="datetime-local"
                value={viewingDate}
              />
              <select
                aria-label="Viewing duration"
                className="shrink-0 rounded-md border border-border bg-card px-2 py-2 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                disabled={!viewingDate}
                onChange={(e) => setDuration(Number(e.target.value))}
                value={duration}
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            {viewingDate ? (
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-[12px] text-slate underline-offset-2 hover:underline"
                  onClick={() => setViewingDate("")}
                  type="button"
                >
                  Clear viewing date
                </button>
                <a
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-semibold text-[12px] text-navy transition-colors hover:bg-mist"
                  href={buildGoogleCalendarUrl({
                    address: card.headline.addressRaw,
                    start: new Date(viewingDate),
                    durationMinutes: duration,
                    details: notes.trim() || undefined,
                  })}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <HugeiconsIcon icon={GoogleIcon} size={13} strokeWidth={1.5} />
                  Add to Google Calendar
                </a>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="font-semibold text-[12px] text-navy"
              htmlFor="card-notes"
            >
              Notes
            </label>
            <textarea
              className="min-h-[96px] min-w-0 resize-y rounded-md border border-border bg-card px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              id="card-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. ask about the boiler, parking, when it's available…"
              value={notes}
            />
          </div>

          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              }
            />
            <Button loading={mutation.isPending} loadingText="Saving…" type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
