#!/usr/bin/env bun
/**
 * One-off backfill: OpenRent listings stored with NULL bedrooms/price/type
 * because the detail parser's TITLE_RE only matched single-word
 * "N Bed Flat" titles. Studios ("Studio Flat"), shared rooms ("Room in a
 * Shared Flat"), and multi-word types ("4 Bed Terraced House") all failed
 * — and the nulls let out-of-band rows slip past the review queue's
 * null-keep backstop. The parser is fixed (openrent.ts); this repopulates
 * the already-stored rows from their titles using the same patterns.
 *
 * Run dry by default; pass --apply to write.
 */
import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set");
}
const db = drizzle(neon(url), { schema });
const { listings } = schema;

// Mirror the three title shapes in src/lib/parsers/openrent.ts.
const TITLE_RE =
  /^(?:.+?)\s*-\s*(\d+)\s*Bed\s*([A-Za-z][A-Za-z\s-]*?),\s*(.+?),\s*([A-Z]{1,2}\d{1,2}[A-Z]?)\s*-\s*To Rent[^£]*?£([\d,]+(?:\.\d+)?)\s*(?:p\/m|pm|pcm)/i;
const TITLE_STUDIO_RE =
  /^(?:.+?)\s*-\s*Studio\s+([A-Za-z]+),\s*(.+?),\s*([A-Z]{1,2}\d{1,2}[A-Z]?)\s*-\s*To Rent[^£]*?£([\d,]+(?:\.\d+)?)\s*(?:p\/m|pm|pcm)/i;
const TITLE_ROOM_RE =
  /^(?:.+?)\s*-\s*(Room\s+in\s+a\s+Shared\s+[A-Za-z]+),\s*(.+?),\s*([A-Z]{1,2}\d{1,2}[A-Z]?)\s*-\s*To Rent[^£]*?£([\d,]+(?:\.\d+)?)\s*(?:p\/m|pm|pcm)/i;

function toNumber(v: string | undefined): number | undefined {
  if (!v) {
    return undefined;
  }
  const n = Number.parseFloat(v.replace(/[,£\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

type Parsed = {
  beds: number;
  propertyType: string;
  street: string;
  price: number | undefined;
  newTitle: string;
};

function parseTitle(title: string): Parsed | null {
  const bed = title.match(TITLE_RE);
  if (bed) {
    const beds = toNumber(bed[1]) ?? 0;
    const propertyType = (bed[2] ?? "").trim();
    const street = bed[3] ?? "";
    return {
      beds,
      propertyType,
      street,
      price: toNumber(bed[5]),
      newTitle: `${beds} bed ${propertyType} — ${street}`,
    };
  }
  const studio = title.match(TITLE_STUDIO_RE);
  if (studio) {
    const propertyType = `Studio ${studio[1] ?? ""}`.trim();
    const street = studio[2] ?? "";
    return {
      beds: 0,
      propertyType,
      street,
      price: toNumber(studio[4]),
      newTitle: `${propertyType} — ${street}`,
    };
  }
  const room = title.match(TITLE_ROOM_RE);
  if (room) {
    const propertyType = (room[1] ?? "").trim();
    const street = room[2] ?? "";
    return {
      beds: 1,
      propertyType,
      street,
      price: toNumber(room[4]),
      newTitle: `${propertyType} — ${street}`,
    };
  }
  return null;
}

// Every OpenRent row missing beds or price — re-parse what the fixed
// parser would now extract from the stored title.
const rows = await db
  .select({
    id: listings.id,
    title: listings.title,
    bedrooms: listings.bedrooms,
    price: listings.priceMonthly,
    propertyType: listings.propertyType,
  })
  .from(listings)
  .where(
    sql`${listings.portal} = 'openrent' AND (${listings.bedrooms} IS NULL OR ${listings.priceMonthly} IS NULL)`
  );

console.log(`OpenRent rows missing beds or price: ${rows.length}`);

let fixed = 0;
const skipped: string[] = [];
for (const r of rows) {
  const p = parseTitle(r.title);
  if (!p) {
    skipped.push(r.title);
    continue;
  }
  console.log(
    `  ${r.id}\n    before: beds=${r.bedrooms} price=${r.price} type=${r.propertyType}\n    after:  beds=${p.beds} price=${p.price ?? "null"} type="${p.propertyType}" title="${p.newTitle}"`
  );
  if (APPLY) {
    await db
      .update(listings)
      .set({
        bedrooms: p.beds,
        priceMonthly: p.price ?? null,
        propertyType: p.propertyType,
        title: p.newTitle,
      })
      .where(eq(listings.id, r.id));
  }
  fixed++;
}

if (skipped.length > 0) {
  console.log('\nUnparseable titles (left untouched):');
  for (const t of skipped) {
    console.log(`  ${t.slice(0, 90)}`);
  }
}

console.log(
  `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${fixed} row(s)${APPLY ? " updated" : " would be updated (re-run with --apply)"}, ${skipped.length} skipped`
);
