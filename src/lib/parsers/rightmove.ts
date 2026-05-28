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
  TenantPreferences,
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
const NO_PETS_RE = /no\s+pets|pets\s+not\s+allowed|sorry,?\s+no\s+pets/;
const PETS_ALLOWED_RE = /pets\s+(allowed|welcome|considered)/;
const STUDENTS_ALLOWED_RE =
  /students?\s+(welcome|considered|friendly|accepted)/;
const DSS_ALLOWED_RE = /dss\s+(welcome|considered|accepted)/;
const FAMILIES_RE = /families/;

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

/**
 * Convert Rightmove's `sizings` array to square feet.
 * Each row has `{ unit, displayUnit, minimumSize, maximumSize }`.
 * Prefer the row tagged "sqft"; fall back to "sqm" × 10.7639 when only
 * metric is available. We pick the row's `maximumSize` (Rightmove agents
 * often quote a tight min/max range — the high end is the marketing one
 * users will see in the listing card).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: walks Rightmove's polymorphic sizings array trying each unit/shape (sq ft, sq m, ranges) — the fallbacks are intentional and inlined for readability.
function rightmoveSizeSqFt(sizings: unknown): number | undefined {
  if (!Array.isArray(sizings) || sizings.length === 0) {
    return undefined;
  }
  let metricMax: number | undefined;
  for (const s of sizings) {
    if (!s || typeof s !== "object") {
      continue;
    }
    const o = s as Record<string, unknown>;
    const unit = (toStringSafe(o.unit) ?? toStringSafe(o.displayUnit))
      ?.toLowerCase()
      .replace(/[^a-z]/g, "");
    const max = toNumber(o.maximumSize) ?? toNumber(o.minimumSize);
    if (max === undefined || max <= 0) {
      continue;
    }
    if (unit === "sqft" || unit === "ft2" || unit === "squarefeet") {
      return Math.round(max);
    }
    if (
      metricMax === undefined &&
      (unit === "sqm" || unit === "m2" || unit === "squaremetres")
    ) {
      metricMax = max;
    }
  }
  if (metricMax !== undefined) {
    return Math.round(metricMax * 10.7639);
  }
  return undefined;
}

const ADDED_ON_RE =
  /Added on (\d{1,2})\/(\d{1,2})\/(\d{4})|Reduced on (\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const INFO_REEL_DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const RM_INTERNAL_REF_RE = /Property reference\s+([A-Za-z0-9_-]+)/i;

/**
 * Turn Rightmove's `listingHistory.listingUpdateReason` ("Added on
 * 18/05/2026") into an ISO 8601 timestamp. Returns `undefined` for any
 * other reason ("Reduced", "Featured", etc.) — those aren't first-listed
 * dates so we shouldn't claim they are.
 */
