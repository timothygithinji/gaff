/**
 * Per-cluster EPC (Energy Performance Certificate) enrichment.
 *
 * Fires fire-and-forget from `clusterTask.onSuccess` for every newly
 * created cluster (and is re-triggered by backfills). EPC is keyed on a
 * UK address, so one resolution per cluster — not per listing.
 *
 * The hard problem: the EPC API needs an *exact* address, but the portals
 * mostly give a street + outcode ("Friern Barnet Road, N11"), no house
 * number, and EPC certificate rows carry NO coordinates — so we can't
 * just take "the nearest cert". We do the best honest thing the data
 * allows, in this order:
 *
 *   1. Resolve a FULL postcode. The scraped `postcode` is usually only an
 *      outcode, so we ask Google Maps to reverse-geocode the cluster's
 *      true lat/lng — when it returns a ROOFTOP UK result we use both
 *      its postcode and (where present) its street number. postcodes.io
 *      is the fallback when Google declines.
 *   2. EXACT match — only for clusters whose listing is a *house* (a
 *      reverse-geocoded address pins the building, not the unit, so the
 *      same door number could be Flat 1 or Flat 9). When the address
 *      carries a number + street word that some cert shares, we stamp
 *      `source: "exact"`.
 *   3. ESTIMATE fallback — for flats and anything we can't classify
 *      (treated as flats, by design), summarise the postcode's
 *      certificates into a modal rating + best…worst range. When the
 *      geocoder gave us a building's street number, narrow the sample
 *      to just that building's certs before summarising. Stored with
 *      `source: "estimate"` so the UI labels it as an approximation
 *      rather than fake-precise.
 *   4. Otherwise blank — better than the old behaviour, which stamped one
 *      arbitrary district cert onto every cluster.
 *
 * A manual address override (user pins the door from the photos) wins
 * over the reverse-geocoded address and skips the Google call entirely.
 *
 * Cost: one Google Geocoding call per cluster (~$5/1000), plus the free
 * EPC + postcodes.io calls.
 */

import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import {
  type Certificate,
  createEpcClient,
  getDomesticSearch,
} from "../lib/api-clients/epc";
import { env } from "../lib/env";
import {
  type ReverseGeocodedAddress,
  reverseGeocodeAddress,
  reverseGeocodePostcode,
} from "../lib/geocode";
import { parseNumeric, upsertEnrichmentForCluster } from "./enrich-helpers";
import { scrapeQueue } from "./queues";

export type EnrichEpcPayload = {
  clusterId: string;
};

export type EnrichEpcOutput = {
  clusterId: string;
  /** "exact" | "estimate" | "none" — which arm produced the result. */
  source: "exact" | "estimate" | "none";
  listingsTouched: number;
};

// A complete UK postcode (with the inward part). Mirrors the guard used in
// `council-tax.ts` / geocoding: an outcode can't pin a building.
const FULL_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;

// Domestic EPC bands, best → worst. Used to order an estimate's range.
const RATING_ORDER = ["A", "B", "C", "D", "E", "F", "G"] as const;

/** Stored EPC blob — `currentRating` stays populated for back-compat with
 * the review/listing-detail readers; the rest is additive. */
export type NormalisedEpc = {
  currentRating: string;
  potentialRating?: string;
  expiresOn?: string;
  /** How we arrived at the rating — the UI labels "estimate" distinctly. */
  source: "exact" | "estimate";
  /** Exact: the EPC certificate address we matched against. */
  matchedAddress?: string;
  /** The full postcode the search/estimate was scoped to. */
  postcode?: string;
  /** Estimate: how many certificates the typical rating was drawn from. */
  sampleSize?: number;
  /** Estimate: the spread of ratings across the postcode, e.g. C…E. */
  range?: { min: string; max: string };
};

/**
 * The search endpoint returns `{ "column-names": [...], "rows": [...] }`, NOT
 * the bare array the generated spec claims. Pull the rows out defensively,
 * tolerating either shape.
 */
