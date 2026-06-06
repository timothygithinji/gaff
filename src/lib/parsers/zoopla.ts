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
  bathroomCount,
  extractDepositFromText,
  extractPostcode,
  toNumber,
  coerceString as toStringSafe,
} from "./common";
import {
  findByKey,
  findInFlight,
  parseFlight,
  resolveFlightRef,
} from "./rsc-flight";
import type {
  Furnished,
  ListingDetail,
  ListingSummary,
  TenantPreferences,
} from "./types";

// lid.zoocdn.com is an on-the-fly resize proxy: the `{w}/{h}` path segment is
// the requested render size, BUT only an allowlist of sizes resolves — sizes
// outside it 404. The largest that resolves is 1600/1200 (returns ~1600×1080
// at the source aspect); 1280, 1440, 1920, 2048 all 404. We pull at this max
// so the Worker's render-time resize (see src/lib/photo-size.ts) has the
// sharpest source to scale down from. Bump only if Zoopla widens the allowlist.
const ZOOPLA_IMG_BASE = "https://lid.zoocdn.com/1600/1200";
const ZOOPLA_PRICE_NUM_RE = /£?\s*([\d,]+)/;
const ZOOPLA_RSC_REF_RE = /^\$[A-Za-z0-9]+$/;
const COMMA_RE = /,/g;
const BAND_LETTER_RE = /^[A-H]/;
const DOUBLE_TRAILING_Z_RE = /ZZ$/;
const PETS_ALLOWED_RE = /pets\s+(allowed|welcome|considered)/;
const NO_PETS_RE = /no\s+pets|pets\s+not\s+allowed/;
const STUDENTS_ALLOWED_RE =
  /students?\s+(welcome|considered|friendly|accepted)/;
const DSS_ALLOWED_RE = /dss\s+(welcome|considered|accepted)/;
const FAMILIES_RE = /families/;

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
    bathrooms: bathroomCount(countFromFeatures(raw.features, "bath")),
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

/**
 * Zoopla's NTS ("National Trading Standards") block holds Material
 * Information — the fields agents are legally required to disclose.
 * Two arrays expose it: `ntsInfo` (high-priority) and `additionalNtsInfo`
 * (overflow). Both share `{ title, key, value, description }`. We flatten
 * them so callers can lookup by either `key` or `title`.
 */
type NtsRow = {
  key?: string;
  title?: string;
  value?: string;
  description?: string;
};

function collectNtsInfo(o: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: probes each row of a polymorphic info array for label/value pairs across Zoopla's several shapes; the branches are independent and clearer inline.
  const seed = (arr: unknown): void => {
    if (!Array.isArray(arr)) {
      return;
    }
    for (const row of arr) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const r = row as NtsRow;
      const value = toStringSafe(r.value);
      if (!value) {
        continue;
      }
      const key = toStringSafe(r.key)?.toLowerCase();
      const title = toStringSafe(r.title)?.toLowerCase();
      if (key) {
        out.set(key, value);
      }
      if (title) {
        out.set(title, value);
      }
    }
  };
  seed(o.ntsInfo);
  seed(o.additionalNtsInfo);
  return out;
}

function zooplaCouncilTaxBand(nts: Map<string, string>): string | undefined {
  const raw =
    nts.get("council_tax_band") ??
    nts.get("counciltaxband") ??
    nts.get("council tax band");
  if (!raw) {
    return undefined;
  }
  const letter = raw.trim().toUpperCase().match(BAND_LETTER_RE);
  return letter ? letter[0] : raw;
}