function rightmovePublishedAt(reason: unknown): string | undefined {
  const s = toStringSafe(reason);
  if (!s) {
    return undefined;
  }
  const m = s.match(ADDED_ON_RE);
  if (!m) {
    return undefined;
  }
  const day = m[1] ?? m[4];
  const month = m[2] ?? m[5];
  const year = m[3] ?? m[6];
  if (!(day && month && year)) {
    return undefined;
  }
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/**
 * Rightmove's `features` block stores parking/garden/heating/etc. as
 * `{ alias, displayText }` arrays — empty array means "not present" (or
 * "not stated"; we can't distinguish). We surface a `tenantPreferences`
 * shape that derives just the presence/absence of pets-related text
 * from key features + description; everything else stays AI-driven.
 */
function rightmoveTenantPreferences(
  pd: Record<string, unknown>
): TenantPreferences | undefined {
  const text = pd.text as Record<string, unknown> | undefined;
  const kf = Array.isArray(pd.keyFeatures)
    ? (pd.keyFeatures as unknown[])
        .map((f) => toStringSafe(f)?.toLowerCase() ?? "")
        .join(" ")
    : "";
  const desc = (toStringSafe(text?.description) ?? "").toLowerCase();
  const blob = `${kf} ${desc}`;
  if (blob.trim().length === 0) {
    return undefined;
  }
  const has = (re: RegExp): boolean | undefined => {
    if (re.test(blob)) {
      return true;
    }
    return undefined;
  };
  const noPets = NO_PETS_RE.test(blob);
  const petsAllowed = PETS_ALLOWED_RE.test(blob);
  const studentsAllowed = STUDENTS_ALLOWED_RE.test(blob);
  const dssAllowed = DSS_ALLOWED_RE.test(blob);
  const out: TenantPreferences = {};
  if (petsAllowed) {
    out.petsAccepted = true;
  } else if (noPets) {
    out.petsAccepted = false;
  }
  if (studentsAllowed) {
    out.studentsAccepted = true;
  }
  if (dssAllowed) {
    out.dssAccepted = true;
  }
  if (has(FAMILIES_RE)) {
    out.familiesAccepted = true;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rightmoveTags(pd: Record<string, unknown>): string[] | undefined {
  const out: string[] = [];
  const tags = pd.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      const s = toStringSafe(t);
      if (s) {
        out.push(s);
      }
    }
  }
  const misInfo = pd.misInfo as Record<string, unknown> | undefined;
  if (misInfo?.featuredProperty === true) {
    out.push("Featured");
  }
  if (misInfo?.brandPlus === true) {
    out.push("Brand Plus");
  }
  return out.length > 0 ? out : undefined;
}

function rightmoveVirtualTour(virtualTours: unknown): string | undefined {
  if (!Array.isArray(virtualTours) || virtualTours.length === 0) {
    return undefined;
  }
  const first = virtualTours[0];
  if (typeof first === "string") {
    return first;
  }
  if (first && typeof first === "object") {
    return (
      toStringSafe((first as Record<string, unknown>).url) ??
      toStringSafe((first as Record<string, unknown>).iframeUrl) ??
      toStringSafe((first as Record<string, unknown>).provider)
    );
  }
  return undefined;
}

function rightmoveAgentBranchUrl(
  customer: Record<string, unknown>
): string | undefined {
  const branchId = toNumber(customer.branchId);
  const slug = toStringSafe(customer.branchName)
    ?.toLowerCase()
    .replace(/\s+/g, "-");
  if (branchId === undefined) {
    return undefined;
  }
  // Rightmove's canonical branch URL doesn't strictly need the slug —
  // the ID-only form 301s to the canonical version.
  return slug
    ? `https://www.rightmove.co.uk/estate-agents/agent/${slug}/branches/${branchId}.html`
    : `https://www.rightmove.co.uk/estate-agents/branch/${branchId}.html`;
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
 * Pull `displayText` strings out of a Rightmove `features.<category>`
 * array. The category arrays are `[{ alias, displayText }]` — empty
 * array means "not stated"; we collapse to a single comma-joined string
 * for the common single-value case, or undefined when nothing is set.
 */
function rightmoveFeatureText(arr: unknown): string | undefined {
  if (!Array.isArray(arr) || arr.length === 0) {
    return undefined;
  }
  const labels: string[] = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const label = toStringSafe((item as Record<string, unknown>).displayText);
      if (label) {
        labels.push(label);
      }
    }
  }
  return labels.length > 0 ? labels.join(", ") : undefined;
}

