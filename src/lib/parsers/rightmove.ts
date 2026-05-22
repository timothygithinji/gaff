/**
 * Rightmove HTML parsers.
 *
 * - Search: `<script id="__NEXT_DATA__">` JSON, listings live at
 *   `props.pageProps.searchResults.properties`.
 * - Detail: `window.__PAGE_MODEL.data` (pooled JSON, decoded via
 *   `extractRightmoveModel`). Detail fields live under `propertyData.*`.
 */

import {
  extractPostcode,
  extractScriptJson,
  probe,
  toNumber,
  coerceString as toStringSafe,
} from "./common";
import { extractRightmoveModel } from "./page-model";
import type {
  Furnished,
  ListingDetail,
  ListingSummary,
  NearestStation,
} from "./types";

const SEARCH_PATHS: (string | number)[][] = [
  ["props", "pageProps", "searchResults", "properties"],
  ["props", "pageProps", "searchResults", "results"],
  ["props", "pageProps", "searchResults", "data", "properties"],
  ["props", "pageProps", "searchResult", "properties"],
  ["props", "pageProps", "properties"],
];

const NON_DIGITS_RE = /[^\d]/g;
const PROPERTIES_ID_RE = /\/properties\/(\d+)/;

/** Best-effort: pull a numeric monthly price from a Rightmove listing. */
function rightmoveMonthlyPrice(
  raw: Record<string, unknown>
): number | undefined {
  const price = raw.price as
    | { amount?: unknown; frequency?: unknown; displayPrices?: unknown }
    | undefined;
  if (!price) {
    return undefined;
  }
  const amount = toNumber(price.amount);
  const freq = toStringSafe(price.frequency)?.toLowerCase();
  if (amount !== undefined) {
    if (freq === "weekly") {
      return Math.round((amount * 52) / 12);
    }
    // Rightmove search amounts are usually already pcm. Default to amount.
    return amount;
  }
  return undefined;
}

function rightmovePostcode(raw: Record<string, unknown>): string | undefined {
  const addr = raw.displayAddress as string | undefined;
  return extractPostcode(addr);
}

function parseRightmoveSummary(
  raw: Record<string, unknown>
): ListingSummary | null {
  const id = toStringSafe(raw.id);
  if (!id) {
    return null;
  }
  const propertyUrl = toStringSafe(raw.propertyUrl);
  const url = propertyUrl
    ? `https://www.rightmove.co.uk${propertyUrl.startsWith("/") ? "" : "/"}${propertyUrl}`
    : `https://www.rightmove.co.uk/properties/${id}`;
  const displayAddress = toStringSafe(raw.displayAddress) ?? "";
  const subtype = toStringSafe(raw.propertySubType);
  const fullDesc = toStringSafe(raw.propertyTypeFullDescription);
  const title = subtype ?? fullDesc ?? displayAddress;

  const location = raw.location as
    | { latitude?: unknown; longitude?: unknown }
    | undefined;

  return {
    portal: "rightmove",
    portalListingId: id,
    url,
    title,
    addressRaw: displayAddress,
    postcode: rightmovePostcode(raw),
    bedrooms: toNumber(raw.bedrooms),
    bathrooms: toNumber(raw.bathrooms),
    priceMonthly: rightmoveMonthlyPrice(raw),
    propertyType: subtype ?? fullDesc,
    lat: toNumber(location?.latitude),
    lng: toNumber(location?.longitude),
  };
}

/**
 * Parse a Rightmove rentals search results page.
 * Throws if `__NEXT_DATA__` or the listings array can't be located —
 * that signals the page shape has changed.
 */
export function parseRightmoveSearch(html: string): ListingSummary[] {
  const nextData = extractScriptJson(html, "__NEXT_DATA__");
  const found = probe(nextData, SEARCH_PATHS);
  if (!found || !Array.isArray(found.value)) {
    throw new Error(
      "Rightmove search: listings array not found at any known path"
    );
  }
  const out: ListingSummary[] = [];
  for (const item of found.value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const summary = parseRightmoveSummary(item as Record<string, unknown>);
      if (summary) {
        out.push(summary);
      }
    }
  }
  return out;
}

