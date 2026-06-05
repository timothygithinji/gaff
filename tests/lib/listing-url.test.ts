import { describe, expect, it } from "vitest";
import { parseListingUrl } from "../../src/lib/listing-url";

describe("parseListingUrl", () => {
  it("parses a Rightmove listing URL", () => {
    expect(
      parseListingUrl("https://www.rightmove.co.uk/properties/123456789#/?channel=RES_LET")
    ).toEqual({
      portal: "rightmove",
      portalListingId: "123456789",
      canonicalUrl: "https://www.rightmove.co.uk/properties/123456789",
    });
  });

  it("parses a Zoopla listing URL", () => {
    expect(
      parseListingUrl("https://www.zoopla.co.uk/to-rent/details/70123456/?search_identifier=abc")
    ).toEqual({
      portal: "zoopla",
      portalListingId: "70123456",
      canonicalUrl: "https://www.zoopla.co.uk/to-rent/details/70123456/",
    });
  });

  it("parses both OpenRent URL shapes", () => {
    expect(parseListingUrl("https://www.openrent.co.uk/2829191")).toEqual({
      portal: "openrent",
      portalListingId: "2829191",
      canonicalUrl: "https://www.openrent.co.uk/2829191",
    });
    expect(
      parseListingUrl(
        "https://www.openrent.co.uk/property-to-rent/london/3-bed-flat-hampstead-nw3/2829191"
      )
    ).toEqual({
      portal: "openrent",
      portalListingId: "2829191",
      canonicalUrl: "https://www.openrent.co.uk/2829191",
    });
  });

  it("accepts bare and www hosts but not unrelated domains", () => {
    expect(parseListingUrl("https://rightmove.co.uk/properties/1")?.portal).toBe(
      "rightmove"
    );
    expect(parseListingUrl("https://www.example.com/properties/1")).toBeNull();
  });

  it("rejects search-results and non-listing URLs", () => {
    expect(
      parseListingUrl("https://www.rightmove.co.uk/property-to-rent/find.html?x=1")
    ).toBeNull();
    expect(parseListingUrl("https://www.zoopla.co.uk/to-rent/property/london/")).toBeNull();
    expect(parseListingUrl("https://www.openrent.co.uk/properties-to-rent/london")).toBeNull();
  });

  it("rejects junk / non-URLs", () => {
    for (const s of ["", "not a url", "ftp://x", "rightmove.co.uk/properties/1"]) {
      expect(parseListingUrl(s), s).toBeNull();
    }
  });
});
