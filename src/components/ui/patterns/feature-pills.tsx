import type { Features } from "@/lib/ai/prompt";
import { cn } from "@/lib/utils";
/**
 * Shared "what stands out / watch-outs" primitives — the AI `Features`
 * (highlights + watchouts) rendered one way for the whole app.
 *
 * The same data has two legitimate presentations, both of which had drifted
 * into separate copies:
 *   - `FeaturePills` — compact label-only chips (review hero + review card).
 *   - `FeatureList`  — bordered rows with the `detail` sentence (listing
 *     detail's "What stands out" / "In the small print").
 *
 * Both consume `toPills(features)` and the one `SEVERITY` token map, so the
 * three-state severity (positive · caution · problem) can't fork again. The
 * severity distinction is deliberate: `caution` is copper, `problem` is the
 * darker `warning-text` red — previously both rendered copper (identical),
 * discarding the signal the AI already produces.
 */
import {
  Alert02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type PillSeverity = "positive" | "caution" | "problem";

export type Pill = {
  severity: PillSeverity;
  label: string;
  detail: string | null;
};

/** Default cap shared by both presentations; full set lives on the detail page. */
export const FEATURE_PILL_MAX = 6;

/**
 * Flatten `Features` into a single ordered list — highlights (positive) first,
 * then watchouts (caution/problem). Pure; exported for contract tests and so
 * both device trees of a feature shape identically.
 */
export function toPills(features: Features | null | undefined): Pill[] {
  if (!features) {
    return [];
  }
  return [
    ...highlightsToPills(features.highlights ?? []),
    ...watchoutsToPills(features.watchouts ?? []),
  ];
}

/** Highlights → positive pills. For features split into separate arrays
 * (listing detail keeps "what stands out" and "small print" as two sections). */
export function highlightsToPills(items: Features["highlights"]): Pill[] {
  return items.map((h) => ({
    severity: "positive" as const,
    label: h.label,
    detail: h.detail,
  }));
}

/** Watchouts → caution/problem pills, preserving severity. */
export function watchoutsToPills(items: Features["watchouts"]): Pill[] {
  return items.map((w) => ({
    severity: w.severity,
    label: w.label,
    detail: w.detail,
  }));
}

type SeverityToken = {
  icon: typeof Tick02Icon;
  /** Icon colour. */
  text: string;
  /** Chip border + tint. */
  chip: string;
};

/**
 * Icon + colour for a severity, for callers that render their own layout
 * (e.g. the desktop review "what stands out" fixed-slot grid) but want the
 * same 3-state glyph/colour as the chips.
 */
export function severityToken(severity: PillSeverity): {
  icon: typeof Tick02Icon;
  text: string;
} {
  return { icon: SEVERITY[severity].icon, text: SEVERITY[severity].text };
}

const SEVERITY: Record<PillSeverity, SeverityToken> = {
  positive: {
    icon: Tick02Icon,
    text: "text-success",
    chip: "border-line bg-mist",
  },
  caution: {
    icon: Alert02Icon,
    text: "text-warning",
    chip: "border-copper/40 bg-copper/10",
  },
  problem: {
    icon: Alert02Icon,
    text: "text-warning-text",
    chip: "border-warning-text/40 bg-warning-text/10",
  },
};

/**
 * Compact chip row. `variant` flips arrangement only: desktop fills a fixed
 * grid, mobile wraps. Caps at {@link FEATURE_PILL_MAX}.
 */
export function FeaturePills({
  items,
  variant = "wrap",
  max = FEATURE_PILL_MAX,
}: {
  items: Pill[];
  variant?: "wrap" | "grid";
  max?: number;
}) {
  const visible = items.slice(0, max);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div
      className={cn(
        "gap-1.5",
        variant === "grid"
          ? "grid grid-cols-2 gap-x-6"
          : "flex flex-wrap items-center"
      )}
    >
      {visible.map((p, idx) => {
        const tone = SEVERITY[p.severity];
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 border px-[9px] py-[5px] text-[11px] text-navy leading-[14px]",
              tone.chip
            )}
            key={`${p.severity}:${p.label}:${idx}`}
          >
            <HugeiconsIcon
              className={cn("shrink-0", tone.text)}
              icon={tone.icon}
              size={12}
              strokeWidth={2}
            />
            {p.label}
          </span>
        );
      })}
    </div>
  );
}

function FeatureRow({ item, dense }: { item: Pill; dense: boolean }) {
  const tone = SEVERITY[item.severity];
  return (
    <div className={cn("flex items-start gap-2.5", dense ? "py-2.5" : "py-3.5")}>
      <HugeiconsIcon
        className={cn("mt-px shrink-0", tone.text)}
        icon={tone.icon}
        size={16}
        strokeWidth={1.8}
      />
      <div className="flex min-w-0 grow basis-0 flex-col gap-0.5">
        <p className="font-medium text-[13px] text-foreground leading-4">
          {item.label}
        </p>
        {item.detail ? (
          <p className="text-[11px] text-slate-2 leading-[14px]">{item.detail}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Detailed rows — label + optional `detail` sentence, severity-tinted icon.
 * Two presentations over one row renderer:
 *   - `variant="list"` (default) — bordered card, single column, hairline
 *     dividers (mobile listing-detail's "what stands out" / "small print").
 *   - `variant="grid"` — two-column, no border (the caller's card supplies
 *     chrome), no dividers (desktop combined AI card).
 * Renders the empty hint when there's nothing yet (enrichment pending).
 */
export function FeatureList({
  items,
  emptyHint,
  variant = "list",
}: {
  items: Pill[];
  emptyHint?: string;
  variant?: "list" | "grid";
}) {
  if (items.length === 0) {
    return emptyHint ? (
      <div className="rounded-md border border-line bg-card p-5 text-center text-[12px] text-slate-2">
        {emptyHint}
      </div>
    ) : null;
  }
  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-x-6">
        {items.map((item, idx) => (
          <FeatureRow dense item={item} key={`${item.severity}:${item.label}:${idx}`} />
        ))}
      </div>
    );
  }
  return (
    <ul className="flex flex-col rounded-md border border-line bg-card px-4">
      {items.map((item, idx) => (
        <li
          className={cn(idx < items.length - 1 && "border-mist border-b")}
          key={`${item.severity}:${item.label}:${idx}`}
        >
          <FeatureRow dense={false} item={item} />
        </li>
      ))}
    </ul>
  );
}
