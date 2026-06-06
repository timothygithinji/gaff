/**
 * The review "numbers" — a small grid of labelled stats (Transport · EPC ·
 * Council tax · Size). One primitive for both device trees over a shared
 * `toStatCells` shaper, so the set + tone can't drift (desktop used to show 4
 * stats, mobile only 2).
 *
 * Four cells lay out as a tidy 2×2; fewer sit in a single row. `variant`
 * flips chrome only: `card` is the desktop "The numbers" card (20px values),
 * `bare` is the mobile in-card strip (top hairline, 18px values).
 */
import { cn } from "@/lib/utils";

export type StatTone = "good" | "bad" | "neutral";

export type StatCell = {
  label: string;
  value: string;
  /** Small unit suffix beside the value, e.g. "min". */
  unit?: string;
  /** Sub-line under the value, e.g. a station name. */
  sub?: string;
  /** Colour the value: good (green) / bad (copper) / neutral (navy). */
  tone?: StatTone;
};

function toneClass(tone: StatTone | undefined): string {
  if (tone === "good") {
    return "text-success";
  }
  if (tone === "bad") {
    return "text-destructive";
  }
  return "text-navy";
}

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function StatRow({
  stats,
  variant,
}: {
  stats: StatCell[];
  variant: "card" | "bare";
}) {
  if (stats.length === 0) {
    return null;
  }
  // 4 reads as a 2×2 (the card is narrow); fewer sit in one row.
  const cols = stats.length === 4 ? 2 : Math.min(Math.max(stats.length, 1), 4);
  const valueSize = variant === "card" ? "text-[20px] leading-6" : "text-[18px] leading-[22px]";

  const grid = (
    <div className={cn("grid gap-x-3 gap-y-4", GRID_COLS[cols] ?? "grid-cols-2")}>
      {stats.map((cell, i) => (
        <div
          className={cn(
            "flex flex-col gap-1",
            i % cols !== 0 && "border-mist border-l pl-3"
          )}
          key={cell.label}
        >
          <span className="font-semibold text-[9px] text-slate uppercase leading-3 tracking-[0.12em]">
            {cell.label}
          </span>
          <div className="flex items-baseline gap-[3px]">
            <span className={cn("font-medium", valueSize, toneClass(cell.tone))}>
              {cell.value}
            </span>
            {cell.unit ? (
              <span className="text-[10px] text-slate leading-3">{cell.unit}</span>
            ) : null}
          </div>
          {cell.sub ? (
            <span className="text-[10px] text-slate leading-3">{cell.sub}</span>
          ) : null}
        </div>
      ))}
    </div>
  );

  if (variant === "card") {
    return (
      <article className="flex flex-1 flex-col gap-3 rounded-[6px] border border-line bg-paper p-[18px]">
        <span className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
          The numbers
        </span>
        {grid}
      </article>
    );
  }
  return <div className="border-mist border-t pt-[18px]">{grid}</div>;
}
