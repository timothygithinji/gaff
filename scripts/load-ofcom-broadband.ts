#!/usr/bin/env bun
/**
 * Loader for `broadband_coverage` from the Ofcom Connected Nations
 * open-data postcode CSVs (Open Government Licence).
 *
 * Download the "Fixed broadband coverage and full fibre take-up" zip from
 *   https://www.ofcom.org.uk/.../connected-nations-20252/data-downloads-2025
 * and unzip it (the postcode files are a nested zip,
 * 202507_fixed_pc_coverage_r01.zip). We read the *residential* postcode
 * files inside, named
 *   202507_fixed_pc_coverage_res_r01_<area>.csv   (in postcode_res_files/)
 *
 * What we load (to keep the table small but exact where it matters):
 *  - Every UK outcode as an aggregate row (unweighted mean of each
 *    %-field across that outcode's unit postcodes) — the fallback, since
 *    most scraped cluster postcodes are outcode-only.
 *  - Unit rows ONLY for full unit postcodes referenced by existing
 *    clusters — so the minority of clusters with a precise postcode get
 *    the exact figure. (Re-run after adding precise postcodes.)
 *
 * Usage (resolves the per-branch Neon DB via neon-env):
 *   doppler run --project gaff --config dev --scope ~/.t-stack/orgs/<org> -- \
 *     bun scripts/neon-env.ts bun scripts/load-ofcom-broadband.ts <path-to-unzipped-folder>
 *
 * Add `--all-units` to also load every UK unit postcode (~1.6M rows).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { normalisePostcodeKey, outcodeOf } from "../src/lib/broadband";

/** Snapshot tag written to every row. Bump when loading a newer release. */
const SOURCE = "ofcom-cn-2025-07";
const RES_FILE_RE = /fixed_pc_coverage_res_.*\.csv$/i;
const INSERT_CHUNK = 1000;

/** Ofcom column headers we need, matched case/space-insensitively. */
const COLUMNS = {
  postcode: "postcode",
  sfbbPct: "sfbb availability (% premises)",
  ufbb100Pct: "ufbb (100mbit/s) availability (% premises)",
  ufbb300Pct: "ufbb availability (% premises)",
  gigabitPct: "gigabit availability (% premises)",
  ngaPct: "% of premises with nga",
} as const;

type MetricKey = "sfbbPct" | "ufbb100Pct" | "ufbb300Pct" | "gigabitPct" | "ngaPct";
const METRIC_KEYS: MetricKey[] = [
  "sfbbPct",
  "ufbb100Pct",
  "ufbb300Pct",
  "gigabitPct",
  "ngaPct",
];

const normHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

/** Minimal quote-aware CSV line splitter (Ofcom uses `"` text delimiters). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toPct(value: string | undefined): number | null {
  if (value == null || value.trim() === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Running mean per metric, ignoring nulls. */
type Agg = {
  sums: Record<MetricKey, number>;
  counts: Record<MetricKey, number>;
  rows: number;
};

function newAgg(): Agg {
  const zero = () =>
    Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Record<
      MetricKey,
      number
    >;
  return { sums: zero(), counts: zero(), rows: 0 };
}

