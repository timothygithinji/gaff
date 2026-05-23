/**
 * OpenRent HTML parsers.
 *
 * OpenRent renders plain server-side HTML — no Next data island, no RSC
 * chunks. Search results contain `<a href="/property-to-rent/.../<id>">`
 * anchors; detail pages encode key facts in the `<title>` element plus
 * `data-lat`/`data-lng` attributes and a few text patterns.
 *
 * We use `node-html-parser` to keep things robust across whitespace
 * variations, then mix in targeted regex for fields the DOM doesn't
 * expose cleanly.
 */

import { type HTMLElement, parse } from "node-html-parser";
import { decodeEntities, extractPostcode, toNumber } from "./common";
import type {
  Furnished,
  ListingDetail,
  ListingSummary,
  TenantPreferences,
} from "./types";

const LISTING_URL_RE = /^\/property-to-rent\/[^"']+?\/(\d+)$/;
const SLUG_TYPE_RE = /\/\d+-bed-([a-z]+)/i;
const WHITESPACE_RE = /\s+/g;
const CARD_PRICE_RE = /£\s*([\d,]+)\s*per\s*month/i;
const CARD_BATH_RE = /(\d+)\s*Bath/i;
const CARD_BED_RE = /(\d+)\s*Bed\b/i;
const FLOORPLAN_FILENAME_RE = /floor.?plan/i;
const EPC_RE = /EPC[\s:]+([A-G])\b/i;
const DEPOSIT_RE = /Deposit[^£]*?£([\d,]+)/i;
const AVAILABLE_FROM_RE =
  /Available\s+from[^A-Z0-9]*?([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|today|now|immediately)/i;
const FURNISHED_RE = /\b(Furnished|Unfurnished|Part[- ]?Furnished)\b/i;
const STRIP_OPENRENT_SUFFIX_RE = /\s*-\s*OpenRent.*$/i;
const OPENRENT_CDN_RE = /imagescdn\.openrent\.co\.uk\/listings\//i;
const DASH_RE = /-/g;
const TRAILING_COMMA_RE = /,\s*$/;

/**
 * Parse an OpenRent search results page.
 *
 * Each listing card carries a `<div data-listing-id="...">` swiper, an
 * `<img alt="…WC2R">` with a clean title-cased label, and a few levels
 * up a card text block that includes "£N per month", bedroom/bathroom
 * counts, and a furnishing label. We collect all of that together.
 *
 * Throws if no `data-listing-id` elements are found at all — that
 * signals either a blocked page or a layout change.
 */
export function parseOpenrentSearch(html: string): ListingSummary[] {
  const root = parse(html);
  const liEls = root.querySelectorAll("[data-listing-id]");

  if (liEls.length === 0) {
    // Fall back to anchor-only mode in case the swiper layout changes.
    return parseOpenrentSearchFromAnchors(root);
  }

  const byId = new Map<string, ListingSummary>();
  for (const el of liEls) {
    const id = el.getAttribute("data-listing-id");
    if (!id || byId.has(id)) {
      continue;
    }
    const altLabel = decodeEntities(
      el.querySelector("img")?.getAttribute("alt") ?? ""
    ).trim();
    const slug = findSlugForId(root, id);

    const cardText = findCardTextForElement(el);
    const summary = buildOpenrentSummary({
      id,
      slug,
      altLabel,
      cardText,
    });
    byId.set(id, summary);
  }

  if (byId.size === 0) {
    throw new Error(
      "OpenRent search: data-listing-id elements present but no listings could be built"
    );
  }
  return [...byId.values()];
}

function parseOpenrentSearchFromAnchors(root: HTMLElement): ListingSummary[] {
  const anchors = root.querySelectorAll("a[href*='/property-to-rent/']");
  if (anchors.length === 0) {
    throw new Error(
      "OpenRent search: no data-listing-id elements and no /property-to-rent/ anchors"
    );
  }
  const byId = new Map<string, ListingSummary>();
  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) {
      continue;
    }
    const m = href.match(LISTING_URL_RE);
    if (!m) {
      continue;
    }
    const id = m[1];
    if (!id || byId.has(id)) {
      continue;
    }
    const altLabel = decodeEntities(
      a.querySelector("img")?.getAttribute("alt") ?? ""
    ).trim();
    byId.set(
      id,
      buildOpenrentSummary({
        id,
        slug: href,
        altLabel,
        cardText: "",
      })
    );
  }
  if (byId.size === 0) {
    throw new Error(
      "OpenRent search: anchors present but none matched listing-URL pattern"
    );
  }
  return [...byId.values()];
}

