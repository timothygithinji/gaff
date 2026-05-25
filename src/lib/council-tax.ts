/**
 * Council tax: band-rate derivation + billing-authority resolution.
 *
 * The portals give us a property's council tax **band** (A–H). The
 * annual **rate** isn't a property of the listing — it's a property of
 * `(billing authority, band, tax year)`. In England the per-band amounts
 * are fixed statutory ratios of Band D (Local Government Finance Act
 * 1992, s.5), so we only ever store one figure per authority (its area-
 * average Band D, seeded into `council_tax_rates`) and derive A–H here.
 *
 * Scope is England only: Wales uses bands A–I with its own ratios, and
 * Scotland revised its E–H multipliers in 2017. Neither is covered.
 */

import {
  createPostcodesClient,
  lookupPostcode,
} from "./api-clients/postcodes-io";
import type { Client } from "./api-clients/postcodes-io/generated/client";

/** The eight English council tax bands. */
export const COUNCIL_TAX_BANDS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
] as const;

export type CouncilTaxBand = (typeof COUNCIL_TAX_BANDS)[number];

/**
 * Each band's charge as a ratio of Band D, fixed in statute (the
 * familiar 6/7/8/9/11/13/15/18 ninths). Band D is the reference at 1.
 */
/** A bare band letter, optionally prefixed with "Band ". */
const BAND_PATTERN = /^(?:BAND\s*)?([A-H])$/;

const BAND_RATIOS: Record<CouncilTaxBand, number> = {
  A: 6 / 9,
  B: 7 / 9,
  C: 8 / 9,
  D: 1,
  E: 11 / 9,
  F: 13 / 9,
  G: 15 / 9,
  H: 18 / 9,
};

/**
 * Narrow an arbitrary string to a known band, or null. Accepts a bare
 * letter ("C") or an optional "Band " prefix ("Band C"). Deliberately
 * strict — "Band G" must not be misread as B by grabbing the first
 * character — so anything else (ranges, notes) yields null and simply
 * produces no estimate.
 */
export function normaliseBand(
  value: string | null | undefined
): CouncilTaxBand | null {
  if (!value) {
    return null;
  }
  const match = value.trim().toUpperCase().match(BAND_PATTERN);
  return match ? (match[1] as CouncilTaxBand) : null;
}

/**
 * Derive the annual charge in pence for `band`, given the authority's
 * Band D figure in pence. Returns null for an unrecognised band.
 */
export function bandAmountPence(
  bandDPence: number,
  band: string | null | undefined
): number | null {
  const b = normaliseBand(band);
  if (b === null) {
    return null;
  }
  return Math.round(bandDPence * BAND_RATIOS[b]);
}

/**
 * The UK council tax year for a given date, formatted "YYYY-YY" (e.g.
 * "2025-26"). The tax year runs 1 April – 31 March, so anything before
 * April belongs to the year that started the previous April.
 */
export function currentCouncilTaxYear(now: Date = new Date()): string {
  const month = now.getUTCMonth(); // 0 = Jan
  const startYear = month >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const endTwo = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endTwo}`;
}

export type BillingAuthority = {
  /** GSS code, e.g. "E07000223". */
  code: string;
  /** Authority name, e.g. "Guildford". */
  name: string;
  /** Country name as reported by postcodes.io, e.g. "England". */
  country: string;
};

/**
 * Resolve the council tax billing authority for a postcode via
 * postcodes.io. `codes.admin_district` is the lower-tier district /
 * unitary authority, which is the billing authority for council tax.
 *
 * Returns null when the postcode isn't found or the response lacks the
 * district code. Accepts an injected client for testing.
 */
export async function resolveBillingAuthority(
  postcode: string,
  options: { client?: Client } = {}
): Promise<BillingAuthority | null> {
  const trimmed = postcode.trim();
  if (!trimmed) {
    return null;
  }
  const client = options.client ?? createPostcodesClient();
  const { data, error } = await lookupPostcode({
    client,
    path: { postcode: trimmed },
  });
  if (error || !data?.result) {
    return null;
  }
  const result = data.result;
  const code = result.codes?.admin_district;
  // `admin_district` (the name) is typed `unknown` on the generated
  // Postcode type, so narrow it defensively.
  const name = typeof result.admin_district === "string" ? result.admin_district : null;
  if (!code || !name) {
    return null;
  }
  return {
    code,
    name,
    country: typeof result.country === "string" ? result.country : "",
  };
}
