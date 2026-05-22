/**
 * Zoopla HTML parsers.
 *
 * Zoopla is a Next.js App Router site, so the data lives in RSC flight
 * chunks emitted as `self.__next_f.push([1, "..."])`. We parse those
 * chunks via `parseFlight`, then locate well-known shapes:
 *
 * - Search: an object with `regularListingsFormatted: Listing[]`. Each
 *   listing has `features: [{ iconId, content }]` that holds bed/bath
 *   counts, plus a `price` string and `image.src` URL.
 * - Detail: the merged listing record holds `counts`, `pricing`,
 *   `propertyImage[]` (filename-only), `location.coordinates`, `epc` +
 *   `derivedEPC`, `branchV2`, `floorPlan`, and a `detailedDescription`
 *   that is sometimes an RSC reference rather than a real string.
 */

import {
  extractPostcode,
  toNumber,
  coerceString as toStringSafe,
} from "./common";
import { findByKey, findInFlight, parseFlight } from "./rsc-flight";
import type { Furnished, ListingDetail, ListingSummary } from "./types";

const ZOOPLA_IMG_BASE = "https://lid.zoocdn.com/645/430";
const ZOOPLA_PRICE_NUM_RE = /£?\s*([\d,]+)/;
const ZOOPLA_RSC_REF_RE = /^\$[A-Za-z0-9]+$/;
const COMMA_RE = /,/g;

function zooplaSummaryUrl(raw: Record<string, unknown>): string {
  const uris = raw.listingUris as { detail?: unknown } | undefined;
  const detail = toStringSafe(uris?.detail);
  if (detail) {
    return detail.startsWith("http")
      ? detail
      : `https://www.zoopla.co.uk${detail.startsWith("/") ? "" : "/"}${detail}`;
  }
  const id = toStringSafe(raw.listingId);
  return id
    ? `https://www.zoopla.co.uk/to-rent/details/${id}/`
    : "https://www.zoopla.co.uk";
}

/**
 * Parse a Zoopla `price` / `priceTitle` string like "£2,350 pcm" or
 * "£500 pw" into a monthly figure.
 */
function priceStringToMonthly(s: string | undefined): number | undefined {
  if (!s) {
    return undefined;
  }
  const numMatch = s.match(ZOOPLA_PRICE_NUM_RE);
  if (!numMatch) {
    return undefined;
  }
  const n = Number.parseInt((numMatch[1] ?? "").replace(COMMA_RE, ""), 10);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  const lower = s.toLowerCase();
  if (lower.includes("pw") || lower.includes("per week")) {
    return Math.round((n * 52) / 12);
  }
  return n;
}

function zooplaSearchPrice(raw: Record<string, unknown>): number | undefined {
  const priceStr = toStringSafe(raw.price) ?? toStringSafe(raw.priceTitle);
  return priceStringToMonthly(priceStr);
}

function countFromFeatures(
  features: unknown,
  iconId: string
): number | undefined {
  if (!Array.isArray(features)) {
    return undefined;
  }
  for (const f of features) {
    if (f && typeof f === "object") {
      const o = f as Record<string, unknown>;
      if (o.iconId === iconId) {
        return toNumber(o.content);
      }
    }
  }
  return undefined;
}

function zooplaSearchPropertyType(
  raw: Record<string, unknown>
): string | undefined {
  const pt = toStringSafe(raw.propertyType);
  if (pt) {
    return pt;
  }
  // `listingType` is "regular" / "featured" — not a property type, skip.
  return undefined;
}

function parseZooplaSummary(
  raw: Record<string, unknown>
): ListingSummary | null {
  const id = toStringSafe(raw.listingId) ?? toStringSafe(raw.id);
  if (!id) {
    return null;
  }
  const address = toStringSafe(raw.address) ?? "";
  const propertyType = zooplaSearchPropertyType(raw);
  const title = toStringSafe(raw.title) ?? propertyType ?? address;
  const outcode = toStringSafe(raw.outcode);
  const postcode = outcode ?? extractPostcode(address);

  return {
    portal: "zoopla",
    portalListingId: id,
    url: zooplaSummaryUrl(raw),
    title,
    addressRaw: address,
    postcode,
    bedrooms: countFromFeatures(raw.features, "bed"),
    bathrooms: countFromFeatures(raw.features, "bath"),
    priceMonthly: zooplaSearchPrice(raw),
    propertyType,
    lat: toNumber(raw.latitude),
    lng: toNumber(raw.longitude),
  };
}

