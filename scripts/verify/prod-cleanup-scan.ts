#!/usr/bin/env bun
/** Read-only: surface prod data-cleanup candidates after the queue fix. */
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set");
}
const db = drizzle(neon(url), { schema });

const q = async (label: string, query: ReturnType<typeof sql>) => {
  const rows = (await db.execute(query)) as unknown as { rows: unknown[] };
  console.log(`\n== ${label} ==`);
  console.dir(rows.rows ?? rows, { depth: null });
};

await q(
  "Listings by status",
  sql`SELECT status, count(*) FROM listings GROUP BY status ORDER BY 2 DESC`
);
await q(
  "Non-active listings still clustered (would carry stale data into a cluster)",
  sql`SELECT status, count(*) FROM listings WHERE cluster_id IS NOT NULL AND status <> 'active' GROUP BY status`
);
await q(
  "Active+clustered listings missing price or beds (incomplete)",
  sql`SELECT portal, count(*) FILTER (WHERE price_monthly IS NULL) AS no_price,
             count(*) FILTER (WHERE bedrooms IS NULL) AS no_beds,
             count(*) AS total
      FROM listings
      WHERE status='active' AND cluster_id IS NOT NULL
      GROUP BY portal ORDER BY 4 DESC`
);
await q(
  "Clusters with zero active listings (orphaned shells)",
  sql`SELECT count(*) AS orphan_clusters FROM property_clusters pc
      WHERE NOT EXISTS (
        SELECT 1 FROM listings l WHERE l.cluster_id = pc.id AND l.status='active'
      )`
);
await q(
  "Listings with no cluster at all (unclustered)",
  sql`SELECT status, count(*) FROM listings WHERE cluster_id IS NULL GROUP BY status`
);
await q(
  "Expired cluster_deferrals rows lingering (deferUntil in the past)",
  sql`SELECT count(*) AS expired_deferrals FROM cluster_deferrals WHERE defer_until <= now()`
);
await q(
  "The 7 backfilled studios — confirm they now carry beds/price",
  sql`SELECT id, bedrooms, price_monthly, title FROM listings
      WHERE portal='openrent' AND property_type ILIKE 'Studio%' ORDER BY price_monthly`
);
