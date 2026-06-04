/**
 * Broadband availability, derived from Ofcom Connected Nations open data.
 *
 * Ofcom publishes fixed-broadband coverage at unit-postcode level as
 * "% of premises" figures (superfast/ultrafast/gigabit). We load a
 * snapshot into the `broadband_coverage` table (see
 * `scripts/load-ofcom-broadband.ts`) and map it onto the listing's
 * `enrichments.broadband` shape here.
 *
 * Caveats this module is honest about:
 * - Most scraped cluster postcodes are outcode-only ("N11"), so we fall
 *   back from the exact unit row to an outcode aggregate.
 * - At postcode level Ofcom withholds full-fibre coverage, so we can't
 *   tell FTTP from gigabit cable — `fttpAvailable` means "gigabit-capable".
 * - No upload figure exists in the postcode file, so `uploadMbps` is null.
 * - `technology`/`downloadMbps` are best-estimate tiers, not a per-address
 *   line check; `source`/`asOf` carry the provenance.
 */

import { eq } from "drizzle-orm";
import type { getDb } from "../../db";
import * as schema from "../../db/schema";

type Db = ReturnType<typeof getDb>;

export type BroadbandResult = {
  technology: "FTTP" | "FTTC" | "ADSL" | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  fttpAvailable: boolean;
  source?: string | null;
  asOf?: string | null;
};

/** No usable coverage row found. */
const EMPTY: BroadbandResult = {
  technology: null,
  downloadMbps: null,
  uploadMbps: null,
  fttpAvailable: false,
  source: null,
  asOf: null,
};

/**
 * A coverage tier counts as "available here" once it reaches a majority
 * of the premises in the postcode/outcode. Ofcom figures are whole-area
 * percentages, so this turns them into a single headline.
 */
const MAJORITY_PCT = 50;

/** Representative max download (Mbit/s) per tier — not a measured speed. */
const TIER_GIGABIT = 1000;
const TIER_UFBB300 = 330;
const TIER_UFBB100 = 150;
const TIER_SFBB = 80;
const TIER_ADSL = 24;

const FULL_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const OUTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const OUTCODE_PREFIX_RE = /^[A-Z]{1,2}\d[A-Z\d]?/;

export type PostcodeKey = { key: string; level: "postcode" | "outcode" };

/**
 * Normalise a scraped postcode to a lookup key. Full unit postcodes
 * ("N11 1AA") become `{ "N111AA", postcode }`; bare outcodes ("N11")
 * become `{ "N11", outcode }`. Returns null for unparseable input.
 */
export function normalisePostcodeKey(postcode: string): PostcodeKey | null {
  const clean = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (FULL_POSTCODE_RE.test(clean)) {
    return { key: clean, level: "postcode" };
  }
  const outcode = clean.match(OUTCODE_PREFIX_RE)?.[0];
  if (outcode && OUTCODE_RE.test(outcode) && outcode === clean) {
    return { key: outcode, level: "outcode" };
  }
  return null;
}

/** "SE19HA" → "SE1" (strip the incode); null if not a unit postcode. */
export function outcodeOf(unitKey: string): string | null {
  return unitKey.match(/^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/)?.[1] ?? null;
}

/** Ofcom coverage percentages (0–100), any of which may be null. */
export type CoveragePercents = {
  sfbbPct: number | null;
  ufbb100Pct: number | null;
  ufbb300Pct: number | null;
  gigabitPct: number | null;
  ngaPct: number | null;
};

/** "ofcom-cn-2025-07" → "2025-07". */
function asOfFromSource(source: string | null | undefined): string | null {
  return source?.match(/(\d{4}-\d{2})$/)?.[1] ?? null;
}

/**
 * Map Ofcom coverage percentages onto the broadband display shape. The
 * headline is the best tier reaching a majority of premises; everything
 * here is a postcode/outcode estimate, hence the `source`/`asOf` tag.
 */
export function coverageToBroadband(
  pct: CoveragePercents,
  source?: string | null
): BroadbandResult {
  const { sfbbPct: s, ufbb100Pct: u1, ufbb300Pct: u3, gigabitPct: g } = pct;
  if (s == null && u1 == null && u3 == null && g == null) {
    return { ...EMPTY };
  }

  // Ofcom can't separate FTTP from gigabit cable at postcode level, so
  // this flags gigabit-capable coverage rather than fibre specifically.
  const fttpAvailable = (g ?? 0) >= MAJORITY_PCT;

  let technology: BroadbandResult["technology"];
  let downloadMbps: number;
  if ((g ?? 0) >= MAJORITY_PCT) {
    technology = "FTTP";
    downloadMbps = TIER_GIGABIT;
  } else if ((u3 ?? 0) >= MAJORITY_PCT) {
    technology = "FTTC";
    downloadMbps = TIER_UFBB300;
  } else if ((u1 ?? 0) >= MAJORITY_PCT) {
    technology = "FTTC";
    downloadMbps = TIER_UFBB100;
  } else if ((s ?? 0) >= MAJORITY_PCT) {
    technology = "FTTC";
    downloadMbps = TIER_SFBB;
  } else {
    // Superfast doesn't reach a majority — copper/ADSL-class headline.
    technology = "ADSL";
    downloadMbps = TIER_ADSL;
  }

  return {
    technology,
    downloadMbps,
    uploadMbps: null,
    fttpAvailable,
    source: source ?? null,
    asOf: asOfFromSource(source),
  };
}

function toNumber(value: string | null): number | null {
  if (value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadCoverage(db: Db, key: string): Promise<
  (CoveragePercents & { source: string }) | null
> {
  const rows = await db
    .select({
      sfbbPct: schema.broadbandCoverage.sfbbPct,
      ufbb100Pct: schema.broadbandCoverage.ufbb100Pct,
      ufbb300Pct: schema.broadbandCoverage.ufbb300Pct,
      gigabitPct: schema.broadbandCoverage.gigabitPct,
      ngaPct: schema.broadbandCoverage.ngaPct,
      source: schema.broadbandCoverage.source,
    })
    .from(schema.broadbandCoverage)
    .where(eq(schema.broadbandCoverage.key, key))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    sfbbPct: toNumber(row.sfbbPct),
    ufbb100Pct: toNumber(row.ufbb100Pct),
    ufbb300Pct: toNumber(row.ufbb300Pct),
    gigabitPct: toNumber(row.gigabitPct),
    ngaPct: toNumber(row.ngaPct),
    source: row.source,
  };
}

/**
 * Look up broadband for a scraped postcode. Tries the exact unit row
 * first, then the outcode aggregate. Returns a null-filled result when
 * the postcode is unparseable or absent from the loaded snapshot.
 */
export async function getBroadbandForPostcode(
  db: Db,
  postcode: string
): Promise<BroadbandResult> {
  const norm = normalisePostcodeKey(postcode);
  if (!norm) {
    return { ...EMPTY };
  }

  const candidates: string[] = [norm.key];
  if (norm.level === "postcode") {
    const outcode = outcodeOf(norm.key);
    if (outcode) {
      candidates.push(outcode);
    }
  }

  for (const key of candidates) {
    const coverage = await loadCoverage(db, key);
    if (coverage) {
      const { source, ...pct } = coverage;
      return coverageToBroadband(pct, source);
    }
  }
  return { ...EMPTY };
}