function zooplaPublishedAt(o: Record<string, unknown>): string | undefined {
  const raw = toStringSafe(o.publishedOn);
  if (!raw) {
    return undefined;
  }
  // Zoopla emits e.g. "2026-05-23T18:25:59" without a TZ; treat it as UTC
  // for storage consistency. Bad strings drop through to `undefined`.
  const iso = raw.includes("T")
    ? `${raw}Z`.replace(DOUBLE_TRAILING_Z_RE, "Z")
    : raw;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

function zooplaSizeSource(o: Record<string, unknown>): string | undefined {
  const ingested = o.ingested as { sizeSource?: unknown } | undefined;
  return toStringSafe(ingested?.sizeSource);
}

function zooplaAdministrationFeesText(
  o: Record<string, unknown>
): string | undefined {
  const raw = toStringSafe(o.administrationFees);
  if (!raw) {
    return undefined;
  }
  // Some agents paste a single character or copy-paste error — drop those
  // so the UI doesn't render a one-letter blob.
  return raw.trim().length >= 12 ? raw : undefined;
}

function zooplaSizeSqFt(o: Record<string, unknown>): number | undefined {
  const floorArea = o.floorArea as
    | { value?: unknown; unitsLabel?: unknown }
    | undefined;
  if (floorArea) {
    const v = toNumber(floorArea.value);
    const unit = toStringSafe(floorArea.unitsLabel)?.toLowerCase();
    if (v !== undefined) {
      if (!unit || unit.includes("ft")) {
        return Math.round(v);
      }
      if (unit.includes("m")) {
        return Math.round(v * 10.7639);
      }
    }
  }
  const ingested = o.ingested as { sizeSqft?: unknown } | undefined;
  const fromIngested = toNumber(ingested?.sizeSqft);
  if (fromIngested !== undefined) {
    return Math.round(fromIngested);
  }
  return undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: collects tags from several optional Zoopla shapes (tagsV2, flags, badges) — independent guarded reads that read clearer inline than split apart.
function zooplaTags(o: Record<string, unknown>): string[] | undefined {
  const out: string[] = [];
  const tagsV2 = o.tagsV2;
  if (Array.isArray(tagsV2)) {
    for (const t of tagsV2) {
      if (t && typeof t === "object") {
        const label = toStringSafe((t as Record<string, unknown>).label);
        if (label) {
          out.push(label);
        }
      } else {
        const s = toStringSafe(t);
        if (s) {
          out.push(s);
        }
      }
    }
  }
  const status = o.statusSummary as { label?: unknown } | undefined;
  const statusLabel = toStringSafe(status?.label);
  if (statusLabel && !out.includes(statusLabel)) {
    out.push(statusLabel);
  }
  return out.length > 0 ? out : undefined;
}

function zooplaVideos(o: Record<string, unknown>): string[] | undefined {
  const embed = o.embeddedContent as { videos?: unknown } | undefined;
  if (!Array.isArray(embed?.videos)) {
    return undefined;
  }
  const out: string[] = [];
  for (const v of embed.videos) {
    if (typeof v === "string") {
      out.push(v);
      continue;
    }
    if (v && typeof v === "object") {
      const url = toStringSafe((v as Record<string, unknown>).url);
      if (url) {
        out.push(url);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

function zooplaVirtualTour(o: Record<string, unknown>): string | undefined {
  const embed = o.embeddedContent as { tours?: unknown } | undefined;
  if (!Array.isArray(embed?.tours) || embed.tours.length === 0) {
    return undefined;
  }
  const first = embed.tours[0];
  if (typeof first === "string") {
    return first;
  }
  if (first && typeof first === "object") {
    return toStringSafe((first as Record<string, unknown>).url);
  }
  return undefined;
}

function zooplaAgentBranchUrl(
  branch: Record<string, unknown> | undefined
): string | undefined {
  const uri = toStringSafe(branch?.branchDetailsUri);
  if (!uri) {
    return undefined;
  }
  return uri.startsWith("http") ? uri : `https://www.zoopla.co.uk${uri}`;
}

function zooplaTenantPreferences(
  o: Record<string, unknown>
): TenantPreferences | undefined {
  const desc = toStringSafe(o.detailedDescription);
  const bullets = Array.isArray(
    (o.features as { bullets?: unknown[] } | undefined)?.bullets
  )
    ? (o.features as { bullets: unknown[] }).bullets
        .map((b) => toStringSafe(b) ?? "")
        .join(" ")
    : "";
  const blob = `${desc ?? ""} ${bullets}`.toLowerCase();
  if (blob.trim().length === 0) {
    return undefined;
  }
  const out: TenantPreferences = {};
  if (PETS_ALLOWED_RE.test(blob)) {
    out.petsAccepted = true;
  } else if (NO_PETS_RE.test(blob)) {
    out.petsAccepted = false;
  }
  if (STUDENTS_ALLOWED_RE.test(blob)) {
    out.studentsAccepted = true;
  }
  if (DSS_ALLOWED_RE.test(blob)) {
    out.dssAccepted = true;
  }
  if (FAMILIES_RE.test(blob)) {
    out.familiesAccepted = true;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
  const bathrooms = bathroomCount(
    toNumber(counts?.numBathrooms) ?? toNumber(c.numBathrooms)
  );

  const lat = toNumber(location?.coordinates?.latitude) ?? toNumber(c.latitude);
  const lng =
    toNumber(location?.coordinates?.longitude) ?? toNumber(c.longitude);

  const propertyType = zooplaPropertyType(c);
  const title = toStringSafe(c.title) ?? propertyType ?? address;

  const photos = zooplaDetailPhotos(c);

  // `detailedDescription` is sometimes the prose inline, sometimes an
  // RSC reference like `$77` pointing at a separate T-tagged flight
  // chunk that holds the actual text. `resolveFlightRef` handles both:
  // it returns plain strings as-is and follows references to their
  // target chunk.
  const rawDesc = c.detailedDescription;
  const resolvedDesc = resolveFlightRef(flight, rawDesc);
  const desc = toStringSafe(resolvedDesc);
  // If the resolver returned another bare reference we couldn't follow
  // (target chunk missing), drop it rather than poisoning the AI prompt.
  const description = desc && !ZOOPLA_RSC_REF_RE.test(desc) ? desc : undefined;

  const features = c.features as
    | { bullets?: unknown[]; highlights?: unknown[] }
    | undefined;
  const keyFeatures = Array.isArray(features?.bullets)
    ? features.bullets
        .map((f) => toStringSafe(f))
        .filter((f): f is string => Boolean(f))
    : undefined;

  const nts = collectNtsInfo(c);
  // Zoopla puts the tenancy deposit in `additionalNtsInfo` more often
  // than on `c.deposit`. Do NOT fall back to `holding_deposit` — that's a
  // separate ~1-week figure, not the deposit the Tenant Fees Act caps.
  const ntsDeposit = nts.get("deposit");
  const ntsBillsIncluded = (() => {
    const raw = nts.get("bills_included") ?? nts.get("bills included");
    if (!raw) {
      return undefined;
    }
    const v = raw.trim().toLowerCase();
    if (v === "yes" || v === "true" || v === "all included") {
      return true;
    }
    if (v === "no" || v === "false") {
      return false;
    }
    return undefined;
  })();
  const ntsMinTerm = (() => {
    const raw =
      nts.get("minimum_term_months") ??
      nts.get("minimum_tenancy") ??
      nts.get("minimum term");
    const months = toNumber(raw);
    return months;
  })();
  const ntsLetType = nts.get("let_type") ?? nts.get("letting_type");

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
    deposit:
      toNumber(c.deposit) ??
      toNumber(ntsDeposit) ??
      extractDepositFromText(description),
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
    sizeSqFt: zooplaSizeSqFt(c),
    councilTaxBand: zooplaCouncilTaxBand(nts),
    publishedAt: zooplaPublishedAt(c),
    minimumTermMonths: ntsMinTerm,
    letType: ntsLetType,
    videos: zooplaVideos(c),
    virtualTourUrl: zooplaVirtualTour(c),
    agentBranchUrl: zooplaAgentBranchUrl(branch),
    tags: zooplaTags(c),
    tenantPreferences: zooplaTenantPreferences(c),
    billsIncluded: ntsBillsIncluded,
    sizeSource: zooplaSizeSource(c),
    administrationFeesText: zooplaAdministrationFeesText(c),
  };
}