/**
 * Parse a Zoopla rentals search results page.
 * Throws when no RSC chunk contains `regularListingsFormatted`.
 */
export function parseZooplaSearch(html: string): ListingSummary[] {
  const flight = parseFlight(html);
  if (flight.size === 0) {
    throw new Error(
      "Zoopla search: no RSC flight chunks found (page shape changed?)"
    );
  }
  const wrapper = findByKey(flight, "regularListingsFormatted") as {
    regularListingsFormatted?: unknown;
  } | null;
  if (
    !wrapper ||
    !Array.isArray(
      (wrapper as { regularListingsFormatted?: unknown[] })
        .regularListingsFormatted
    )
  ) {
    throw new Error(
      "Zoopla search: regularListingsFormatted not found in flight chunks"
    );
  }
  const arr = (wrapper as { regularListingsFormatted: unknown[] })
    .regularListingsFormatted;
  const out: ListingSummary[] = [];
  for (const item of arr) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const summary = parseZooplaSummary(item as Record<string, unknown>);
      if (summary) {
        out.push(summary);
      }
    }
  }
  return out;
}

function zooplaFurnished(s: string | undefined): Furnished | undefined {
  if (!s) {
    return undefined;
  }
  const v = s.toLowerCase();
  if (v.includes("part")) {
    return "part_furnished";
  }
  if (v.includes("un")) {
    return "unfurnished";
  }
  if (v.includes("furnished")) {
    return "furnished";
  }
  return undefined;
}

/**
 * Detail listings have a unique constellation of keys we can match on.
 * `counts` + `displayAddress` + `propertyImage` is highly specific to the
 * Zoopla GraphQL listing shape.
 */
function isZooplaDetailListing(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const o = v as Record<string, unknown>;
  const hasAddress = "displayAddress" in o || "address" in o;
  const hasCounts =
    ("counts" in o && o.counts !== null && typeof o.counts === "object") ||
    "numBedrooms" in o;
  return hasAddress && hasCounts;
}

function findZooplaListing(
  flight: ReturnType<typeof parseFlight>
): Record<string, unknown> | null {
  const hit = findInFlight(flight, isZooplaDetailListing);
  if (hit) {
    return hit as Record<string, unknown>;
  }
  const wrapper = findByKey(flight, "listingDetails") as {
    listingDetails?: unknown;
  } | null;
  if (wrapper?.listingDetails && typeof wrapper.listingDetails === "object") {
    return wrapper.listingDetails as Record<string, unknown>;
  }
  return null;
}

function zooplaDetailPhotos(o: Record<string, unknown>): string[] {
  const images = o.propertyImage;
  if (!Array.isArray(images)) {
    return [];
  }
  const out: string[] = [];
  for (const item of images) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const filename = toStringSafe((item as Record<string, unknown>).filename);
    if (filename) {
      out.push(`${ZOOPLA_IMG_BASE}/${filename}`);
    }
  }
  return out;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tries multiple known Zoopla floorplan shapes; flattening would obscure the fallbacks.
function zooplaDetailFloorplan(o: Record<string, unknown>): string | undefined {
  // Prefer floorPlan.image[].filename (matches photo CDN), fall back to
  // content.floorPlan[0].original (already a URL).
  const fp = o.floorPlan as { image?: unknown[] } | undefined;
  if (Array.isArray(fp?.image) && fp.image.length > 0) {
    const first = fp.image[0];
    if (first && typeof first === "object") {
      const filename = toStringSafe(
        (first as Record<string, unknown>).filename
      );
      if (filename) {
        return `https://lc.zoocdn.com/${filename}`;
      }
    }
  }
  const content = o.content as { floorPlan?: unknown[] } | undefined;
  if (Array.isArray(content?.floorPlan) && content.floorPlan.length > 0) {
    const first = content.floorPlan[0];
    if (first && typeof first === "object") {
      const original = toStringSafe(
        (first as Record<string, unknown>).original
      );
      if (original) {
        return original;
      }
    } else if (typeof first === "string") {
      return first;
    }
  }
  return undefined;
}

function zooplaDetailPrice(o: Record<string, unknown>): number | undefined {
  const pricing = o.pricing as
    | {
        label?: unknown;
        internalValue?: unknown;
        rentFrequencyLabel?: unknown;
      }
    | undefined;
  if (pricing) {
    const internal = toNumber(pricing.internalValue);
    const freq = toStringSafe(pricing.rentFrequencyLabel)?.toLowerCase();
    if (internal !== undefined) {
      if (freq === "pw" || freq === "per week") {
        return Math.round((internal * 52) / 12);
      }
      return internal;
    }
    const fromLabel = priceStringToMonthly(toStringSafe(pricing.label));
    if (fromLabel !== undefined) {
      return fromLabel;
    }
  }
  return priceStringToMonthly(
    toStringSafe(o.priceTitle) ?? toStringSafe(o.price)
  );
}

