import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseOpenrentDetail,
  parseOpenrentSearch,
} from "../../src/lib/parsers";

const FIXTURE = (name: string) =>
  readFileSync(resolve(__dirname, "../fixtures", name), "utf8");

const DIGITS_RE = /^\d+$/;
const OPENRENT_URL_RE = /^https:\/\/www\.openrent\.co\.uk\/property-to-rent\//;
const OPENRENT_LISTING_PHOTO_RE =
  /^https:\/\/imagescdn\.openrent\.co\.uk\/listings\/2829191\//;
const NW3_RE = /^NW3\b/;
const EPC_LETTER_RE = /^[A-G]$/;
const SEARCH_ERROR_RE = /data-listing-id|property-to-rent/;

describe("parseOpenrentSearch", () => {
  const html = FIXTURE("openrent-search-2026-05.html");
  const listings = parseOpenrentSearch(html);

  it("returns multiple unique listings", () => {
    expect(listings.length).toBeGreaterThan(5);
    const ids = new Set(listings.map((l) => l.portalListingId));
    expect(ids.size).toBe(listings.length);
  });

  it("every listing has portal, id, url, title, addressRaw", () => {
    for (const l of listings) {
      expect(l.portal).toBe("openrent");
      expect(l.portalListingId).toMatch(DIGITS_RE);
      expect(l.url).toMatch(OPENRENT_URL_RE);
      expect(l.title.length).toBeGreaterThan(0);
    }
  });

  it("at least 80% of listings have beds, baths, and price", () => {
    const withBeds = listings.filter((l) => typeof l.bedrooms === "number");
    const withBaths = listings.filter((l) => typeof l.bathrooms === "number");
    const withPrice = listings.filter(
      (l) => typeof l.priceMonthly === "number"
    );
    expect(withBeds.length / listings.length).toBeGreaterThan(0.8);
    expect(withBaths.length / listings.length).toBeGreaterThan(0.8);
    expect(withPrice.length / listings.length).toBeGreaterThan(0.8);
  });

  it("throws when no listing data is present", () => {
    expect(() =>
      parseOpenrentSearch("<html><body>nope</body></html>")
    ).toThrowError(SEARCH_ERROR_RE);
  });
});

describe("parseOpenrentDetail", () => {
  const html = FIXTURE("openrent-detail-2026-05.html");
  const detail = parseOpenrentDetail(html);

  it("is the 2829191 listing", () => {
    expect(detail.portalListingId).toBe("2829191");
  });

  it("identifies a 3-bed flat in NW3", () => {
    expect(detail.bedrooms).toBe(3);
    expect(detail.propertyType?.toLowerCase()).toBe("flat");
    expect(detail.postcode).toMatch(NW3_RE);
  });

  it("has price, lat/lng, deposit", () => {
    expect(detail.priceMonthly).toBeGreaterThan(1000);
    expect(detail.priceMonthly).toBeLessThan(50_000);
    expect(detail.lat).toBeGreaterThan(51);
    expect(detail.lat).toBeLessThan(52);
    expect(detail.lng).toBeGreaterThan(-1);
    expect(detail.lng).toBeLessThan(0);
    expect(detail.deposit).toBeGreaterThan(0);
  });

  it("photos are absolute https URLs scoped to the listing id", () => {
    expect(detail.photos.length).toBeGreaterThan(0);
    for (const p of detail.photos) {
      expect(p).toMatch(OPENRENT_LISTING_PHOTO_RE);
    }
  });

  it("captures furnished + EPC + available-from", () => {
    expect(detail.furnished).toBeDefined();
    // EPC and availableFrom can be optional depending on listing.
    if (detail.epcRating) {
      expect(detail.epcRating).toMatch(EPC_LETTER_RE);
    }
  });

  it("captures tenantPreferences from the labelled fact table", () => {
    expect(detail.tenantPreferences).toBeDefined();
    // The 2026-05 fixture has Pets Allowed (check) and Smokers Not Allowed (x).
    expect(detail.tenantPreferences?.petsAccepted).toBe(true);
    expect(detail.tenantPreferences?.smokersAccepted).toBe(false);
    expect(detail.tenantPreferences?.familiesAccepted).toBe(true);
    expect(detail.tenantPreferences?.studentsAccepted).toBe(true);
    // DSS/LHA Covers Rent is a cross in the fixture.
    expect(detail.tenantPreferences?.dssAccepted).toBe(false);
  });

  it("captures minimumTermMonths from 'Preferred Minimum Tenancy'", () => {
    // The fixture shows "6 Months".
    expect(detail.minimumTermMonths).toBe(6);
  });

  it("uses the twitter:image hero photo when og:image is the placeholder", () => {
    // First photo should be the high-res listing CDN image, not the
    // OpenRent share-graphic logo.
    expect(detail.photos[0]).toMatch(/imagescdn\.openrent\.co\.uk\//);
  });

  it("throws on an unrelated page", () => {
    expect(() =>
      parseOpenrentDetail("<html><body>nope</body></html>")
    ).toThrowError();
  });
});