function findSlugForId(root: HTMLElement, id: string): string {
  const a = root.querySelector(`a[href$="/${id}"]`);
  return a?.getAttribute("href") ?? `/property-to-rent/${id}`;
}

/** Walk ancestors until we hit a node whose text contains "£…". */
function findCardTextForElement(el: HTMLElement): string {
  let cur: HTMLElement | null = el;
  for (let i = 0; i < 10 && cur; i++) {
    const text = (cur.text ?? "").replace(WHITESPACE_RE, " ").trim();
    if (text.includes("£")) {
      return text;
    }
    cur = cur.parentNode as HTMLElement | null;
  }
  return "";
}

/**
 * Title-cased alt label like "1 Bed Flat, Strand, WC2R". The
 * `(beds, type, street?, postcode)` shape is the source of truth.
 */
const ALT_LABEL_RE =
  /^(\d+)\s+Bed\s+([A-Za-z]+)(?:,\s+(.+?))?,\s+([A-Z]{1,2}\d{1,2}[A-Z]?(?:\s+\d[A-Z]{2})?)\s*$/;
// Studios and shared rooms don't follow the "N Bed Type" form; match
// "Studio Flat, …, NW3" and "Room in a Shared Flat, …, W1D" instead.
const ALT_STUDIO_RE =
  /^Studio\s+([A-Za-z]+)(?:,\s+(.+?))?,\s+([A-Z]{1,2}\d{1,2}[A-Z]?(?:\s+\d[A-Z]{2})?)\s*$/;
const ALT_ROOM_RE =
  /^Room\s+in\s+a\s+Shared\s+([A-Za-z]+)(?:,\s+(.+?))?,\s+([A-Z]{1,2}\d{1,2}[A-Z]?(?:\s+\d[A-Z]{2})?)\s*$/i;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: chain of optional-field extractions; flattening would just spread the same logic across helpers.
