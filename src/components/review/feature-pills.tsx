/**
 * Highlights + watchouts pill row beneath the review card spec strip.
 *
 * Rebuilt for the v2 AI schema. Renders up to ~6 pills:
 *   - Highlights (✓, copper background) — positives from
 *     `features.highlights[]`.
 *   - Watchouts (!, brass/destructive background) — negatives from
 *     `features.watchouts[]`, coloured by severity.
 *
 * Capped to 6 total to keep the card dense but not overwhelming; the
 * full list is on the listing-detail page.
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

const MAX_PILLS = 6;

export function FeaturePills({ features }: Props) {
  if (!features) {
    return null;
  }

  const pills: PillItem[] = [];

  for (const [idx, h] of (features.highlights ?? []).entries()) {
    pills.push({
      key: `highlight-${idx}-${h.label}`,
      label: h.label,
      variant: "positive",
    });
  }
  for (const [idx, w] of (features.watchouts ?? []).entries()) {
    pills.push({
      key: `watchout-${idx}-${w.label}`,
      label: w.label,
      variant: w.severity === "problem" ? "problem" : "caution",
    });
  }

  if (pills.length === 0) {
    return null;
  }

  const visible = pills.slice(0, MAX_PILLS);

  return (
    <section>
      <p className="font-medium text-[11px] text-primary uppercase tracking-wider">
        + What stands out
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {visible.map((p) => (
          <FeaturePill key={p.key} label={p.label} variant={p.variant} />
        ))}
      </div>
    </section>
  );
}

const PILL_PALETTE: Record<PillItem["variant"], string> = {
  positive: "border-primary/20 bg-primary/10 text-foreground",
  caution: "border-muted-foreground/30 bg-muted text-foreground",
  problem: "border-destructive/40 bg-destructive/10 text-destructive",
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
