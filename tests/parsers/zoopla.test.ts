import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseZooplaDetail, parseZooplaSearch } from "../../src/lib/parsers";

const FIXTURE = (name: string) =>
  readFileSync(resolve(__dirname, "../fixtures", name), "utf8");

const DIGITS_RE = /^\d+$/;
const ZOOPLA_URL_RE = /^https:\/\/www\.zoopla\.co\.uk\//;
const ZOOPLA_DETAIL_URL_RE =
  /^https:\/\/www\.zoopla\.co\.uk\/to-rent\/details\/\d+\//;
const ZOOPLA_CDN_RE = /^https:\/\/lid\.zoocdn\.com\//;
const FLIGHT_ERROR_RE = /RSC flight chunks/;

describe("parseZooplaSearch", () => {
  const html = FIXTURE("zoopla-search-2026-05.html");
  const listings = parseZooplaSearch(html);

  it("returns multiple listings", () => {
    expect(listings.length).toBeGreaterThan(5);
  });

  it("every listing has portal, id, url, title, addressRaw", () => {
    for (const l of listings) {
      expect(l.portal).toBe("zoopla");
      expect(l.portalListingId).toMatch(DIGITS_RE);
      expect(l.url).toMatch(ZOOPLA_URL_RE);
      expect(l.title.length).toBeGreaterThan(0);
      expect(typeof l.addressRaw).toBe("string");
    }
  });

  it("at least 70% of listings have bedrooms and a monthly price", () => {
    const withBeds = listings.filter((l) => typeof l.bedrooms === "number");
    const withPrice = listings.filter(
      (l) => typeof l.priceMonthly === "number"
    );
    expect(withBeds.length / listings.length).toBeGreaterThan(0.7);
    expect(withPrice.length / listings.length).toBeGreaterThan(0.7);
  });

  it("priceMonthly values are in plausible range", () => {
    for (const l of listings) {
      if (l.priceMonthly === undefined) {
        continue;
      }
      expect(l.priceMonthly).toBeGreaterThan(200);
      expect(l.priceMonthly).toBeLessThan(200_000);
    }
  });

  it("throws when given non-Zoopla HTML", () => {
    expect(() =>
      parseZooplaSearch("<html><body>nope</body></html>")
    ).toThrowError(FLIGHT_ERROR_RE);
  });
});

describe("parseZooplaDetail", () => {
  const html = FIXTURE("zoopla-detail-2026-05.html");
  const detail = parseZooplaDetail(html);

  it("has portal-listing identity + URL", () => {
    expect(detail.portal).toBe("zoopla");
    expect(detail.portalListingId).toMatch(DIGITS_RE);
    expect(detail.url).toMatch(ZOOPLA_DETAIL_URL_RE);
  });

  it("has bedrooms, bathrooms, price, lat/lng", () => {
    expect(detail.bedrooms).toBeGreaterThan(0);
    expect(detail.bathrooms).toBeGreaterThan(0);
    expect(detail.priceMonthly).toBeGreaterThan(500);
    expect(detail.priceMonthly).toBeLessThan(200_000);
    expect(detail.lat).toBeGreaterThan(49);
    expect(detail.lat).toBeLessThan(61);
    expect(detail.lng).toBeGreaterThan(-9);
    expect(detail.lng).toBeLessThan(2);
  });

  it("photos are absolute https URLs on the Zoopla CDN", () => {
    expect(detail.photos.length).toBeGreaterThan(0);
    for (const p of detail.photos) {
      expect(p).toMatch(ZOOPLA_CDN_RE);
    }
  });

  it("address contains the outcode", () => {
    expect(detail.postcode).toBeDefined();
    expect(detail.addressRaw).toContain(detail.postcode ?? "");
  });

  it("has agent details (name + phone)", () => {
    expect(detail.agentName?.length ?? 0).toBeGreaterThan(0);
    expect(detail.agentPhone?.length ?? 0).toBeGreaterThan(0);
  });

  it("throws when no RSC flight chunks are present", () => {
    expect(() =>
      parseZooplaDetail("<html><body>nope</body></html>")
    ).toThrowError(FLIGHT_ERROR_RE);
  });
});