export function extractCertRows(data: unknown): Certificate[] {
  if (Array.isArray(data)) {
    return data as Certificate[];
  }
  const rows = (data as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Certificate[]) : [];
}

function epcString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** EPCs are valid for 10 years from lodgement; the API exposes no expiry. */
function tenYearsAfter(isoDate: string): string | undefined {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return;
  }
  d.setFullYear(d.getFullYear() + 10);
  return d.toISOString().slice(0, 10);
}

function normaliseRating(value: unknown): string | undefined {
  const s = epcString(value)?.toUpperCase();
  return s && (RATING_ORDER as readonly string[]).includes(s) ? s : undefined;
}

const INT_TOKEN_RE = /\b\d+\b/g;
// "2 Bedroom Flat", "1 bed" — the leading number is a bedroom count, not a
// house number, and must not be mistaken for one (it would false-match a
// same-numbered house on the street). Stripped before number extraction.
const BEDROOM_COUNT_RE = /\b\d+\s*(?:bed|beds|bedroom|bedrooms)\b/gi;
const NON_ALPHA_RE = /[^a-z\s]/g;
const WHITESPACE_RE = /\s+/g;
// Non-anchored: find a full postcode embedded in a user-typed address,
// tolerating the usual single space before the inward code.
const EMBEDDED_POSTCODE_RE = /[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}/i;

/** Pull a full postcode out of free-text (a manual address override), or null. */
function extractFullPostcode(text: string): string | null {
  const m = text.match(EMBEDDED_POSTCODE_RE);
  return m ? m[0].toUpperCase().replace(WHITESPACE_RE, "") : null;
}
// Street words worth matching on — alphabetic, length ≥ 4, minus filler.
const ADDRESS_STOPWORDS = new Set([
  "flat",
  "apartment",
  "room",
  "shared",
  "house",
  "london",
  "road",
  "street",
  "avenue",
  "close",
  "court",
  "lane",
  "drive",
  "place",
]);

function numberTokens(addr: string): Set<string> {
  return new Set(addr.match(INT_TOKEN_RE) ?? []);
}

