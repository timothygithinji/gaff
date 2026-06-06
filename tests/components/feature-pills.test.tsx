/**
 * Contract test for the shared feature-pill primitives. Pins the converged
 * behaviour: 3-state severity (positive/caution/problem), a visible
 * problem-vs-caution distinction, the shared cap, and that FeatureList keeps
 * the `detail` sentence while FeaturePills doesn't.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FEATURE_PILL_MAX,
  FeatureList,
  FeaturePills,
  highlightsToPills,
  toPills,
  watchoutsToPills,
} from "../../src/components/ui/patterns/feature-pills";
import type { Features } from "../../src/lib/ai/prompt";

const FEATURES: Features = {
  summary: "x",
  highlights: [
    { label: "South-facing garden", detail: "Rare for the street." },
    { label: "Recently renovated", detail: null },
  ],
  watchouts: [
    { severity: "caution", label: "No washer mentioned", detail: "Ask agent." },
    { severity: "problem", label: "Deposit over cap", detail: "Illegal." },
  ],
};

describe("toPills", () => {
  it("orders highlights (positive) before watchouts and keeps severity + detail", () => {
    const pills = toPills(FEATURES);
    expect(pills.map((p) => p.severity)).toEqual([
      "positive",
      "positive",
      "caution",
      "problem",
    ]);
    expect(pills[0]?.detail).toBe("Rare for the street.");
    expect(pills[1]?.detail).toBeNull();
  });

  it("returns [] for missing features", () => {
    expect(toPills(null)).toEqual([]);
    expect(toPills(undefined)).toEqual([]);
  });

  it("item-level helpers map severity for the split listing-detail sections", () => {
    expect(highlightsToPills(FEATURES.highlights).every((p) => p.severity === "positive")).toBe(true);
    expect(watchoutsToPills(FEATURES.watchouts).map((p) => p.severity)).toEqual([
      "caution",
      "problem",
    ]);
  });
});

describe("FeaturePills (chips)", () => {
  it("renders chips with a visible caution-vs-problem distinction", () => {
    const html = renderToStaticMarkup(<FeaturePills items={toPills(FEATURES)} />);
    expect(html).toContain("South-facing garden");
    // caution = copper, problem = the darker warning-text red — must differ.
    expect(html).toContain("text-warning");
    expect(html).toContain("text-warning-text");
    expect(html).toContain("text-success");
  });

  it("caps at FEATURE_PILL_MAX", () => {
    const many: ReturnType<typeof toPills> = Array.from({ length: 10 }, (_, i) => ({
      severity: "positive" as const,
      label: `pill-${i}`,
      detail: null,
    }));
    const html = renderToStaticMarkup(<FeaturePills items={many} />);
    expect(html).toContain(`pill-${FEATURE_PILL_MAX - 1}`);
    expect(html).not.toContain(`pill-${FEATURE_PILL_MAX}`);
  });

  it("renders nothing when empty", () => {
    expect(renderToStaticMarkup(<FeaturePills items={[]} />)).toBe("");
  });
});

describe("FeatureList (detailed rows)", () => {
  it("keeps the detail sentence", () => {
    const html = renderToStaticMarkup(<FeatureList items={toPills(FEATURES)} />);
    expect(html).toContain("South-facing garden");
    expect(html).toContain("Rare for the street.");
  });

  it("shows the empty hint when there are no items", () => {
    const html = renderToStaticMarkup(
      <FeatureList emptyHint="Reading the description…" items={[]} />
    );
    expect(html).toContain("Reading the description…");
  });

  it("grid variant lays out two columns with no card border", () => {
    const html = renderToStaticMarkup(
      <FeatureList items={toPills(FEATURES)} variant="grid" />
    );
    expect(html).toContain("grid-cols-2");
    expect(html).not.toContain("border-line");
    expect(html).toContain("South-facing garden");
  });
});