function rightmoveFurnishType(s: string | undefined): Furnished | undefined {
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

function rightmoveDetailPrice(
  prices: Record<string, unknown> | undefined
): number | undefined {
  if (!prices) {
    return undefined;
  }
  const primary = toStringSafe(prices.primaryPrice);
  // e.g. "£2,500 pcm" — strip non-numerics
  if (primary) {
    const n = Number.parseInt(primary.replace(NON_DIGITS_RE, ""), 10);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return undefined;
}

function rightmovePhotos(images: unknown): string[] {
  if (!Array.isArray(images)) {
    return [];
  }
  const out: string[] = [];
  for (const img of images) {
    if (img && typeof img === "object") {
      const url =
        toStringSafe((img as Record<string, unknown>).url) ??
        toStringSafe((img as Record<string, unknown>).srcUrl) ??
        toStringSafe((img as Record<string, unknown>).resizedImageUrl);
      if (url) {
        out.push(url);
      }
    } else if (typeof img === "string") {
      out.push(img);
    }
  }
  return out;
}

function rightmoveFloorplan(floorplans: unknown): string | undefined {
  if (!Array.isArray(floorplans) || floorplans.length === 0) {
    return undefined;
  }
  const first = floorplans[0];
  if (first && typeof first === "object") {
    return (
      toStringSafe((first as Record<string, unknown>).url) ??
      toStringSafe((first as Record<string, unknown>).resizedFloorplanUrl) ??
      toStringSafe((first as Record<string, unknown>).srcUrl)
    );
  }
  return typeof first === "string" ? first : undefined;
}

function rightmoveStations(stations: unknown): NearestStation[] | undefined {
  if (!Array.isArray(stations) || stations.length === 0) {
    return undefined;
  }
  const out: NearestStation[] = [];
  for (const s of stations) {
    if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      const name = toStringSafe(o.name);
      if (!name) {
        continue;
      }
      const types = Array.isArray(o.types)
        ? (o.types as unknown[])
            .map((t) => toStringSafe(t))
            .filter((t): t is string => Boolean(t))
        : undefined;
      out.push({
        name,
        distanceMiles: toNumber(o.distance),
        types,
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

function rightmoveEpc(epcGraphs: unknown): string | undefined {
  if (!Array.isArray(epcGraphs) || epcGraphs.length === 0) {
    return undefined;
  }
  // Rightmove returns EPC image URLs, not the rating letter. We expose
  // the URL via `epcRating` only when no letter is available — but most
  // of the time the rating itself isn't in __PAGE_MODEL.
  const first = epcGraphs[0];
  if (first && typeof first === "object") {
    return toStringSafe((first as Record<string, unknown>).url);
  }
  return undefined;
}

/**
 * Parse a Rightmove property detail page.
 * Throws if `window.__PAGE_MODEL` can't be located.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mostly null-coalescing chains and field mapping; refactor would reduce readability.
export function parseRightmoveDetail(html: string): ListingDetail {
  const root = extractRightmoveModel(html) as Record<string, unknown>;
  const pd = root.propertyData as Record<string, unknown> | undefined;
  if (!pd) {
    throw new Error("Rightmove detail: propertyData missing from __PAGE_MODEL");
  }

  const address = (pd.address as Record<string, unknown> | undefined) ?? {};
  const prices = (pd.prices as Record<string, unknown> | undefined) ?? {};
  const location = (pd.location as Record<string, unknown> | undefined) ?? {};
  const text = (pd.text as Record<string, unknown> | undefined) ?? {};
  const lettings = (pd.lettings as Record<string, unknown> | undefined) ?? {};
  const customer = (pd.customer as Record<string, unknown> | undefined) ?? {};

  const id =
    toStringSafe(pd.id) ??
    extractIdFromUrl(toStringSafe(pd.canonicalUrl) ?? "");
  if (!id) {
    throw new Error(
      "Rightmove detail: could not derive listing id from __PAGE_MODEL"
    );
  }

  const displayAddress = toStringSafe(address.displayAddress) ?? "";
  const outcode = toStringSafe(address.outcode);
  const incode = toStringSafe(address.incode);
  const postcode =
    outcode && incode
      ? `${outcode} ${incode}`
      : (outcode ?? extractPostcode(displayAddress));

  const propertyType = toStringSafe(pd.propertySubType);
  const title =
    toStringSafe(text.propertyPhrase) ?? propertyType ?? displayAddress;

  const photos = rightmovePhotos(pd.images);
  const floorplanUrl = rightmoveFloorplan(pd.floorplans);
  const stations = rightmoveStations(pd.nearestStations);
  const epcRating = rightmoveEpc(pd.epcGraphs);
  const keyFeaturesRaw = pd.keyFeatures;
  const keyFeatures = Array.isArray(keyFeaturesRaw)
    ? (keyFeaturesRaw as unknown[])
        .map((f) => toStringSafe(f))
        .filter((f): f is string => Boolean(f))
    : undefined;

  return {
    portal: "rightmove",
    portalListingId: id,
    url: `https://www.rightmove.co.uk/properties/${id}`,
    title,
    addressRaw: displayAddress,
    postcode,
    bedrooms: toNumber(pd.bedrooms),
    bathrooms: toNumber(pd.bathrooms),
    priceMonthly: rightmoveDetailPrice(prices),
    propertyType,
    lat: toNumber(location.latitude),
    lng: toNumber(location.longitude),
    description: toStringSafe(text.description),
    availableFrom: toStringSafe(lettings.letAvailableDate),
    furnished: rightmoveFurnishType(toStringSafe(lettings.furnishType)),
    deposit: toNumber(lettings.deposit),
    photos,
    floorplanUrl,
    agentName:
      toStringSafe(customer.branchDisplayName) ??
      toStringSafe(customer.branchName),
    agentPhone: toStringSafe(customer.contactTelephone),
    keyFeatures:
      keyFeatures && keyFeatures.length > 0 ? keyFeatures : undefined,
    epcRating,
    nearestStations: stations,
  };
}

function extractIdFromUrl(url: string): string | undefined {
  const m = url.match(PROPERTIES_ID_RE);
  return m ? m[1] : undefined;
}