function buildOpenrentSummary(args: {
  id: string;
  slug: string;
  altLabel: string;
  cardText: string;
}): ListingSummary {
  const altMatch = args.altLabel.match(ALT_LABEL_RE);
  const studioMatch = altMatch ? null : args.altLabel.match(ALT_STUDIO_RE);
  const roomMatch =
    altMatch || studioMatch ? null : args.altLabel.match(ALT_ROOM_RE);

  let beds: number | undefined;
  let propertyType: string | undefined;
  let street: string | undefined;
  let postcode: string | undefined;

  if (altMatch) {
    beds = toNumber(altMatch[1]);
    propertyType = altMatch[2];
    street = altMatch[3];
    postcode = altMatch[4];
  } else if (studioMatch) {
    beds = 0;
    propertyType = `Studio ${studioMatch[1] ?? ""}`.trim();
    street = studioMatch[2];
    postcode = studioMatch[3];
  } else if (roomMatch) {
    beds = 1;
    propertyType = `Room in a Shared ${roomMatch[1] ?? ""}`.trim();
    street = roomMatch[2];
    postcode = roomMatch[3];
  } else {
    propertyType = args.slug.match(SLUG_TYPE_RE)?.[1];
    postcode = extractPostcode(args.slug.replace(DASH_RE, " "));
  }
  postcode = postcode ?? extractPostcode(args.slug.replace(DASH_RE, " "));

  // Card text — pull price and bath count.
  const card = args.cardText;
  const priceMatch = card.match(CARD_PRICE_RE);
  const bathMatch = card.match(CARD_BATH_RE);
  const cardBedsMatch = card.match(CARD_BED_RE);
  // Furnishing is extracted by the detail parser; not part of summary.

  const priceMonthly = priceMatch
    ? Number.parseInt((priceMatch[1] ?? "").replace(/,/g, ""), 10)
    : undefined;

  const bathrooms = bathMatch ? toNumber(bathMatch[1]) : undefined;
  const bedrooms =
    beds ?? (cardBedsMatch ? toNumber(cardBedsMatch[1]) : undefined);

  const fallbackAddress = street
    ? `${street}, ${postcode ?? ""}`.trim().replace(TRAILING_COMMA_RE, "")
    : "";
  const addressRaw = args.altLabel.length > 0 ? args.altLabel : fallbackAddress;

  const fallbackTitle =
    args.altLabel || `${beds ?? "?"} bed ${propertyType ?? "property"}`;
  const title = street
    ? `${propertyType ?? "property"} — ${street}`
    : fallbackTitle;

  return {
    portal: "openrent",
    portalListingId: args.id,
    url: `https://www.openrent.co.uk${args.slug}`,
    title,
    addressRaw,
    postcode,
    bedrooms,
    bathrooms,
    priceMonthly:
      priceMonthly !== undefined &&
      Number.isFinite(priceMonthly) &&
      priceMonthly > 0
        ? priceMonthly
        : undefined,
    propertyType,
    lat: undefined,
    lng: undefined,
  };
}

const TITLE_RE =
  /^(?:.+?)\s*-\s*(\d+)\s*Bed\s*([A-Za-z]+),\s*(.+?),\s*([A-Z]{1,2}\d{1,2}[A-Z]?)\s*-\s*To Rent[^£]*?£([\d,]+(?:\.\d+)?)\s*(?:p\/m|pm|pcm)/i;

