/**
 * Feature pill row.
 *
 * Surfaces three buckets:
 *   - Positive matches (✓, copper background) — confirmed-good features.
 *   - Cautions (!, brass background) — small-print warnings from the
 *     AI extraction (`features.smallPrint[severity = "caution" | "problem"]`).
 *   - "+ FLOOR PLAN READ" eyebrow heading above the pills.
 *
 * Display filtering: the search's `aiRules` are DISPLAY filters, not
 * prompt scopes — enrichments always carry the full feature payload, we
 * just hide pills the user has explicitly disabled from this search.
 * That keeps re-enabling a rule a render-time toggle rather than a
 * re-run of the enrichment task.
 */
import type { Features } from "../../lib/ai/prompt";
import type { StoredAiRules } from "../../server/functions/searches";

type Props = {
  features?: Features;
  aiRules: StoredAiRules;
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
  rule?: string;
}> = [
  { key: "hasGarden", label: "Garden" },
  { key: "hasParking", label: "Parking" },
  { key: "hasWasher", label: "Washer" },
  { key: "allowsPets", label: "Pets OK" },
  { key: "isFurnished", label: "Furnished" },
];

/**
 * Returns the set of rule ids the user has DISABLED for this search.
 * Filtering is "show by default, hide if disabled" — so a brand-new
 * enrichment row with no rules on the search will surface every
 * positive pill.
 */
function disabledRuleIds(aiRules: StoredAiRules): Set<string> {
  return new Set(aiRules.rules.filter((r) => !r.enabled).map((r) => r.id));
}

export function FeaturePills({ features, aiRules }: Props) {
  if (!features) {
    return null;
  }

  const disabled = disabledRuleIds(aiRules);
  const pills: PillItem[] = [];

  // Positive matches — only `true` boolean values surface as pills.
  // `false` / `null` (unknown) stay quiet so we don't litter the card
  // with "no garden", "no parking".
  for (const entry of POSITIVE_LABELS) {
    if (disabled.has(entry.key)) {
      continue;
    }
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
      <p className="font-medium text-[11px] text-copper uppercase tracking-wider">
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
  positive: "border-copper/20 bg-copper/10 text-ink",
  caution: "border-brass/30 bg-brass/10 text-ink",
  problem: "border-copper/40 bg-copper/15 text-copper",
};

const PILL_GLYPH: Record<PillItem["variant"], string> = {
  positive: "✓",
  caution: "!",
  problem: "!",
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
      <span aria-hidden className="font-semibold">
        {PILL_GLYPH[variant]}
      </span>
      <span>{label}</span>
    </span>
  );
}
