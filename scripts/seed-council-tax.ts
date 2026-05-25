#!/usr/bin/env bun
/**
 * Council tax rate seeder.
 *
 * Populates `council_tax_rates` with one area-average **Band D** figure
 * per English billing authority for a given tax year. The other bands
 * (A–H) are derived at read time from fixed statutory ratios — see
 * `src/lib/council-tax.ts` — so Band D is all we store.
 *
 * Source: MHCLG, "Council Tax levels set by local authorities in
 * England", published every March. The headline tables ship as ODS;
 * open the relevant Band-D-by-authority table in a spreadsheet and save
 * it as CSV, then point this script at the file.
 *   https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-2025-to-2026
 *   https://www.gov.uk/government/statistical-data-sets/live-tables-on-council-tax
 *
 * The CSV needs (in any column order, header names matched loosely):
 *   - an ONS/GSS code column (e.g. "ONS Code"),
 *   - an authority name column,
 *   - a Band D column (£; area total incl. parish precepts preferred).
 * Pre-header preamble rows are tolerated — we scan for the header.
 *
 * Only billing authorities are kept (GSS codes E06/E07/E08/E09);
 * counties, regions and the England total are skipped.
 *
 * Usage:
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/neon-env.ts bun scripts/seed-council-tax.ts \
 *        --file ./band-d-2025-26.csv --year 2025-26 [--dry-run]
 *
 * Flags:
 *   --file PATH   Local CSV to ingest.
 *   --url URL     Fetch the CSV from a URL instead of --file.
 *   --year YYYY-YY  Tax year the figures apply to (required), e.g. 2025-26.
 *   --dry-run     Parse + report; don't write to the database.
 */

import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import * as schema from "../db/schema";

type Args = {
  file: string | undefined;
  url: string | undefined;
  year: string | undefined;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    file: undefined,
    url: undefined,
    year: undefined,
    dryRun: false,
  };
  // biome-ignore lint/style/useForOf: index-based parser consuming `--flag value` pairs via lookahead (argv[++i]).
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--file") {
      out.file = argv[++i];
    } else if (a === "--url") {
      out.url = argv[++i];
    } else if (a === "--year") {
      out.year = argv[++i];
    }
  }
  return out;
}

/** Minimal RFC4180 row parser — handles quoted fields containing commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      field = "";
      // Skip fully-empty lines.
      if (row.some((c) => c.trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) {
      rows.push(row);
    }
  }
  return rows;
}

const CODE_RE = /\b(ons|gss)?\s*code\b/i;
const NAME_RE = /authorit|area|name/i;
const BAND_D_RE = /band\s*d/i;

/** Locate the header row + the three columns we care about. */
function locateColumns(rows: string[][]): {
  headerIndex: number;
  code: number;
  name: number;
  bandD: number;
} | null {
  for (let r = 0; r < rows.length; r++) {
    const header = (rows[r] ?? []).map((c) => c.trim());
    const code = header.findIndex((h) => CODE_RE.test(h));
    const bandDCols = header
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => BAND_D_RE.test(h));
    const firstBandD = bandDCols[0];
    if (code === -1 || !firstBandD) {
      continue;
    }
    // Prefer the area-total Band D (incl. parish precepts) when labelled.
    const bandD =
      bandDCols.find(({ h }) => /area|total|includ/i.test(h))?.i ??
      firstBandD.i;
    // Name: first name-ish column that isn't the code column.
    const name = header.findIndex(
      (h, i) => i !== code && NAME_RE.test(h) && !CODE_RE.test(h)
    );
    if (name === -1) {
      continue;
    }
    return { headerIndex: r, code, name, bandD };
  }
  return null;
}

/** "£2,280.39" / "2280.39" → 228039 pence. Null if unparseable. */
function poundsToPence(raw: string): number | null {
  const cleaned = raw.replace(/[£,\s]/g, "");
  if (cleaned === "") {
    return null;
  }
  const pounds = Number(cleaned);
  if (!Number.isFinite(pounds) || pounds <= 0) {
    return null;
  }
  return Math.round(pounds * 100);
}

// GSS code prefixes for the four kinds of billing authority: unitary,
// non-metropolitan district, metropolitan district, London borough.
const BILLING_AUTHORITY_RE = /^E0[6789]\d{6}$/;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.year || !/^\d{4}-\d{2}$/.test(args.year)) {
    throw new Error("--year YYYY-YY is required (e.g. --year 2025-26)");
  }
  if (!(args.file || args.url)) {
    throw new Error("provide --file PATH or --url URL");
  }

  const source = args.url ?? args.file;
  const text = args.url
    ? await (async () => {
        const res = await fetch(args.url as string);
        if (!res.ok) {
          throw new Error(`fetch ${args.url}: ${res.status} ${res.statusText}`);
        }
        return res.text();
      })()
    : await readFile(args.file as string, "utf8");

  const rows = parseCsv(text);
  const cols = locateColumns(rows);
  if (!cols) {
    throw new Error(
      "could not find a header row with a code column and a Band D column"
    );
  }

  const seen = new Set<string>();
  const records: schema.NewCouncilTaxRate[] = [];
  let skipped = 0;
  for (let r = cols.headerIndex + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells) {
      continue;
    }
    const code = (cells[cols.code] ?? "").trim().toUpperCase();
    const name = (cells[cols.name] ?? "").trim();
    const bandDPence = poundsToPence(cells[cols.bandD] ?? "");
    if (!BILLING_AUTHORITY_RE.test(code) || !name || bandDPence === null) {
      skipped++;
      continue;
    }
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    records.push({
      authorityCode: code,
      authorityName: name,
      taxYear: args.year as string,
      bandDPence,
      source: source ?? null,
      fetchedAt: new Date(),
    });
  }

  process.stdout.write(
    `Parsed ${records.length} billing authorities (skipped ${skipped} non-authority/blank rows) for ${args.year}.\n`
  );
  const sample = records.slice(0, 3);
  for (const rec of sample) {
    process.stdout.write(
      `  ${rec.authorityCode}  ${rec.authorityName.padEnd(28)} £${(
        rec.bandDPence / 100
      ).toFixed(2)}\n`
    );
  }

  if (records.length === 0) {
    throw new Error("no billing-authority rows parsed — check the CSV layout");
  }

  if (args.dryRun) {
    process.stdout.write("Dry run — nothing written.\n");
    return;
  }

  const db = getDb();
  let written = 0;
  // Chunk the upsert to keep statements a sane size.
  const CHUNK = 100;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await db
      .insert(schema.councilTaxRates)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          schema.councilTaxRates.authorityCode,
          schema.councilTaxRates.taxYear,
        ],
        set: {
          authorityName: sqlExcluded("authority_name"),
          bandDPence: sqlExcluded("band_d_pence"),
          source: sqlExcluded("source"),
          fetchedAt: sqlExcluded("fetched_at"),
        },
      });
    written += chunk.length;
  }
  process.stdout.write(`Upserted ${written} rows into council_tax_rates.\n`);
}

/** `excluded.<col>` reference for ON CONFLICT DO UPDATE. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
