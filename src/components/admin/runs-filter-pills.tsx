/**
 * Filter-pill row above the runs table. Each pill is "Label N" — the
 * count comes from `runFilterCounts` so the totals stay honest even when
 * the visible page only shows the most recent 50.
 */
export type RunFilter = "all" | "scrape" | "enrich" | "ai";

type RunsFilterPillsProps = {
  value: RunFilter;
  counts: { all: number; scrape: number; enrich: number; ai: number };
  onChange: (next: RunFilter) => void;
};

const ORDER: Array<{ id: RunFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "scrape", label: "Scrape" },
  { id: "enrich", label: "Enrich" },
  { id: "ai", label: "AI" },
];

export function RunsFilterPills({
  value,
  counts,
  onChange,
}: RunsFilterPillsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ORDER.map((entry) => {
        const active = entry.id === value;
        const count = counts[entry.id];
        return (
          <button
            className={
              active
                ? "rounded-full bg-foreground px-3 py-1.5 font-medium text-background text-xs"
                : "rounded-full bg-muted px-3 py-1.5 font-medium text-muted-foreground text-xs hover:bg-background"
            }
            key={entry.id}
            onClick={() => onChange(entry.id)}
            type="button"
          >
            {entry.label}{" "}
            <span
              className={
                active ? "text-background/70" : "text-muted-foreground/70"
              }
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
