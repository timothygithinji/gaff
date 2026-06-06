import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PortalList,
  portalLabel,
  toPortalRows,
} from "../../src/components/ui/patterns/portal-list";

const SPREAD = [
  {
    portal: "openrent",
    url: "https://openrent/1",
    priceMonthly: 1900,
    agentName: null,
    agentEmail: null,
    deltaFromHeadline: 0,
  },
  {
    portal: "rightmove",
    url: "https://rightmove/1",
    priceMonthly: 2000,
    agentName: "Foxtons",
    agentEmail: null,
    deltaFromHeadline: 100,
  },
];

describe("toPortalRows", () => {
  it("marks the first row as headline and flags a real spread", () => {
    const { rows, hasSpread } = toPortalRows(SPREAD);
    expect(rows[0]?.isHeadline).toBe(true);
    expect(rows[1]?.isHeadline).toBe(false);
    expect(hasSpread).toBe(true);
  });

  it("reports no spread when every portal matches the headline price", () => {
    const { hasSpread } = toPortalRows(
      SPREAD.map((p) => ({ ...p, priceMonthly: 1900, deltaFromHeadline: 0 }))
    );
    expect(hasSpread).toBe(false);
  });
});

describe("portalLabel", () => {
  it("prettifies known portals and passes through others", () => {
    expect(portalLabel("rightmove")).toBe("Rightmove");
    expect(portalLabel("openrent")).toBe("OpenRent");
    expect(portalLabel("spareroom")).toBe("spareroom");
  });
});

describe("PortalList (card)", () => {
  it("crowns the cheapest headline and shows the +£ delta on dearer rows", () => {
    const { rows, hasSpread } = toPortalRows(SPREAD);
    const html = renderToStaticMarkup(
      <PortalList hasSpread={hasSpread} rows={rows} variant="card" />
    );
    expect(html).toContain("£1,900");
    expect(html).toContain("£2,000");
    expect(html).toContain("Cheapest");
    expect(html).toContain("+£100");
    // Direct (OpenRent, no agent) subtitle.
    expect(html).toContain("Direct · no fees");
  });
});
