#!/usr/bin/env bun
/**
 * One-off prod backfill: normalise the bathrooms sentinel.
 *
 * Portals emit `0` for "bathroom count not stated"; no rentable property
 * has zero bathrooms. The parsers now map 0 -> NULL (see
 * `bathroomCount` in src/lib/parsers/common.ts), but rows ingested before
 * that fix still carry a literal 0. Set them to NULL so the band filters
 * keep them (NULL = unknown) instead of displaying "0 baths".
 *
 *   doppler run --project gaff --config prd --scope ~/.t-stack/orgs/timothygithinji \
 *     -- bun scripts/database/backfill-bathrooms-null.ts
 */
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set");
}
const db = drizzle(neon(url), { schema });

const before = await db.execute(sql`
  SELECT portal, COUNT(*) AS n FROM listings WHERE bathrooms = 0 GROUP BY portal ORDER BY n DESC
`);
console.log("rows with bathrooms = 0 (before):");
console.table(before.rows);

const res = await db.execute(sql`UPDATE listings SET bathrooms = NULL WHERE bathrooms = 0`);
console.log("UPDATE affected rows:", (res as { rowCount?: number }).rowCount ?? "(n/a)");

const after = await db.execute(sql`SELECT COUNT(*) AS still_zero FROM listings WHERE bathrooms = 0`);
console.log("rows with bathrooms = 0 (after):", after.rows);
process.exit(0);
