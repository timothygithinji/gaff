/**
 * Recent-runs table for the admin dashboard.
 *
 * Renders a unified scrape + AI runs feed. Each row carries a kind tag,
 * a friendly model-label chip, a target (portal / outcode for scrape,
 * listing title for AI), a relative timestamp, duration, cost, and a
 * status pill.
 */
import { Badge } from "../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import type { RunRow } from "../../server/functions/admin";

type RunsTableProps = {
  rows: RunRow[];
  emptyLabel?: string;
};

export function RunsTable({
  rows,
  emptyLabel = "No runs yet — once your schedules fire you'll see them here.",
}: RunsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-muted p-8 text-center">
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-muted">
      <Table>
        <TableHeader className="bg-card">
          <TableRow className="border-border">
            <TableHead className="px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Task
            </TableHead>
            <TableHead className="px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Model
            </TableHead>
            <TableHead className="px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Target
            </TableHead>
            <TableHead className="px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Started
            </TableHead>
            <TableHead className="px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Dur.
            </TableHead>
            <TableHead className="px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Cost
            </TableHead>
            <TableHead className="px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow className="border-border" key={`${row.kind}:${row.id}`}>
              <TableCell className="px-4 py-3 font-medium text-foreground">
                {row.task}
              </TableCell>
              <TableCell className="px-4 py-3">
                {row.modelLabel ? (
                  <Badge
                    className="bg-background text-[11px] text-muted-foreground"
                    variant="secondary"
                  >
                    {row.modelLabel}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-[28ch] truncate px-4 py-3 text-foreground">
                {row.target}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {relativeTime(row.startedAt)}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {row.duration === undefined ? "—" : `${row.duration}s`}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {row.costUsd === undefined ? "—" : `$${row.costUsd.toFixed(4)}`}
              </TableCell>
              <TableCell className="px-4 py-3">
                <StatusPill status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusPill({ status }: { status: RunRow["status"] }) {
  if (status === "success") {
    return (
      <Badge className="bg-emerald-100 text-[11px] text-emerald-700 uppercase tracking-wide hover:bg-emerald-100">
        Success
      </Badge>
    );
  }
  if (status === "failure") {
    return (
      <Badge className="bg-destructive/15 text-[11px] text-destructive uppercase tracking-wide hover:bg-destructive/15">
        Failure
      </Badge>
    );
  }
  return (
    <Badge className="bg-muted text-[11px] text-muted-foreground uppercase tracking-wide hover:bg-muted">
      Running
    </Badge>
  );
}

function relativeTime(date: Date): string {
  const d = date instanceof Date ? date : new Date(date as unknown as string);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) {
    return `${sec}s ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.round(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  const day = Math.round(hr / 24);
  if (day < 7) {
    return `${day}d ago`;
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
