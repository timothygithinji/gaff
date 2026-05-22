/**
 * Recent-runs table for the admin dashboard.
 *
 * Renders a unified scrape + AI runs feed. Each row carries a kind tag,
 * a friendly model-label chip, a target (portal / outcode for scrape,
 * listing title for AI), a relative timestamp, duration, cost, and a
 * status pill.
 *
 * Status pill palette uses the mineral spec:
 *   - success → muted moss (#7A8C5C)
 *   - failure → muted rust (#B05A38)
 *   - running → brass
 */
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
      <div className="rounded-2xl bg-bone p-8 text-center">
        <p className="text-brass text-sm">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-brass/15 bg-bone">
      <table className="w-full text-left text-sm">
        <thead className="bg-paper text-brass text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 font-semibold">Task</th>
            <th className="px-4 py-3 font-semibold">Model</th>
            <th className="px-4 py-3 font-semibold">Target</th>
            <th className="px-4 py-3 font-semibold">Started</th>
            <th className="px-4 py-3 font-semibold">Dur.</th>
            <th className="px-4 py-3 font-semibold">Cost</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brass/10">
          {rows.map((row) => (
            <tr key={`${row.kind}:${row.id}`}>
              <td className="px-4 py-3 font-medium text-ink">{row.task}</td>
              <td className="px-4 py-3">
                {row.modelLabel ? (
                  <span className="rounded-full bg-ground px-2 py-0.5 text-[11px] text-brass">
                    {row.modelLabel}
                  </span>
                ) : (
                  <span className="text-brass/60">—</span>
                )}
              </td>
              <td className="max-w-[28ch] truncate px-4 py-3 text-ink">
                {row.target}
              </td>
              <td className="px-4 py-3 text-brass">
                {relativeTime(row.startedAt)}
              </td>
              <td className="px-4 py-3 text-brass">
                {row.duration === undefined ? "—" : `${row.duration}s`}
              </td>
              <td className="px-4 py-3 text-brass">
                {row.costUsd === undefined ? "—" : `$${row.costUsd.toFixed(4)}`}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: RunRow["status"] }) {
  if (status === "success") {
    return (
      <span className="rounded-full bg-[#7A8C5C]/15 px-2 py-0.5 text-[#3F4A2F] text-[11px] uppercase tracking-wide">
        Success
      </span>
    );
  }
  if (status === "failure") {
    return (
      <span className="rounded-full bg-[#B05A38]/15 px-2 py-0.5 text-[#B05A38] text-[11px] uppercase tracking-wide">
        Failure
      </span>
    );
  }
  return (
    <span className="rounded-full bg-brass/15 px-2 py-0.5 text-[11px] text-brass uppercase tracking-wide">
      Running
    </span>
  );
}

/**
 * Relative-time formatter — "3m ago", "2h ago", "yesterday", etc.
 * Falls through to a locale string for anything older than a week so
 * the dashboard never claims "47d ago" without context.
 */
function relativeTime(date: Date): string {
  // Server functions serialise Date as a string; the type system claims
  // Date but at runtime the value is a string after JSON round-trip.
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
