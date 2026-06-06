#!/usr/bin/env bun
/**
 * One-off backfill: OpenRent studio listings were stored with NULL
 * bedrooms/price/type because the detail parser's TITLE_RE only matched
 * "N Bed …" titles (fixed in openrent.ts via TITLE_STUDIO_RE). Those nulls
 * let sub-band studios slip past the review queue's null-keep backstop.
 *
 * Re-derive bedrooms=0, priceMonthly, propertyType, and a clean title from
 * the already-stored title using the same studio pattern, so the queue's
 * bedroom band (>=3) and price floor exclude them. Idempotent.
 *
 * Run dry by default; pass --apply to write.
 */
import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) { throw new Error("DATABASE_URL not set"); }
const db = drizzle(neon(url), { schema });
const { listings } = schema;

// Mirror TITLE_STUDIO_RE in src/lib/parsers/openrent.ts.
const TITLE_STUDIO_RE =
  /^(?:.+?)\s*-\s*Studio\s+([A-Za-z]+),\s*(.+?),\s*([A-Z]{1,2}\d{1,2}[A-Z]?)\s*-\s*To Rent[^£]*?£([\d,]+(?:\.\d+)?)\s*(?:p\/m|pm|pcm)/i;

function toNumber(v: string | undefined): number | undefined {
  if (!v) { return undefined; }
  const n = Number.parseFloat(v.replace(/[,£\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

// Candidates: OpenRent rows with no parsed bedrooms whose title is a studio.
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
    sql`${listings.portal} = 'openrent' AND ${listings.bedrooms} IS NULL AND ${listings.title} ~* 'studio'`
  );

console.log(`OpenRent null-bedroom studio-ish rows: ${rows.length}`);

let fixed = 0;
for (const r of rows) {
  const m = r.title.match(TITLE_STUDIO_RE);
  if (!m) {
    console.log(`  SKIP (title unparseable): ${r.title.slice(0, 80)}`);
    continue;
  }
  const propertyType = `Studio ${m[1] ?? ""}`.trim();
  const street = m[2];
  const price = toNumber(m[4]);
  const newTitle = `${propertyType} — ${street}`;
  console.log(
    `  ${r.id}\n    before: beds=${r.bedrooms} price=${r.price} type=${r.propertyType}\n    after:  beds=0 price=${price ?? "null"} type="${propertyType}" title="${newTitle}"`
  );
  if (APPLY) {
    await db
      .update(listings)
      .set({
        bedrooms: 0,
        priceMonthly: price ?? null,
        propertyType,
        title: newTitle,
      })
      .where(eq(listings.id, r.id));
  }
  fixed++;
}

console.log(
  `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${fixed} row(s)${APPLY ? " updated" : " would be updated (re-run with --apply)"}`
);
