/**
 * Shared logic for healing the lat/lng-gated geo enrichments, used by the
 * recurring `enrich-geo-sweep` schedule and the one-off
 * `backfill-geo-enrich` script so the two can't drift.
 *
 * The leak this exists to close: a `property_clusters` row is created
 * from a search-tier listing (which has no coordinates) *before* the
 * detail scrape lands the real lat/lng, so the cluster is born with NULL
 * coords. Every lat/lng-gated enricher (amenities, nearby-transit,
 * station-routes, council-tax) reads the *cluster's* coords and silently
 * no-ops when they're absent — so an un-located cluster looks "enriched"
 * (the run completes green) while writing nothing. `scrape-detail` now
 * promotes coords onto the cluster at write time, but anything clustered
 * before that fix, or whose enrichers fired before the coords landed,
 * needs this backstop.
 */
import { sql } from "drizzle-orm";
import type { getDb } from "../../db";
import * as schema from "../../db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * The lat/lng-gated tasks to re-fire for a located-but-unenriched
 * cluster. EPC + broadband key off the postcode, not coordinates, so
 * they're not part of the geo backstop. Triggered by string id (the same
 * way `pipeline.ts` fans enrichment out) so this module doesn't pull the
 * task graph into its import.
 */
export const GEO_SWEEP_TASK_IDS = [
  "enrich-amenities",
  "enrich-nearby-transit",
  "enrich-station-routes",
  "enrich-council-tax",
] as const;

/**
 * Promote listing coords onto any cluster that still lacks them. A
 * cluster is one building, so any located listing locates it; the
 * cheapest listing wins the tiebreak, deterministically. Returns the
 * number of clusters located by this call.
 */
export async function promoteClusterCoords(db: Db): Promise<number> {
  const res = await db.execute(sql`
    UPDATE ${schema.propertyClusters} AS c
    SET lat = src.lat, lng = src.lng
    FROM (
      SELECT DISTINCT ON (cluster_id) cluster_id, lat, lng
      FROM ${schema.listings}
      WHERE cluster_id IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY cluster_id, price_monthly ASC NULLS LAST
    ) AS src
    WHERE c.id = src.cluster_id AND (c.lat IS NULL OR c.lng IS NULL)
  `);
  return res.rowCount ?? 0;
}

/**
 * Located clusters whose listings are missing the coord-gated pair
 * (amenities / nearby-transit). Used as the "needs geo" backlog: once a
 * cluster carries both on at least one listing it drops out, so the
 * sweep converges to no work. station-routes is left out of the
 * predicate because it's Rightmove-only and legitimately absent for many
 * clusters — we still re-fire it (it no-ops where it doesn't apply).
 */
export async function findGeoBacklogClusterIds(
  db: Db,
  limit: number
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.propertyClusters.id })
    .from(schema.propertyClusters)
    .where(
      sql`
        ${schema.propertyClusters.lat} IS NOT NULL
        AND ${schema.propertyClusters.lng} IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM ${schema.listings} l
          WHERE l.cluster_id = ${schema.propertyClusters.id}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM ${schema.listings} l
          JOIN ${schema.enrichments} e ON e.listing_id = l.id
          WHERE l.cluster_id = ${schema.propertyClusters.id}
            AND e.amenities IS NOT NULL
            AND e.nearby_transit IS NOT NULL
        )
      `
    )
    .limit(limit);
  return rows.map((r) => r.id);
}
