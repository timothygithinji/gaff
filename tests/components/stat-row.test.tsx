import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toStatCells } from "../../src/components/review/review-shapers";
import { StatRow } from "../../src/components/ui/patterns/stat-row";
import type { ReviewCard } from "../../src/server/functions/review";

// Minimal ReviewCard slice — toStatCells only reads these fields.
const card = {
  nearestStation: { name: "Bounds Green", distanceMiles: 0.3, walkMinutes: 7 },
  epcRating: "C",
  councilTaxBand: "D",
  epcFloorAreaSqFt: null,
  headlineListing: { sizeSqFt: 750 },
} as unknown as ReviewCard;

describe("toStatCells", () => {
  it("produces the canonical Transport·EPC·Council·Size set with tone", () => {
    const cells = toStatCells(card);
    expect(cells.map((c) => c.label)).toEqual([
      "Transport",
      "EPC",
      "Council tax",
      "Size",
    ]);
    expect(cells[0]).toMatchObject({ value: "7", unit: "min", sub: "Bounds Green" });
    expect(cells[1]).toMatchObject({ value: "C", tone: "good" });
    expect(cells[3]).toMatchObject({ value: "750", unit: "sq ft" });
  });

  it("falls back to em-dash + neutral tone when data is missing", () => {
    const bare = {
      nearestStation: null,
      epcRating: undefined,
      councilTaxBand: null,
      epcFloorAreaSqFt: null,
      headlineListing: { sizeSqFt: null },
    } as unknown as ReviewCard;
    const cells = toStatCells(bare);
    expect(cells[1]).toMatchObject({ value: "—", tone: "neutral" });
    expect(cells[3]?.value).toBe("—");
  });
});

describe("StatRow", () => {
  it("card variant shows the eyebrow, all four labels and the good tone", () => {
    const html = renderToStaticMarkup(
      <StatRow stats={toStatCells(card)} variant="card" />
    );
    expect(html).toContain("The numbers");
    expect(html).toContain("Transport");
    expect(html).toContain("Council tax");
    expect(html).toContain("text-success");
  });

  it("bare variant drops the card chrome", () => {
    const html = renderToStaticMarkup(
      <StatRow stats={toStatCells(card)} variant="bare" />
    );
    expect(html).not.toContain("The numbers");
    expect(html).toContain("Transport");
  });
});