const LAT_RE = /data-lat=["'](-?\d+\.\d+)["']/;
const LNG_RE = /data-lng=["'](-?\d+\.\d+)["']/;
const ID_FROM_URL_RE = /\/property-to-rent\/[^/]+\/[^/]+\/(\d+)/;

/**
 * OpenRent renders structured facts as 2-column tables:
 *   <tr>
 *     <td class="fw-medium">Pets Allowed</td>
 *     <td>...check / cross SVG (text-success / text-danger)
 *         OR plain text like "17 July, 2026" / "6 Months" / "C"...</td>
 *   </tr>
 *
 * `extractFactTable` walks every such row in the document and returns a
 * Map<labelLowerCase, value> where value is either the cell's text or
 * "yes" / "no" derived from the success/danger SVG colour. Empty cells
 * are skipped so callers see "label absent" as `undefined` rather than
 * an empty string.
 */
/**
 * Pull the label text out of a `<td>` while skipping popover content.
 * The OpenRent fact tables embed Bootstrap popovers like
 *   <td>Preferred Minimum Tenancy <a data-bs-toggle="popover">…</a>
 *       <div class="d-none">This is the landlord's preference …</div></td>
 * The default `.text` getter concatenates *every* descendant text node,
 * which would smuggle the popover paragraph into our label key. We walk
 * direct child nodes and skip any element with `[data-bs-toggle]`,
 * `[role="button"]`, or class `d-none`.
 */
function extractCleanLabel(td: HTMLElement): string {
  const childNodes =
    (td as unknown as { childNodes?: { nodeType: number; rawText?: string; text?: string; classNames?: string[]; getAttribute?: (k: string) => string | null }[] })
      .childNodes ?? [];
  const parts: string[] = [];
  for (const node of childNodes) {
    if (node.nodeType === 3) {
      // text node
      parts.push(node.rawText ?? "");
      continue;
    }
    if (node.nodeType !== 1) {
      continue;
    }
    const el = node as unknown as HTMLElement;
    const cls = el.getAttribute?.("class") ?? "";
    const role = el.getAttribute?.("role") ?? "";
    const popover = el.getAttribute?.("data-bs-toggle") ?? "";
    if (
      cls.includes("d-none") ||
      role === "button" ||
      popover === "popover" ||
      el.tagName?.toLowerCase() === "a" ||
      el.tagName?.toLowerCase() === "svg"
    ) {
      continue;
    }
    // Some labels nest the text inside an inner span. Fall back to the
    // descendant text for those.
    parts.push(el.text ?? "");
  }
  return decodeEntities(parts.join(" "))
    .replace(WHITESPACE_RE, " ")
    .trim()
    .toLowerCase();
}

function extractFactTable(root: HTMLElement): Map<string, string> {
  const out = new Map<string, string>();
  const rows = root.querySelectorAll("tr");
  for (const tr of rows) {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 2) {
      continue;
    }
    const labelEl = tds[0];
    const valueEl = tds[1];
    if (!(labelEl && valueEl)) {
      continue;
    }
    // OpenRent labels embed Bootstrap popovers (`<a data-bs-toggle="popover">`
    // …`<div class="d-none">tooltip text</div>`) whose descendant text bleeds
    // into the label otherwise. `extractCleanLabel` skips those subtrees so
    // "Preferred Minimum Tenancy" doesn't become a paragraph.
    const label = extractCleanLabel(labelEl);
    if (!label) {
      continue;
    }
    const svg = valueEl.querySelector("svg");
    let value: string;
    if (svg) {
      const cls = svg.getAttribute("class") ?? "";
      if (cls.includes("text-success")) {
        value = "yes";
      } else if (cls.includes("text-danger")) {
        value = "no";
      } else {
        value = decodeEntities(valueEl.text ?? "").trim();
      }
    } else {
      value = decodeEntities(valueEl.text ?? "")
        .replace(WHITESPACE_RE, " ")
        .trim();
    }
    if (value.length > 0) {
      out.set(label, value);
    }
  }
  return out;
}

function ynToBool(v: string | undefined): boolean | undefined {
  if (!v) {
    return undefined;
  }
  const t = v.toLowerCase();
  if (t === "yes") {
    return true;
  }
  if (t === "no") {
    return false;
  }
  return undefined;
}

function openrentTenantPreferences(
  facts: Map<string, string>
): TenantPreferences | undefined {
  const out: TenantPreferences = {};
  const set = (
    key: keyof TenantPreferences,
    raw: string | undefined
  ): void => {
    const v = ynToBool(raw);
    if (v !== undefined) {
      out[key] = v;
    }
  };
  set("studentsAccepted", facts.get("student friendly") ?? facts.get("students"));
  set("familiesAccepted", facts.get("families allowed") ?? facts.get("families"));
  set("petsAccepted", facts.get("pets allowed") ?? facts.get("pets"));
  set("smokersAccepted", facts.get("smokers allowed") ?? facts.get("smokers"));
  set(
    "dssAccepted",
    facts.get("dss/lha covers rent") ??
      facts.get("dss/lha") ??
      facts.get("dss")
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

const MIN_TERM_MONTHS_RE = /(\d+)\s*(?:month|m\b)/i;
const MIN_TERM_YEARS_RE = /(\d+)\s*(?:year|y\b)/i;

function openrentMinimumTermMonths(
  facts: Map<string, string>
): number | undefined {
  const raw =
    facts.get("preferred minimum tenancy") ??
    facts.get("minimum tenancy") ??
    facts.get("minimum term");
  if (!raw) {
    return undefined;
  }
  const months = raw.match(MIN_TERM_MONTHS_RE)?.[1];
  if (months) {
    return toNumber(months);
  }
  const years = raw.match(MIN_TERM_YEARS_RE)?.[1];
  if (years) {
    const n = toNumber(years);
    return n === undefined ? undefined : n * 12;
  }
  return undefined;
}

function openrentFurnished(text: string): Furnished | undefined {
  const m = text.match(FURNISHED_RE);
  if (!m) {
    return undefined;
  }
  const v = m[1]?.toLowerCase() ?? "";
  if (v.includes("part")) {
    return "part_furnished";
  }
  if (v.includes("un")) {
    return "unfurnished";
  }
  return "furnished";
}

/**
 * Parse an OpenRent property detail page.
 * Throws if neither the `<title>` regex nor `data-lat`/`data-lng` lands —
 * that combination of absences indicates a wrong page (e.g. a 404 or
 * blocked response).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: large-but-flat field mapping across DOM + regex sources.
export function parseOpenrentDetail(html: string): ListingDetail {
  const root = parse(html);
  const titleText = decodeEntities(root.querySelector("title")?.text ?? "");

  const idFromCanonical = root
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href")
    ?.match(ID_FROM_URL_RE)?.[1];
  const idFromOgUrl = root
    .querySelector('meta[property="og:url"]')
    ?.getAttribute("content")
    ?.match(ID_FROM_URL_RE)?.[1];
  const id = idFromCanonical ?? idFromOgUrl;

  const titleMatch = titleText.match(TITLE_RE);
  const latMatch = html.match(LAT_RE);
  const lngMatch = html.match(LNG_RE);

  if (!titleMatch && !(latMatch && lngMatch) && !id) {
    throw new Error(
      "OpenRent detail: neither title pattern nor lat/lng nor canonical id found — wrong page?"
    );
  }

  const beds = titleMatch ? toNumber(titleMatch[1]) : undefined;
  const propertyType = titleMatch ? titleMatch[2] : undefined;
  const street = titleMatch ? titleMatch[3] : undefined;
  const postcode = titleMatch ? titleMatch[4] : extractPostcode(titleText);
  const rent = titleMatch ? toNumber(titleMatch[5]) : undefined;

  const lat = latMatch ? toNumber(latMatch[1]) : undefined;
  const lng = lngMatch ? toNumber(lngMatch[1]) : undefined;

  const ogTitle = decodeEntities(
    root.querySelector('meta[property="og:title"]')?.getAttribute("content") ??
      ""
  );
  const ogDescription = decodeEntities(
    root
      .querySelector(
        'meta[name="twitter:description"], meta[property="og:description"]'
      )
      ?.getAttribute("content") ?? ""
  );

  // Hero photo: meta[name=twitter:image] is the listing's first photo
  // (https://imagescdn.openrent.co.uk/...), while og:image is OpenRent's
  // fallback share-graphic logo. Surface the better one as photos[0].
  const twitterImage = root
    .querySelector('meta[name="twitter:image"]')
    ?.getAttribute("content");
  const heroPhoto =
    twitterImage && OPENRENT_CDN_RE.test(twitterImage)
      ? twitterImage
      : undefined;

  // Photos: OpenRent CDN URLs scoped to /listings/<id>/. Splice the
  // twitter:image hero in front when we have one and the lower-resolution
  // gallery doesn't already include it.
  const collected = collectOpenrentPhotos(root, id);
  const photos =
    heroPhoto && !collected.includes(heroPhoto)
      ? [heroPhoto, ...collected]
      : collected;
  const floorplanUrl = photos.find((u) => FLOORPLAN_FILENAME_RE.test(u));

  const bodyText = decodeEntities(root.text.replace(WHITESPACE_RE, " "));
  const epcMatch = bodyText.match(EPC_RE);
  const depositMatch = bodyText.match(DEPOSIT_RE);
  const availableMatch = bodyText.match(AVAILABLE_FROM_RE);

  // Pull every <tr>/<td> fact pair so we can read structured values
  // without relying on free-text regex.
  const facts = extractFactTable(root);
  const tenantPreferences = openrentTenantPreferences(facts);
  const minimumTermMonths = openrentMinimumTermMonths(facts);
  const billsIncluded = ynToBool(
    facts.get("bills included") ?? facts.get("bills")
  );
  const factCouncilTax = facts.get("council tax band");
  const factParking = ynToBool(facts.get("parking"));
  const factGarden = ynToBool(facts.get("garden"));
  const factEpc = facts.get("epc rating");
  const factAvailableFrom = facts.get("available from");
  // Prefer the structured Furnishing cell over the bodyText regex —
  // less brittle when the description mentions "Unfurnished" mid-paragraph.
  const factFurnishing = facts.get("furnishing");
  const furnishedFromFacts = factFurnishing
    ? openrentFurnished(factFurnishing)
    : undefined;

  const streetWithPostcode = postcode ? `${street}, ${postcode}` : street;
  const addressRaw = street ? (streetWithPostcode ?? "") : ogTitle;

  const titleFromHtml =
    titleText.replace(STRIP_OPENRENT_SUFFIX_RE, "").trim() ||
    `OpenRent listing ${id ?? ""}`;
  const titleOut =
    titleMatch && street
      ? `${beds ?? "?"} bed ${propertyType ?? "property"} — ${street}`
      : ogTitle || titleFromHtml;

  const url = id
    ? `https://www.openrent.co.uk/property-to-rent/${id}`
    : (root.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
      "https://www.openrent.co.uk");

  if (!id) {
    throw new Error("OpenRent detail: could not derive listing id");
  }

  return {
    portal: "openrent",
    portalListingId: id,
    url,
    title: titleOut,
    addressRaw,
    postcode,
    bedrooms: beds,
    bathrooms: undefined,
    priceMonthly: rent,
    propertyType,
    lat,
    lng,
    description: ogDescription.length > 0 ? ogDescription : undefined,
    availableFrom: factAvailableFrom ?? (availableMatch ? availableMatch[1] : undefined),
    furnished: furnishedFromFacts ?? openrentFurnished(bodyText),
    deposit: depositMatch ? toNumber(depositMatch[1]) : undefined,
    photos,
    floorplanUrl,
    agentName: "OpenRent",
    agentPhone: undefined,
    keyFeatures: undefined,
    epcRating:
      (factEpc ?? "").toUpperCase().match(/^[A-G]$/)?.[0] ??
      (epcMatch ? (epcMatch[1] ?? "").toUpperCase() : undefined),
    nearestStations: undefined,
    sizeSqFt: undefined,
    councilTaxBand: factCouncilTax
      ? factCouncilTax.trim().toUpperCase().match(/^[A-H]/)?.[0]
      : undefined,
    publishedAt: undefined,
    minimumTermMonths,
    letType: undefined,
    serviceChargeAnnual: undefined,
    groundRentAnnual: undefined,
    videos: undefined,
    virtualTourUrl: undefined,
    agentCompany: "OpenRent",
    agentBranchUrl: undefined,
    feesText: undefined,
    tags:
      factParking === true || factGarden === true
        ? [
            ...(factGarden === true ? ["Garden"] : []),
            ...(factParking === true ? ["Parking"] : []),
          ]
        : undefined,
    tenantPreferences,
    billsIncluded,
  };
}

function collectOpenrentPhotos(
  root: ReturnType<typeof parse>,
  id: string | undefined
): string[] {
  const urls = new Set<string>();
  const imgs = root.querySelectorAll("img");
  for (const img of imgs) {
    const src =
      img.getAttribute("src") ??
      img.getAttribute("data-src") ??
      img.getAttribute("data-original") ??
      "";
    if (!src) {
      continue;
    }
    const idScopedRe = id ? new RegExp(`/listings/${id}/`, "i") : undefined;
    if (OPENRENT_CDN_RE.test(src) || idScopedRe?.test(src)) {
      // Normalize protocol-relative URLs to https.
      const normalized = src.startsWith("//") ? `https:${src}` : src;
      urls.add(normalized);
    }
  }
  return [...urls];
}