function streetTokens(addr: string): Set<string> {
  const words = addr
    .toLowerCase()
    .replace(NON_ALPHA_RE, " ")
    .split(WHITESPACE_RE)
    .filter((w) => w.length >= 4 && !ADDRESS_STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Match the certificate for the cluster's exact building. Requires the
 * cluster address to carry a number (house/flat) AND a cert whose address
 * shares that number plus a street word — conservative on purpose, so we
 * never assert "exact" on a street-only address. Returns null when no
 * confident match exists.
 */
export function pickExactCert(
  certs: Certificate[],
  clusterAddress: string
): { cert: Certificate; address: string } | null {
  const cleaned = clusterAddress.replace(BEDROOM_COUNT_RE, " ");
  const clusterNums = numberTokens(cleaned);
  if (clusterNums.size === 0) {
    return null;
  }
  const clusterStreet = streetTokens(cleaned);

  let best: { cert: Certificate; address: string } | null = null;
  let bestScore = 0;
  for (const cert of certs) {
    const address = epcString(cert.address);
    if (!address) {
      continue;
    }
    const sharesNumber = [...numberTokens(address)].some((n) =>
      clusterNums.has(n)
    );
    if (!sharesNumber) {
      continue;
    }
    const sharedStreet = [...streetTokens(address)].filter((t) =>
      clusterStreet.has(t)
    ).length;
    if (sharedStreet === 0) {
      continue;
    }
    if (sharedStreet > bestScore) {
      bestScore = sharedStreet;
      best = { cert, address };
    }
  }
  return best;
}

/** Build the stored blob from a single, exactly-matched certificate. */
export function exactBlob(
  cert: Certificate,
  postcode: string,
  matchedAddress: string
): NormalisedEpc | null {
  const currentRating = normaliseRating(cert["current-energy-rating"]);
  if (!currentRating) {
    return null;
  }
  const potentialRating = normaliseRating(cert["potential-energy-rating"]);
  const lodgement = epcString(cert["lodgement-date"]);
  const expiresOn = lodgement ? tenYearsAfter(lodgement) : undefined;
  return {
    currentRating,
    ...(potentialRating ? { potentialRating } : {}),
    ...(expiresOn ? { expiresOn } : {}),
    source: "exact",
    matchedAddress,
    postcode,
  };
}

// Tokens that imply a multi-unit listing even when "house" appears
// elsewhere in the string (e.g. "Room in a Shared House"). Reverse-
// geocoding pins the building, not the unit, so these must drop through
// to the estimate path.
const MULTI_UNIT_RE = /\b(room|shared|flat|apartment|maisonette|studio)\b/;

// Single-unit-building tokens. "terrac" matches "terrace" + "terraced";
// "house" matches the bare word and "townhouse". Match must succeed AND
// no multi-unit token may be present.
const HOUSE_TYPE_RE =
  /\b(detached|semi[- ]?detached|terrac\w*|bungalow|cottage|house|townhouse|mews|end[- ]?of[- ]?terrace)\b/;

// Property-type fields are sometimes snake-case ("semi_detached"); the
// `_` is a word character so `\b` doesn't fire between halves. Normalise
// to plain whitespace for the token-matching regexes.
const TYPE_SEPARATORS_RE = /[_/-]+/g;

/** True when the listing's portal-reported type is clearly a single-unit
 * building (terrace, semi, detached, bungalow, etc.). Returns false for
 * flats, apartments, maisonettes, studios, rooms, and — by design —
 * anything we couldn't classify, so the "exact via geocoded address"
 * path can never fire on an ambiguous record. */
export function isHouseType(propertyType: string | null | undefined): boolean {
  if (!propertyType) {
    return false;
  }
  const normalised = propertyType.toLowerCase().replace(TYPE_SEPARATORS_RE, " ");
  if (MULTI_UNIT_RE.test(normalised)) {
    return false;
  }
  return HOUSE_TYPE_RE.test(normalised);
}

/**
 * Filter `certs` to those whose address shares the cluster's building
 * number plus a street word — i.e. the same building. The full-postcode
 * sample is already street-scale, but a long-tail block can hold a dozen
 * units; this narrows it to one address group. Returns the same array
 * when no number is available (so the caller falls back to postcode
 * scope) or an empty array when no cert in the postcode matches.
 */
export function certsForBuilding(
  certs: Certificate[],
  buildingAddress: string
): Certificate[] {
  const cleaned = buildingAddress.replace(BEDROOM_COUNT_RE, " ");
  const nums = numberTokens(cleaned);
  if (nums.size === 0) {
    return certs;
  }
  const streetWords = streetTokens(cleaned);
  return certs.filter((cert) => {
    const address = epcString(cert.address);
    if (!address) {
      return false;
    }
    const sharesNumber = [...numberTokens(address)].some((n) => nums.has(n));
    if (!sharesNumber) {
      return false;
    }
    return [...streetTokens(address)].some((t) => streetWords.has(t));
  });
}

/**
 * Summarise a full postcode's certificates into a typical rating + range.
 * `currentRating` is the modal band (ties broken toward the better band);
 * `range` is the best…worst spread. Returns null when no cert carries a
 * usable rating.
 */
export function estimateBlob(
  certs: Certificate[],
  postcode: string
): NormalisedEpc | null {
  const ratings = certs
    .map((c) => normaliseRating(c["current-energy-rating"]))
    .filter((r): r is string => r !== undefined);
  if (ratings.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const r of ratings) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  // Modal band; on a tie pick the better (earlier in RATING_ORDER).
  let modal = ratings[0] as string;
  let modalCount = 0;
  for (const band of RATING_ORDER) {
    const n = counts.get(band) ?? 0;
    if (n > modalCount) {
      modalCount = n;
      modal = band;
    }
  }

  const present = RATING_ORDER.filter((b) => counts.has(b));
  const min = present[0] as string;
  const max = present.at(-1) as string;

  return {
    currentRating: modal,
    source: "estimate",
    postcode,
    sampleSize: ratings.length,
    range: { min, max },
  };
}

/**
 * Resolve a FULL postcode for the EPC search: prefer an already-full
 * scraped postcode, else snap the cluster's true coords to their nearest
 * unit postcode. Returns null when neither is available (only an outcode,
 * no coords) — the caller then has no precise search key.
 */
async function resolveFullPostcode(
  postcode: string | null,
  lat: number | null,
  lng: number | null
): Promise<string | null> {
  const scraped = postcode?.trim().toUpperCase().replace(WHITESPACE_RE, "");
  if (scraped && FULL_POSTCODE_RE.test(scraped)) {
    return scraped;
  }
  if (lat != null && lng != null) {
    return await reverseGeocodePostcode(lat, lng);
  }
  return null;
}

type ClusterLocation = {
  postcode: string | null;
  lat: string | null;
  lng: string | null;
  normalisedAddress: string;
  userAddress: string | null;
};

/**
 * Resolved EPC matching context for a cluster.
 *
 * `geocoded` carries Google's rooftop result when one was obtained — it
 * lifts a street-only scraped address into something with a door number,
 * which lets `pickExactCert` fire for houses and lets the caller narrow
 * the postcode estimate sample to a single building for flats.
 */
type EpcContext = {
  searchPostcode: string | null;
  fullPostcode: string | null;
  matchAddress: string;
  geocoded: ReverseGeocodedAddress | null;
};

/**
 * Decide which postcode to search EPC by and which address to match
 * certificates against. A manual override (user pinned the door) wins
 * for both. Otherwise we ask Google Maps to reverse-geocode the
 * cluster's lat/lng — if it returns a ROOFTOP-precision UK address with
 * a street number, that becomes the match address (a real door number
 * scraped addresses don't carry). Falls back to the scraped postcode +
 * normalised address when geocoding fails. `searchPostcode` falls back
 * to the bare outcode as a last resort (exact-only — no estimate from
 * an outcode).
 */
async function resolveEpcContext(
  cluster: ClusterLocation,
  googleMapsApiKey: string
): Promise<EpcContext> {
  const override = cluster.userAddress?.trim() || null;
  if (override) {
    const fullPostcode =
      extractFullPostcode(override) ??
      (await resolveFullPostcode(
        cluster.postcode,
        parseNumeric(cluster.lat),
        parseNumeric(cluster.lng)
      ));
    return {
      searchPostcode: fullPostcode ?? cluster.postcode,
      fullPostcode,
      matchAddress: override,
      geocoded: null,
    };
  }

  const lat = parseNumeric(cluster.lat);
  const lng = parseNumeric(cluster.lng);
  const geocoded =
    lat != null && lng != null
      ? await reverseGeocodeAddress(lat, lng, googleMapsApiKey)
      : null;
  const geocodePostcode = geocoded?.postcode
    ?.toUpperCase()
    .replace(WHITESPACE_RE, "");
  const fullPostcode =
    (geocodePostcode && FULL_POSTCODE_RE.test(geocodePostcode)
      ? geocodePostcode
      : null) ?? (await resolveFullPostcode(cluster.postcode, lat, lng));
  // Use the geocoded address as the match key only when it actually
  // gives us a street number. Without one, `pickExactCert` would fall
  // through anyway and we'd want the scraped address (which sometimes
  // carries a number from "13 Cannon Hill" patterns).
  const matchAddress =
    geocoded?.locationType === "ROOFTOP" && geocoded.streetNumber
      ? geocoded.formattedAddress
      : cluster.normalisedAddress;
  return {
    searchPostcode: fullPostcode ?? cluster.postcode,
    fullPostcode,
    matchAddress,
    geocoded,
  };
}

/** Read the cluster's primary listing propertyType. We pick the first
 * non-null we find — portals describe the same building consistently
 * enough that the order doesn't matter for our flat-vs-house split. */
async function readClusterPropertyType(
  db: ReturnType<typeof getDb>,
  clusterId: string
): Promise<string | null> {
  const rows = await db
    .select({ propertyType: schema.listings.propertyType })
    .from(schema.listings)
    .where(eq(schema.listings.clusterId, clusterId));
  for (const r of rows) {
    if (r.propertyType && r.propertyType.length > 0) {
      return r.propertyType;
    }
  }
  return null;
}

/** Run the EPC domestic search and return the (defensively-extracted) rows. */
async function searchEpcCerts(
  token: string,
  postcode: string
): Promise<Certificate[]> {
  const search = await getDomesticSearch({
    client: createEpcClient({ token }),
    query: { postcode, size: 100 },
  });
  if (search.error) {
    const message =
      typeof search.error === "object" &&
      search.error !== null &&
      "message" in search.error
        ? String((search.error as { message: unknown }).message)
        : JSON.stringify(search.error);
    throw new Error(`enrich-epc: EPC search failed: ${message}`);
  }
  return extractCertRows(search.data);
}

export const enrichEpcTask = task({
  id: "enrich-epc",
  queue: scrapeQueue,
  maxDuration: 60,

  run: async (payload: EnrichEpcPayload): Promise<EnrichEpcOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const { EPC_OPENDATA_TOKEN, GOOGLE_MAPS_API_KEY } = env();
    const none = {
      clusterId,
      source: "none" as const,
      listingsTouched: 0,
    };

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`enrich-epc: cluster ${clusterId} not found`);
    }

    // Decide the search postcode + the address to match certs against (a
    // manual override wins; otherwise we ask Google to reverse-geocode
    // coords to an address with a real door number).
    const { searchPostcode, fullPostcode, matchAddress, geocoded } =
      await resolveEpcContext(cluster, GOOGLE_MAPS_API_KEY);
    if (!searchPostcode) {
      logger.warn("enrich-epc: no postcode or coords, skipping", { clusterId });
      return none;
    }

    const certs = await searchEpcCerts(EPC_OPENDATA_TOKEN, searchPostcode);
    if (certs.length === 0) {
      logger.warn("enrich-epc: no certificates for postcode", {
        clusterId,
        postcode: searchPostcode,
      });
      return none;
    }

    // House vs flat split: the geocoded address pins the building, not
    // the unit, so we only attempt an exact match when the listing's
    // type implies one unit per door (terrace, semi, detached, …).
    // Anything else — including a missing type, by design — falls
    // through to the building-scoped estimate path below.
    const propertyType = await readClusterPropertyType(db, clusterId);
    const isHouse = isHouseType(propertyType);

    const exact = isHouse ? pickExactCert(certs, matchAddress) : null;
    let blob = exact
      ? exactBlob(exact.cert, searchPostcode, exact.address)
      : null;

    // Estimate fallback. Only with a FULL postcode, so the sample is a
    // single street/block, not a whole district. When the geocoded
    // address carries a street number, narrow the sample further to
    // certs whose address shares that number — a much tighter range
    // than the full postcode for flats in a converted building.
    if (!blob && fullPostcode) {
      const usingBuilding =
        geocoded?.locationType === "ROOFTOP" &&
        Boolean(geocoded.streetNumber);
      const sample = usingBuilding
        ? certsForBuilding(certs, matchAddress)
        : certs;
      // If building-scoped filter degenerates to empty (the building has
      // no certs of its own), fall back to the postcode-wide sample so
      // the user still sees an estimate.
      const finalSample = sample.length > 0 ? sample : certs;
      blob = estimateBlob(finalSample, fullPostcode);
    }
    if (!blob) {
      logger.log("enrich-epc: no confident match and no full postcode", {
        clusterId,
        postcode: searchPostcode,
      });
      return none;
    }

    const touched = await upsertEnrichmentForCluster(db, clusterId, {
      epc: blob,
    });
    logger.log("enrich-epc: done", {
      clusterId,
      postcode: searchPostcode,
      source: blob.source,
      currentRating: blob.currentRating,
      propertyType,
      isHouse,
      geocodedLocationType: geocoded?.locationType ?? null,
      listingsTouched: touched,
    });
    return { clusterId, source: blob.source, listingsTouched: touched };
  },
});