function zooplaDetailEpc(o: Record<string, unknown>): string | undefined {
  const derived = o.derivedEPC as { efficiencyRating?: unknown } | undefined;
  const rating = toStringSafe(derived?.efficiencyRating);
  if (rating) {
    return rating.toUpperCase();
  }
  return undefined;
}

function zooplaPropertyType(o: Record<string, unknown>): string | undefined {
  return (
    toStringSafe(o.propertyType) ??
    toStringSafe(o.subPropertyType) ??
    toStringSafe(o.listingType)
  );
}

/**
 * Parse a Zoopla detail page.
 * Throws when no RSC chunks are found or no listing-shaped object is
 * located within them.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mostly null-coalescing chains over a single source object.
export function parseZooplaDetail(html: string): ListingDetail {
  const flight = parseFlight(html);
  if (flight.size === 0) {
    throw new Error(
      "Zoopla detail: no RSC flight chunks found (page shape changed?)"
    );
  }
  const c = findZooplaListing(flight);
  if (!c) {
    throw new Error(
      "Zoopla detail: no listing-shaped object found in flight chunks"
    );
  }

  const id = toStringSafe(c.listingId) ?? toStringSafe(c.id);
  if (!id) {
    throw new Error("Zoopla detail: missing listingId/id");
  }

  const address =
    toStringSafe(c.displayAddress) ??
    toStringSafe(c.address) ??
    toStringSafe(c.addressLabel) ??
    "";
  const location = c.location as
    | {
        coordinates?: { latitude?: unknown; longitude?: unknown };
        outcode?: unknown;
      }
    | undefined;
  const outcode = toStringSafe(location?.outcode) ?? toStringSafe(c.outcode);
  const postcode = outcode ?? extractPostcode(address);

  const counts = c.counts as Record<string, unknown> | undefined;
  const branch = (c.branchV2 ?? c.branch) as
    | Record<string, unknown>
    | undefined;

  const bedrooms = toNumber(counts?.numBedrooms) ?? toNumber(c.numBedrooms);
  const bathrooms = toNumber(counts?.numBathrooms) ?? toNumber(c.numBathrooms);

  const lat = toNumber(location?.coordinates?.latitude) ?? toNumber(c.latitude);
  const lng =
    toNumber(location?.coordinates?.longitude) ?? toNumber(c.longitude);

  const propertyType = zooplaPropertyType(c);
  const title = toStringSafe(c.title) ?? propertyType ?? address;

  const photos = zooplaDetailPhotos(c);

  // `detailedDescription` is sometimes the RSC reference string ("$78"),
  // sometimes the full text. Only accept it when it doesn't look like a
  // bare reference.
  const desc = toStringSafe(c.detailedDescription);
  const description = desc && !ZOOPLA_RSC_REF_RE.test(desc) ? desc : undefined;

  const features = c.features as
    | { bullets?: unknown[]; highlights?: unknown[] }
    | undefined;
  const keyFeatures = Array.isArray(features?.bullets)
    ? features.bullets
        .map((f) => toStringSafe(f))
        .filter((f): f is string => Boolean(f))
    : undefined;

  return {
    portal: "zoopla",
    portalListingId: id,
    url: `https://www.zoopla.co.uk/to-rent/details/${id}/`,
    title,
    addressRaw: address,
    postcode,
    bedrooms,
    bathrooms,
    priceMonthly: zooplaDetailPrice(c),
    propertyType,
    lat,
    lng,
    description,
    availableFrom: toStringSafe(c.availableFrom),
    furnished: zooplaFurnished(toStringSafe(c.furnishedState)),
    deposit: toNumber(c.deposit),
    photos,
    floorplanUrl: zooplaDetailFloorplan(c),
    agentName: toStringSafe(branch?.branchName) ?? toStringSafe(branch?.name),
    agentPhone:
      toStringSafe(branch?.redirectPhone) ??
      toStringSafe(branch?.redirectLettingsPhone) ??
      toStringSafe(branch?.phone),
    keyFeatures:
      keyFeatures && keyFeatures.length > 0 ? keyFeatures : undefined,
    epcRating: zooplaDetailEpc(c),
    nearestStations: undefined,
  };
}
