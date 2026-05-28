import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseRightmoveDetail,
  parseRightmoveSearch,
} from "../../src/lib/parsers";

const FIXTURE = (name: string) =>
  readFileSync(resolve(__dirname, "../fixtures", name), "utf8");

const POSTCODE_OUTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\b/;
const DIGITS_RE = /^\d+$/;
const RIGHTMOVE_URL_RE = /^https:\/\/www\.rightmove\.co\.uk\//;
const RIGHTMOVE_MEDIA_RE = /^https:\/\/media\.rightmove\.co\.uk\//;
const RIGHTMOVE_FLOORPLAN_RE =
  /^https:\/\/media\.rightmove\.co\.uk\/property-floorplan\//;
const NW3_RE = /^NW3\b/;
const NEXT_DATA_RE = /__NEXT_DATA__/;
const PAGE_MODEL_RE = /__PAGE_MODEL/;

describe("parseRightmoveSearch", () => {
  const html = FIXTURE("rightmove-search-2026-05.html");
  const listings = parseRightmoveSearch(html);

  it("returns at least one listing", () => {
    expect(listings.length).toBeGreaterThan(0);
  });

  it("every listing has portal, id, url, title, addressRaw", () => {
    for (const l of listings) {
      expect(l.portal).toBe("rightmove");
      expect(l.portalListingId).toMatch(DIGITS_RE);
      expect(l.url).toMatch(RIGHTMOVE_URL_RE);
      expect(l.title.length).toBeGreaterThan(0);
      expect(typeof l.addressRaw).toBe("string");
    }
  });

  it("first listing has a sensible price (between 200 and 50000 pcm)", () => {
    const first = listings[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    expect(first.priceMonthly).toBeDefined();
    expect(first.priceMonthly).toBeGreaterThan(200);
    expect(first.priceMonthly).toBeLessThan(50_000);
  });

  it("first listing has lat/lng inside the UK bounding box", () => {
    const first = listings[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    expect(first.lat).toBeGreaterThan(49);
    expect(first.lat).toBeLessThan(61);
    expect(first.lng).toBeGreaterThan(-9);
    expect(first.lng).toBeLessThan(2);
  });

  it("first listing has a UK postcode outcode", () => {
    const first = listings[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    expect(first.postcode).toBeDefined();
    expect(first.postcode).toMatch(POSTCODE_OUTCODE_RE);
  });

  it("throws when given non-Rightmove HTML", () => {
    expect(() =>
      parseRightmoveSearch("<html><body>nope</body></html>")
    ).toThrowError(NEXT_DATA_RE);
  });
});

describe("parseRightmoveDetail", () => {
  const html = FIXTURE("rightmove-detail-2026-05.html");
  const detail = parseRightmoveDetail(html);

  it("is the 88608822 listing", () => {
    expect(detail.portalListingId).toBe("88608822");
    expect(detail.url).toBe("https://www.rightmove.co.uk/properties/88608822");
  });

  it("identifies a 2-bed flat in NW3", () => {
    expect(detail.bedrooms).toBe(2);
    expect(detail.propertyType?.toLowerCase()).toBe("flat");
    expect(detail.postcode).toMatch(NW3_RE);
  });

  it("has price, lat/lng, agent, photos, floorplan", () => {
    expect(detail.priceMonthly).toBeGreaterThan(1000);
    expect(detail.priceMonthly).toBeLessThan(20_000);
    expect(detail.lat).toBeGreaterThan(51);
    expect(detail.lat).toBeLessThan(52);
    expect(detail.lng).toBeGreaterThan(-1);
    expect(detail.lng).toBeLessThan(0);
    expect(detail.photos.length).toBeGreaterThan(0);
    for (const p of detail.photos) {
      expect(p).toMatch(RIGHTMOVE_MEDIA_RE);
    }
    expect(detail.floorplanUrl).toMatch(RIGHTMOVE_FLOORPLAN_RE);
    expect(detail.agentName?.length ?? 0).toBeGreaterThan(0);
  });

  it("captures availableFrom + furnished + deposit", () => {
    expect(detail.availableFrom).toBeDefined();
    expect(detail.furnished).toBeDefined();
    expect(detail.deposit).toBeGreaterThan(0);
  });

  it("captures councilTaxBand letter (A–H)", () => {
    expect(detail.councilTaxBand).toBeDefined();
    expect(detail.councilTaxBand).toMatch(/^[A-H]$/);
  });

  it("captures letType and minimumTermMonths when present", () => {
    expect(detail.letType).toBeDefined();
    expect(detail.letType?.length ?? 0).toBeGreaterThan(0);
    // minimumTermInMonths is `null` in the fixture — undefined is correct.
    expect(
      detail.minimumTermMonths === undefined ||
        typeof detail.minimumTermMonths === "number"
    ).toBe(true);
  });

  it("captures publishedAt as ISO timestamp when listingHistory has 'Added on'", () => {
    expect(detail.publishedAt).toBeDefined();
    expect(detail.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("captures agentCompany and agentBranchUrl", () => {
    expect(detail.agentCompany?.length ?? 0).toBeGreaterThan(0);
    expect(detail.agentBranchUrl).toMatch(
      /^https:\/\/www\.rightmove\.co\.uk\/estate-agents\//
    );
  });

  it("captures feesText covering tenancy fees", () => {
    expect(detail.feesText?.length ?? 0).toBeGreaterThan(0);
  });

  it("captures coordsAccurate from location.pinType", () => {
    expect(detail.coordsAccurate).toBe(true);
  });

  it("captures internalRef from text.disclaimer", () => {
    expect(detail.internalRef).toMatch(/^\d+$/);
  });

  it("captures brochureUrl + agentLogoUrl + agentAffiliations + agentDescriptionHtml", () => {
    expect(detail.brochureUrl).toMatch(/\.pdf$/);
    expect(detail.agentLogoUrl?.length ?? 0).toBeGreaterThan(0);
    expect((detail.agentAffiliations ?? []).length).toBeGreaterThan(0);
    expect(detail.agentDescriptionHtml?.length ?? 0).toBeGreaterThan(0);
  });

  it("captures materialInfo from features.{heating,parking,water,…}", () => {
    expect(detail.materialInfo).toBeDefined();
    expect(detail.materialInfo?.heating?.length ?? 0).toBeGreaterThan(0);
  });

  it("captures councilTaxExempt as a boolean when livingCosts emits it", () => {
    expect(typeof detail.councilTaxExempt).toBe("boolean");
  });

  it("captures infoReelItems as a non-empty array with typed entries", () => {
    expect((detail.infoReelItems ?? []).length).toBeGreaterThan(0);
    const first = (detail.infoReelItems ?? [])[0];
    expect(first?.type?.length ?? 0).toBeGreaterThan(0);
  });

  it("throws when __PAGE_MODEL is absent", () => {
    expect(() =>
      parseRightmoveDetail("<html><body>nope</body></html>")
    ).toThrowError(PAGE_MODEL_RE);
  });
});
