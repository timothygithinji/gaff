/**
 * Feature pill row.
 *
 * Surfaces three buckets:
 *   - Positive matches (✓, copper background) — confirmed-good features.
 *   - Cautions (!, brass background) — small-print warnings from the
 *     AI extraction (`features.smallPrint[severity = "caution" | "problem"]`).
 *   - "+ FLOOR PLAN READ" eyebrow heading above the pills.
 *
 * No per-search filtering — every extracted positive surfaces. The
 * previous `aiRules`-driven hide list went away when the rules editor
 * was removed; if we want display filters again they can come back as
 * an explicit `enabledKeys` prop rather than a stored toggle list.
 */
import { Alert01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Features } from "../../lib/ai/prompt";

type Props = {
  features?: Features;
};

type PillItem = {
  key: string;
  label: string;
  variant: "positive" | "caution" | "problem";
};

/**
 * Map a small handful of well-known feature keys onto display labels.
 * Anything not in this map is silently dropped — the design only
 * accommodates a row or two of pills, so we don't try to surface every
 * boolean from the schema.
 */
const POSITIVE_LABELS: Array<{
  key: keyof Features;
  label: string;
}> = [
  { key: "hasGarden", label: "Garden" },
  { key: "hasParking", label: "Parking" },
  { key: "hasWasher", label: "Washer" },
  { key: "allowsPets", label: "Pets OK" },
  { key: "isFurnished", label: "Furnished" },
];

export function FeaturePills({ features }: Props) {
  if (!features) {
    return null;
  }

  const pills: PillItem[] = [];

  // Positive matches — only `true` boolean values surface as pills.
  // `false` / `null` (unknown) stay quiet so we don't litter the card
  // with "no garden", "no parking".
  for (const entry of POSITIVE_LABELS) {
    const value = features[entry.key];
    if (value === true) {
      pills.push({
        key: `positive-${entry.key}`,
        label: entry.label,
        variant: "positive",
      });
    }
  }

  // Floorplan layout hint. "Separate kitchen" / "Dual-aspect living" are
  // the design's flagship examples — surface a generic layout pill when
  // the AI extracts a layout categorisation.
  const layout = features.floorplan?.layout;
  if (layout === "separate") {
    pills.push({
      key: "layout-separate",
      label: "Separate kitchen",
      variant: "positive",
    });
  }

  // Small-print cautions.
  for (const sp of features.smallPrint ?? []) {
    if (sp.severity === "ok") {
      continue;
    }
    pills.push({
      key: `sp-${sp.label}`,
      label: sp.label,
      variant: sp.severity === "problem" ? "problem" : "caution",
    });
  }

  if (pills.length === 0) {
    return null;
  }

  return (
    <section>
      <p className="font-medium text-[11px] text-primary uppercase tracking-wider">
        + Floor plan read
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {pills.map((p) => (
          <FeaturePill key={p.key} label={p.label} variant={p.variant} />
        ))}
      </div>
    </section>
  );
}

const PILL_PALETTE: Record<PillItem["variant"], string> = {
  positive: "border-primary/20 bg-primary/10 text-foreground",
  caution: "border-muted-foreground/30 bg-muted text-foreground",
  problem: "border-primary/40 bg-primary/15 text-primary",
};

const PILL_ICON: Record<PillItem["variant"], typeof Tick01Icon> = {
  positive: Tick01Icon,
  caution: Alert01Icon,
  problem: Alert01Icon,
};

function FeaturePill({
  label,
  variant,
}: {
  label: string;
  variant: PillItem["variant"];
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${PILL_PALETTE[variant]}`}
    >
      <HugeiconsIcon icon={PILL_ICON[variant]} size={12} strokeWidth={2.2} />
      <span>{label}</span>
    </span>
  );
}
