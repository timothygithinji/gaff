import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PriceBlock,
  formatPrice,
} from "../../src/components/ui/patterns/price-block";

describe("formatPrice", () => {
  it("formats GBP with thousands separators and falls back to em-dash", () => {
    expect(formatPrice(2800)).toBe("£2,800");
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
  });
});

describe("PriceBlock", () => {
  it("renders the price and suffix", () => {
    const html = renderToStaticMarkup(
      <PriceBlock priceMonthly={2800} size="lg" suffix="/mo" />
    );
    expect(html).toContain("£2,800");
    expect(html).toContain("/mo");
    expect(html).toContain("text-[40px]");
  });

  it("stacked layout uses the smaller suffix scale", () => {
    const html = renderToStaticMarkup(
      <PriceBlock layout="stacked" priceMonthly={1950} />
    );
    expect(html).toContain("£1,950");
    expect(html).toContain("per month");
    expect(html).toContain("items-end");
  });
});