type CoverageRow = {
  key: string;
  level: "postcode" | "outcode";
  sfbbPct: number | null;
  ufbb100Pct: number | null;
  ufbb300Pct: number | null;
  gigabitPct: number | null;
  ngaPct: number | null;
  sampleSize: number;
  source: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadWantedUnitPostcodes(
  db: ReturnType<typeof getDb>
): Promise<Set<string>> {
  const rows = await db
    .select({ postcode: schema.propertyClusters.postcode })
    .from(schema.propertyClusters);
  const wanted = new Set<string>();
  for (const { postcode } of rows) {
    if (!postcode) {
      continue;
    }
    const norm = normalisePostcodeKey(postcode);
    if (norm?.level === "postcode") {
      wanted.add(norm.key);
    }
  }
  return wanted;
}

async function insertRows(
  db: ReturnType<typeof getDb>,
  rows: CoverageRow[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK).map((r) => ({
      key: r.key,
      level: r.level,
      sfbbPct: r.sfbbPct?.toString() ?? null,
      ufbb100Pct: r.ufbb100Pct?.toString() ?? null,
      ufbb300Pct: r.ufbb300Pct?.toString() ?? null,
      gigabitPct: r.gigabitPct?.toString() ?? null,
      ngaPct: r.ngaPct?.toString() ?? null,
      sampleSize: r.sampleSize,
      source: r.source,
    }));
    await db
      .insert(schema.broadbandCoverage)
      .values(chunk)
      .onConflictDoUpdate({
        target: schema.broadbandCoverage.key,
        set: {
          level: sql`excluded.level`,
          sfbbPct: sql`excluded.sfbb_pct`,
          ufbb100Pct: sql`excluded.ufbb100_pct`,
          ufbb300Pct: sql`excluded.ufbb300_pct`,
          gigabitPct: sql`excluded.gigabit_pct`,
          ngaPct: sql`excluded.nga_pct`,
          sampleSize: sql`excluded.sample_size`,
          source: sql`excluded.source`,
        },
      });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const allUnits = args.includes("--all-units");
  const folder = args.find((a) => !a.startsWith("--"));
  if (!folder) {
    console.error(
      "usage: bun scripts/load-ofcom-broadband.ts <unzipped-folder> [--all-units]"
    );
    process.exit(1);
  }

  const files = readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((f) => RES_FILE_RE.test(f))
    .map((f) => join(folder, f));
  if (files.length === 0) {
    console.error(`[ofcom] no *postcode_res_coverage*.csv under ${folder}`);
    process.exit(1);
  }
  console.log(`[ofcom] ${files.length} residential postcode file(s)`);

  const db = getDb();
  const wantedUnits = allUnits ? null : await loadWantedUnitPostcodes(db);
  console.log(
    allUnits
      ? "[ofcom] loading ALL unit postcodes + outcode aggregates"
      : `[ofcom] loading ${wantedUnits?.size ?? 0} cluster unit postcode(s) + outcode aggregates`
  );

  const outcodes = new Map<string, Agg>();
  const unitRows: CoverageRow[] = [];
  let totalUnits = 0;

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    const headerLine = lines[0];
    if (!headerLine) {
      continue;
    }
    const header = splitCsvLine(headerLine).map(normHeader);
    const idx = (name: string) => header.indexOf(normHeader(name));
    const colIdx = Object.fromEntries(
      Object.entries(COLUMNS).map(([k, v]) => [k, idx(v)])
    ) as Record<keyof typeof COLUMNS, number>;
    if (colIdx.postcode < 0 || colIdx.gigabitPct < 0) {
      console.warn(`[ofcom] ${file}: missing expected headers, skipping`);
      continue;
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }
      const cells = splitCsvLine(line);
      const unit = cells[colIdx.postcode]?.trim().toUpperCase();
      if (!unit) {
        continue;
      }
      totalUnits++;
      const pct: Record<MetricKey, number | null> = {
        sfbbPct: toPct(cells[colIdx.sfbbPct]),
        ufbb100Pct: toPct(cells[colIdx.ufbb100Pct]),
        ufbb300Pct: toPct(cells[colIdx.ufbb300Pct]),
        gigabitPct: toPct(cells[colIdx.gigabitPct]),
        ngaPct: toPct(cells[colIdx.ngaPct]),
      };

      // Accumulate the outcode aggregate.
      const outcode = outcodeOf(unit);
      if (outcode) {
        let agg = outcodes.get(outcode);
        if (!agg) {
          agg = newAgg();
          outcodes.set(outcode, agg);
        }
        agg.rows++;
        for (const m of METRIC_KEYS) {
          const v = pct[m];
          if (v != null) {
            agg.sums[m] += v;
            agg.counts[m]++;
          }
        }
      }

      // Keep the unit row if we want it.
      if (allUnits || wantedUnits?.has(unit)) {
        unitRows.push({
          key: unit,
          level: "postcode",
          ...pct,
          sampleSize: 1,
          source: SOURCE,
        });
      }
    }
  }

  const outcodeRows: CoverageRow[] = [];
  for (const [outcode, agg] of outcodes) {
    const mean = (m: MetricKey) =>
      agg.counts[m] > 0 ? round2(agg.sums[m] / agg.counts[m]) : null;
    outcodeRows.push({
      key: outcode,
      level: "outcode",
      sfbbPct: mean("sfbbPct"),
      ufbb100Pct: mean("ufbb100Pct"),
      ufbb300Pct: mean("ufbb300Pct"),
      gigabitPct: mean("gigabitPct"),
      ngaPct: mean("ngaPct"),
      sampleSize: agg.rows,
      source: SOURCE,
    });
  }

  console.log(
    `[ofcom] parsed ${totalUnits} unit rows → ${outcodeRows.length} outcodes, ${unitRows.length} unit rows to write`
  );

  await insertRows(db, outcodeRows);
  await insertRows(db, unitRows);

  console.log(
    `[ofcom] done — wrote ${outcodeRows.length} outcode + ${unitRows.length} unit rows (source ${SOURCE})`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[ofcom] fatal", err);
  process.exit(1);
});
