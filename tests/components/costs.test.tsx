/**
 * Tests for the costs calculation. We import the private `computeCosts`
 * shape indirectly via React rendering would tie us to the DOM; instead
 * we test through the pure data path by re-exporting nothing — so this
 * file is a thin contract test on the rendered HTML via React's
 * server-side renderToString. Lightweight enough that we don't pull in
 * @testing-library.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Costs } from "../../src/components/listing-detail/costs";
import type {
  ListingDetailCouncilTax,
  ListingDetailFineprint,
} from "../../src/server/functions/listing-detail";

const EMPTY_FINEPRINT: ListingDetailFineprint = {
  deposit: null,
  feesText: null,
  minimumTermMonths: null,
  letType: null,
  serviceChargeAnnual: null,
  groundRentAnnual: null,
  availableFrom: null,
  agentName: null,
  agentPhone: null,
  agentBranchUrl: null,
  billsIncluded: null,
  councilTaxBand: null,
  councilTax: null,
  furnished: null,
  sizeSqFt: null,
  nearestStations: [],
};

const N11_COUNCIL_TAX: ListingDetailCouncilTax = {
  authority: "Barnet",
  year: "2026-27",
  listingBand: "D",
  bands: [
    { band: "A", annualPounds: 1520, monthlyPounds: 127 },
    { band: "B", annualPounds: 1773, monthlyPounds: 148 },
    { band: "C", annualPounds: 2026, monthlyPounds: 169 },
    { band: "D", annualPounds: 2280, monthlyPounds: 190 },
    { band: "E", annualPounds: 2787, monthlyPounds: 232 },
    { band: "F", annualPounds: 3293, monthlyPounds: 274 },
    { band: "G", annualPounds: 3800, monthlyPounds: 317 },
    { band: "H", annualPounds: 4560, monthlyPounds: 380 },
  ],
};

function render(jsx: React.ReactElement) {
  return renderToStaticMarkup(jsx);
}

describe("Costs", () => {
  it("renders nothing when no cost data is present", () => {
    const html = render(
      <Costs priceMonthly={null} fineprint={EMPTY_FINEPRINT} />
    );
    expect(html).toBe("");
  });

  it("rent only — total equals rent", () => {
    const html = render(
      <Costs priceMonthly={1900} fineprint={EMPTY_FINEPRINT} />
    );
    expect(html).toContain("Rent");
    expect(html).toContain("£1,900");
    expect(html).toContain("True monthly");
  });

  it("rent + known-band council tax — total adds both", () => {
    const html = render(
      <Costs
        fineprint={{ ...EMPTY_FINEPRINT, councilTax: N11_COUNCIL_TAX }}
        priceMonthly={1900}
      />
    );
    // Band D monthly = £190 → total = £1,900 + £190 = £2,090
    expect(html).toContain("£190");
    expect(html).toContain("Barnet · Band D");
    expect(html).toContain("£2,090");
  });

  it("rent + service charge — divides annual by 12", () => {
    const html = render(
      <Costs
        fineprint={{ ...EMPTY_FINEPRINT, serviceChargeAnnual: 1200 }}
        priceMonthly={1900}
      />
    );
    // 1200/yr → 100/mo. Total = 1900 + 100 = 2000
    expect(html).toContain("Service charge");
    expect(html).toContain("£100");
    expect(html).toContain("£1,200/yr");
    expect(html).toContain("£2,000");
  });

  it("rent + deposit amortised over min term", () => {
    const html = render(
      <Costs
        fineprint={{
          ...EMPTY_FINEPRINT,
          deposit: 3200,
          minimumTermMonths: 12,
        }}
        priceMonthly={1900}
      />
    );
    // 3200 / 12 = 267 (rounded). Total = 1900 + 267 = 2167
    expect(html).toContain("Deposit");
    expect(html).toContain("£267");
    expect(html).toContain("£3,200 over 12 months");
    expect(html).toContain("£2,167");
  });

  it("deposit without term renders as one-off, informational, not in total", () => {
    const html = render(
      <Costs
        fineprint={{ ...EMPTY_FINEPRINT, deposit: 3200 }}
        priceMonthly={1900}
      />
    );
    expect(html).toContain("one-off");
    expect(html).toContain("£3,200");
    // Total stays at rent only.
    expect(html).toContain(">£1,900</span>");
  });

  it("bills included shows as positive indicator, not added to total", () => {
    const html = render(
      <Costs
        fineprint={{ ...EMPTY_FINEPRINT, billsIncluded: true }}
        priceMonthly={1900}
      />
    );
    expect(html).toContain("Bills");
    expect(html).toContain("Included");
    // Total still rent only.
    expect(html).toContain(">£1,900</span>");
  });

  it("bills NOT included flags total as partial", () => {
    const html = render(
      <Costs
        fineprint={{ ...EMPTY_FINEPRINT, billsIncluded: false }}
        priceMonthly={1900}
      />
    );
    expect(html).toContain("Extra");
    expect(html).toContain("True monthly (partial)");
    expect(html).toContain("excludes items marked above");
  });

  it("authority known but listing band unknown → council-tax row is informational", () => {
    const html = render(
      <Costs
        fineprint={{
          ...EMPTY_FINEPRINT,
          councilTax: { ...N11_COUNCIL_TAX, listingBand: null },
        }}
        priceMonthly={1900}
      />
    );
    expect(html).toContain("Barnet (band unknown)");
    expect(html).toContain("True monthly (partial)");
    // Council tax does NOT add to total here.
    expect(html).toContain(">£1,900</span>");
  });

  it("everything at once — total sums correctly", () => {
    const html = render(
      <Costs
        fineprint={{
          ...EMPTY_FINEPRINT,
          councilTax: N11_COUNCIL_TAX,
          serviceChargeAnnual: 1200,
          groundRentAnnual: 600,
          deposit: 3200,
          minimumTermMonths: 12,
          billsIncluded: true,
        }}
        priceMonthly={1900}
      />
    );
    // 1900 + 190 (CT-D) + 100 (SC) + 50 (GR) + 267 (deposit) = 2507
    expect(html).toContain("£2,507");
    // Bills included is positive, not partial.
    expect(html).not.toContain("True monthly (partial)");
  });

  it("returns null with neither rent nor any cost present", () => {
    const html = render(
      <Costs priceMonthly={null} fineprint={EMPTY_FINEPRINT} />
    );
    expect(html).toBe("");
  });
});
