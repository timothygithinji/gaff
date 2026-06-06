import { describe, expect, it } from "vitest";
import { parseOpenrentDetail } from "./openrent";

/** Minimal OpenRent detail page: a <title> + canonical link for the id. */
function detailHtml(title: string, id = "2917453"): string {
  return `<!doctype html><html><head>
    <title>${title} - OpenRent</title>
    <link rel="canonical" href="https://www.openrent.co.uk/property-to-rent/london/x/${id}" />
  </head><body></body></html>`;
}

describe("parseOpenrentDetail — title shapes", () => {
  it("parses a standard single-word type", () => {
    const d = parseOpenrentDetail(
      detailHtml("London - 3 Bed Flat, Acacia Road, N3 - To Rent Now for £2,000.00 p/m")
    );
    expect(d.bedrooms).toBe(3);
    expect(d.priceMonthly).toBe(2000);
    expect(d.propertyType).toBe("Flat");
  });

  it("parses a multi-word property type (the £4k 4-bed leak)", () => {
    const d = parseOpenrentDetail(
      detailHtml(
        "London - 4 Bed Terraced House, East End Road, N2 - To Rent Now for £4,000.00 p/m"
      )
    );
    expect(d.bedrooms).toBe(4);
    expect(d.priceMonthly).toBe(4000);
    expect(d.propertyType).toBe("Terraced House");
  });

  it("parses a studio as 0 bedrooms with its price", () => {
    const d = parseOpenrentDetail(
      detailHtml(
        "London - Studio Flat, Lichfield Grove, N3 - To Rent Now for £1,050.00 p/m"
      )
    );
    expect(d.bedrooms).toBe(0);
    expect(d.priceMonthly).toBe(1050);
    expect(d.propertyType).toBe("Studio Flat");
  });

  it("parses a shared room as 1 bedroom with its type", () => {
    const d = parseOpenrentDetail(
      detailHtml(
        "London - Room in a Shared Flat, Muswell Hill Broadway, N10 - To Rent Now for £1,100.00 p/m"
      )
    );
    expect(d.bedrooms).toBe(1);
    expect(d.priceMonthly).toBe(1100);
    expect(d.propertyType).toBe("Room in a Shared Flat");
  });
});
