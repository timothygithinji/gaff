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
 * just take "the nearest cert". We only store a band we can tie to THIS
 * building:
 *
 *   1. Resolve a FULL postcode. The scraped `postcode` is usually only an
 *      outcode, so we snap the listing's true lat/lng (promoted from
 *      rawJson) to its nearest unit postcode via postcodes.io. This
 *      narrows the EPC search from a whole district to one street/block.
 *   2. EXACT match — when the listing address carries a house/flat number,
 *      match the cert whose address shares that number + street. Stored
 *      with `source: "exact"`.
 *   3. Otherwise store nothing. We deliberately do NOT fall back to a
 *      postcode-level estimate: a neighbourhood-typical band is too
 *      unreliable for a specific home (two flats in one block can be a C
 *      and an F), so the UI shows "Unknown" instead of guessing.
 *
 * A manual address override (user pins the door from the photos) feeds
 * this same engine by supplying a precise address/postcode, which is how
 * a street-only listing graduates from "Unknown" to an exact match.
 *
 * No AI cost. The EPC API and postcodes.io are both free (with attribution).
 */

import { logger, task } from "@trigger.dev/sdk";
import { getDb } from "../../db";
import {
  type Certificate,
  createEpcClient,
  getDomesticSearch,
} from "../lib/api-clients/epc";
import { env } from "../lib/env";
import { reverseGeocodePostcode } from "../lib/geocode";
import { parseNumeric, upsertEnrichmentForCluster } from "./enrich-helpers";
import { scrapeQueue } from "./queues";

export type EnrichEpcPayload = {
  clusterId: string;
};

export type EnrichEpcOutput = {
  clusterId: string;
  /** "exact" | "none" — whether we found this building's own certificate. */
  source: "exact" | "none";
  listingsTouched: number;
};

// A complete UK postcode (with the inward part). Mirrors the guard used in
// `council-tax.ts` / geocoding: an outcode can't pin a building.
const FULL_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;

// The valid domestic EPC bands.
const RATING_ORDER = ["A", "B", "C", "D", "E", "F", "G"] as const;

/** Stored EPC blob — only ever an exact, building-specific certificate. */
export type NormalisedEpc = {
  currentRating: string;
  potentialRating?: string;
  expiresOn?: string;
  /** Total floor area in m² from the certificate, when present. */
  totalFloorAreaSqM?: number;
  /** Always "exact" — we no longer store postcode-level estimates. */
  source: "exact";
  /** The EPC certificate address we matched against. */
  matchedAddress?: string;
  /** The full postcode the search was scoped to. */
  postcode?: string;
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

/** Parse the EPC `total-floor-area` (m², string or number) to a positive number. */
function epcFloorArea(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    n = Number.parseFloat(value);
  }
  return Number.isFinite(n) && n > 0 ? n : undefined;
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
  const totalFloorAreaSqM = epcFloorArea(cert["total-floor-area"]);
  return {
    currentRating,
    ...(potentialRating ? { potentialRating } : {}),
    ...(expiresOn ? { expiresOn } : {}),
    ...(totalFloorAreaSqM != null ? { totalFloorAreaSqM } : {}),
    source: "exact",
    matchedAddress,
    postcode,
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
 * Decide which postcode to search EPC by and which address to match
 * certificates against. A manual override (user pinned the door) wins for
 * both; otherwise we search the reverse-geocoded full postcode and match
 * the scraped address. `searchPostcode` falls back to the bare outcode as
 * a last resort (exact-only — no estimate from an outcode).
 */
async function resolveEpcContext(cluster: ClusterLocation): Promise<{
  searchPostcode: string | null;
  matchAddress: string;
}> {
  const override = cluster.userAddress?.trim() || null;
  const matchAddress = override ?? cluster.normalisedAddress;
  const fullPostcode =
    (override ? extractFullPostcode(override) : null) ??
    (await resolveFullPostcode(
      cluster.postcode,
      parseNumeric(cluster.lat),
      parseNumeric(cluster.lng)
    ));
  return {
    searchPostcode: fullPostcode ?? cluster.postcode,
    matchAddress,
  };
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
    const { EPC_OPENDATA_TOKEN } = env();
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
    // manual override wins for both).
    const { searchPostcode, matchAddress } = await resolveEpcContext(cluster);
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

    // Exact match by address — only when the address carries a number
    // (most likely once the user has supplied a manual override). When
    // there's no confident match we store nothing rather than guess from
    // a postcode-level estimate; the UI then shows "Unknown".
    const exact = pickExactCert(certs, matchAddress);
    const blob = exact
      ? exactBlob(exact.cert, searchPostcode, exact.address)
      : null;
    if (!blob) {
      logger.log("enrich-epc: no exact certificate match", {
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
      listingsTouched: touched,
    });
    return { clusterId, source: blob.source, listingsTouched: touched };
  },
});