function rightmoveMaterialInfo(
  features: Record<string, unknown> | undefined
):
  | NonNullable<ListingDetail["materialInfo"]>
  | undefined {
  if (!features) {
    return undefined;
  }
  const out: NonNullable<ListingDetail["materialInfo"]> = {};
  const heating = rightmoveFeatureText(features.heating);
  const parking = rightmoveFeatureText(features.parking);
  const garden = rightmoveFeatureText(features.garden);
  const electricity = rightmoveFeatureText(features.electricity);
  const water = rightmoveFeatureText(features.water);
  const sewerage = rightmoveFeatureText(features.sewerage);
  const accessibility = rightmoveFeatureText(features.accessibility);
  if (heating) {
    out.heating = heating;
  }
  if (parking) {
    out.parking = parking;
  }
  if (garden) {
    out.garden = garden;
  }
  if (electricity) {
    out.electricity = electricity;
  }
  if (water) {
    out.water = water;
  }
  if (sewerage) {
    out.sewerage = sewerage;
  }
  if (accessibility) {
    out.accessibility = accessibility;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rightmoveFloodDisclosure(
  risks: Record<string, unknown> | undefined
):
  | NonNullable<ListingDetail["floodDisclosure"]>
  | undefined {
  if (!risks) {
    return undefined;
  }
  const out: NonNullable<ListingDetail["floodDisclosure"]> = {};
  if (typeof risks.floodedInLastFiveYears === "boolean") {
    out.floodedInLastFiveYears = risks.floodedInLastFiveYears;
  }
  if (typeof risks.floodDefences === "boolean") {
    out.floodDefences = risks.floodDefences;
  }
  if (Array.isArray(risks.floodSources)) {
    const srcs = (risks.floodSources as unknown[])
      .map((s) => toStringSafe(s))
      .filter((s): s is string => Boolean(s));
    if (srcs.length > 0) {
      out.floodSources = srcs;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rightmoveInfoReel(
  arr: unknown
): NonNullable<ListingDetail["infoReelItems"]> | undefined {
  if (!Array.isArray(arr) || arr.length === 0) {
    return undefined;
  }
  const out: NonNullable<ListingDetail["infoReelItems"]> = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    const entry: NonNullable<ListingDetail["infoReelItems"]>[number] = {};
    const type = toStringSafe(o.type);
    const title = toStringSafe(o.title);
    const primary = toStringSafe(o.primaryText);
    const secondary = toStringSafe(o.secondaryText);
    const tooltip = toStringSafe(o.tooltipText);
    if (type) {
      entry.type = type;
    }
    if (title) {
      entry.title = title;
    }
    if (primary) {
      entry.primaryText = primary;
    }
    if (secondary) {
      entry.secondaryText = secondary;
    }
    if (tooltip) {
      entry.tooltipText = tooltip;
    }
    if (Object.keys(entry).length > 0) {
      out.push(entry);
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Gap-fill `publishedAt` when `listingHistory.listingUpdateReason` says
 * something other than "Added on …" (e.g. "Reduced on …", "Featured").
 * `infoReelItems` carries a "Date added" / "Added" item with a DD/MM/YYYY
 * date — surface that as a fallback.
 */
function rightmoveInfoReelPublishedAt(
  reel: NonNullable<ListingDetail["infoReelItems"]> | undefined
): string | undefined {
  if (!reel) {
    return undefined;
  }
  for (const item of reel) {
    const type = (item.type ?? "").toLowerCase();
    const title = (item.title ?? "").toLowerCase();
    if (!(type.includes("date") || title.includes("added"))) {
      continue;
    }
    const blob = `${item.primaryText ?? ""} ${item.secondaryText ?? ""}`;
    const m = blob.match(INFO_REEL_DATE_RE);
    if (!m) {
      continue;
    }
    const [, day, month, year] = m;
    if (!(day && month && year)) {
      continue;
    }
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
    if (!Number.isNaN(new Date(iso).getTime())) {
      return iso;
    }
  }
  return undefined;
}

const HTTP_URL_RE = /^https?:\/\//i;

/**
 * Pull the brochure URL off `brochures[0]` and gate it on `https?://` so
 * a `javascript:` (or `data:`) scheme can't slip from a malicious agent
 * upload through to a UI `<a href>`. The portal-side data is third-party
 * and gets rendered as a clickable CTA — schemes other than HTTP(S) have
 * no legitimate brochure use case here, so we drop them at ingestion
 * rather than relying on each render site to validate.
 */
function rightmoveBrochure(brochures: unknown): string | undefined {
  if (!Array.isArray(brochures) || brochures.length === 0) {
    return undefined;
  }
  const first = brochures[0];
  const raw =
    typeof first === "string"
      ? first
      : first && typeof first === "object"
        ? toStringSafe((first as Record<string, unknown>).url)
        : undefined;
  return raw && HTTP_URL_RE.test(raw) ? raw : undefined;
}

function rightmoveAffiliations(arr: unknown): string[] | undefined {
  if (!Array.isArray(arr) || arr.length === 0) {
    return undefined;
  }
  const out: string[] = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const name = toStringSafe((item as Record<string, unknown>).name);
      if (name) {
        out.push(name);
      }
    } else {
      const s = toStringSafe(item);
      if (s) {
        out.push(s);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

function rightmoveFloorplanResized(floorplans: unknown): string[] | undefined {
  if (!Array.isArray(floorplans) || floorplans.length === 0) {
    return undefined;
  }
  const first = floorplans[0];
  if (!(first && typeof first === "object")) {
    return undefined;
  }
  const sizes = (first as Record<string, unknown>).resizedFloorplanUrls;
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return undefined;
  }
  const out: string[] = [];
  for (const s of sizes) {
    if (typeof s === "string") {
      out.push(s);
    } else if (s && typeof s === "object") {
      const url =
        toStringSafe((s as Record<string, unknown>).url) ??
        toStringSafe((s as Record<string, unknown>).srcUrl);
      if (url) {
        out.push(url);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

function rightmoveInternalRef(text: unknown): string | undefined {
  const s = toStringSafe(text);
  if (!s) {
    return undefined;
  }
  // `text.disclaimer` is HTML, e.g. "<b>Disclaimer</b> - Property reference 31242395. …"
  const m = s.match(RM_INTERNAL_REF_RE);
  return m?.[1];
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
  const livingCosts =
    (pd.livingCosts as Record<string, unknown> | undefined) ?? {};
  const listingHistory =
    (pd.listingHistory as Record<string, unknown> | undefined) ?? {};
  const feesApply = (pd.feesApply as Record<string, unknown> | undefined) ?? {};
  const featuresBlock =
    (pd.features as Record<string, unknown> | undefined) ?? undefined;
  const risks = featuresBlock?.risks as Record<string, unknown> | undefined;
  const obligations = featuresBlock?.obligations as
    | Record<string, unknown>
    | undefined;
  const customerDescription = customer.customerDescription as
    | Record<string, unknown>
    | undefined;

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
  const floorplanResizedUrls = rightmoveFloorplanResized(pd.floorplans);
  const stations = rightmoveStations(pd.nearestStations);
  const epcRating = rightmoveEpc(pd.epcGraphs);
  const infoReelItems = rightmoveInfoReel(pd.infoReelItems);
  const materialInfo = rightmoveMaterialInfo(featuresBlock);
  const floodDisclosure = rightmoveFloodDisclosure(risks);
  const listedBuilding =
    obligations && typeof obligations.listed === "boolean"
      ? obligations.listed
      : undefined;
  // pinType is the source of truth — anything other than "ACCURATE_POINT"
  // (typically "ESTIMATE") means the lat/lng is an area centroid, not the
  // door. Undefined when missing so callers can distinguish "didn't say"
  // from "said it's not accurate".
  const pinType = toStringSafe(location.pinType);
  const coordsAccurate =
    pinType === undefined ? undefined : pinType === "ACCURATE_POINT";
  // Council-tax exemption — Rightmove emits this when the property is
  // exempt from council tax (e.g. an all-bills HMO). Distinct from
  // `councilTaxIncluded`, which means the rent covers the bill.
  const councilTaxExempt =
    typeof livingCosts.councilTaxExempt === "boolean"
      ? livingCosts.councilTaxExempt
      : undefined;
  // publishedAt: prefer listingHistory.listingUpdateReason ("Added on …")
  // and fall back to the date in infoReelItems when the reason is
  // "Reduced on …" / "Featured" / etc.
  const publishedAt =
    rightmovePublishedAt(listingHistory.listingUpdateReason) ??
    rightmoveInfoReelPublishedAt(infoReelItems);
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
    sizeSqFt: rightmoveSizeSqFt(pd.sizings),
    councilTaxBand: toStringSafe(livingCosts.councilTaxBand),
    publishedAt,
    minimumTermMonths: toNumber(lettings.minimumTermInMonths),
    letType: toStringSafe(lettings.letType),
    serviceChargeAnnual: toNumber(livingCosts.annualServiceCharge),
    groundRentAnnual: toNumber(livingCosts.annualGroundRent),
    virtualTourUrl: rightmoveVirtualTour(pd.virtualTours),
    agentCompany:
      toStringSafe(customer.companyTradingName) ??
      toStringSafe(customer.companyName),
    agentBranchUrl: rightmoveAgentBranchUrl(customer),
    feesText: toStringSafe(feesApply.feesApplyText),
    tags: rightmoveTags(pd),
    tenantPreferences: rightmoveTenantPreferences(pd),
    billsIncluded: livingCosts.councilTaxIncluded === true ? true : undefined,
    coordsAccurate,
    materialInfo,
    floodDisclosure,
    listedBuilding,
    internalRef: rightmoveInternalRef(text.disclaimer),
    brochureUrl: rightmoveBrochure(pd.brochures),
    agentDescriptionHtml:
      toStringSafe(customerDescription?.descriptionHTML) ??
      toStringSafe(customerDescription?.truncatedDescriptionHTML),
    agentLogoUrl: toStringSafe(customer.logoPath),
    agentAffiliations: rightmoveAffiliations(pd.industryAffiliations),
    councilTaxExempt,
    floorplanResizedUrls,
    infoReelItems,
  };
}

function extractIdFromUrl(url: string): string | undefined {
  const m = url.match(PROPERTIES_ID_RE);
  return m ? m[1] : undefined;
}
