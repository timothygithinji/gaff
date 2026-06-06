/**
 * Review-queue deferrals.
 *
 * A defer is the "I can't judge this yet" verb — distinct from a veto.
 * Some listings reach the review queue half-filled by the agent (no EPC,
 * no photos, price TBC); skipping then is premature. Deferring snoozes the
 * cluster for the WHOLE household (the missing data is objective, not a
 * preference) until `deferUntil`, at which point the daily
 * `process-deferrals` sweep has already re-scraped it so fresher data is
 * waiting. See `db/schema.ts` (`clusterDeferrals`) and
 * `src/trigger/process-deferrals.ts`.
 *
 *   deferCluster   — snooze a cluster for 3/5/7 days (re-defer overwrites).
 *   undeferCluster — pull it back into the queue now.
 *   listDeferrals  — the still-snoozed clusters, hydrated for the
 *                    `/deferred` management view.
 *
 * All three are household-scoped: you can only defer/see clusters with at
 * least one listing belonging to one of your household's searches.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  clusterDeferrals,
  listingPhotos,
  listings,
  searches,
  user,
} from "../../../db/schema";
import { resolvePhotoUrl } from "./photo-url";
import { requireHouseholdScope } from "./shortlist-helpers.server";

type Db = ReturnType<typeof getDb>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Guard: the cluster must have at least one listing belonging to one of
 * this household's searches. Throws `cluster_not_in_household` otherwise so
 * a guessed id can't defer a stranger's cluster.
 */
async function assertClusterInHousehold(
  db: Db,
  householdId: string,
  clusterId: string
): Promise<void> {
  const hit = await db
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(searches, eq(listings.searchId, searches.id))
    .where(
      and(eq(listings.clusterId, clusterId), eq(searches.householdId, householdId))
    )
    .limit(1);
  if (hit.length === 0) {
    throw new Error("cluster_not_in_household");
  }
}

// Only 3/5/7-day windows are offered in the UI; validate at runtime but
// keep the wire type a plain number so callers don't have to thread a
// literal union through the whole review action chain.
const deferSchema = z.object({
  clusterId: z.string().trim().min(1),
  days: z
    .number()
    .int()
    .refine((d) => d === 3 || d === 5 || d === 7, "unsupported defer window")
    .default(5),
});

export const deferCluster = createServerFn({ method: "POST" })
  .inputValidator(deferSchema)
  .handler(async ({ data }): Promise<{ ok: true; deferUntil: string }> => {
    const { householdId, currentUserId } = await requireHouseholdScope();
    const db = getDb();
    await assertClusterInHousehold(db, householdId, data.clusterId);

    const deferUntil = new Date(Date.now() + data.days * MS_PER_DAY);
    await db
      .insert(clusterDeferrals)
      .values({
        id: nanoid(),
        householdId,
        clusterId: data.clusterId,
        deferredByUserId: currentUserId,
        deferUntil,
      })
      // Re-deferring an already-snoozed cluster extends the window and
      // clears rescrapedAt so the sweep re-scrapes for the new window.
      .onConflictDoUpdate({
        target: [clusterDeferrals.householdId, clusterDeferrals.clusterId],
        set: {
          deferUntil,
          deferredByUserId: currentUserId,
          rescrapedAt: null,
          createdAt: sql`now()`,
        },
      });
    return { ok: true, deferUntil: deferUntil.toISOString() };
  });

export const undeferCluster = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clusterId: z.string().trim().min(1) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { householdId } = await requireHouseholdScope();
    const db = getDb();
    await db
      .delete(clusterDeferrals)
      .where(
        and(
          eq(clusterDeferrals.householdId, householdId),
          eq(clusterDeferrals.clusterId, data.clusterId)
        )
      );
    return { ok: true };
  });

export type DeferredItem = {
  clusterId: string;
  headlineTitle: string;
  headlineAddress: string;
  priceMonthly: number | null;
  bedrooms: number | null;
  portals: string[];
  photoUrl: string | null;
  /** ISO timestamp the cluster re-enters the queue. */
  deferUntil: string;
  /** ISO timestamp the re-scrape fired, or null if it hasn't yet. */
  rescrapedAt: string | null;
  deferredByName: string | null;
};

/** Cheapest listing in a cluster — the headline (NULL prices sink). */
function cheapest<T extends { priceMonthly: number | null; id: string }>(
  rows: T[]
): T | undefined {
  return [...rows].sort((a, b) => {
    if (a.priceMonthly == null && b.priceMonthly == null) {
      return a.id.localeCompare(b.id);
    }
    if (a.priceMonthly == null) {
      return 1;
    }
    if (b.priceMonthly == null) {
      return -1;
    }
    return a.priceMonthly - b.priceMonthly || a.id.localeCompare(b.id);
  })[0];
}

export const listDeferrals = createServerFn({ method: "GET" }).handler(
  async (): Promise<DeferredItem[]> => {
    const { householdId } = await requireHouseholdScope();
    const db = getDb();

    // Only still-snoozed deferrals — once deferUntil passes the cluster is
    // back in the queue, so it doesn't belong on the "deferred" list.
    const rows = await db
      .select({
        clusterId: clusterDeferrals.clusterId,
        deferUntil: clusterDeferrals.deferUntil,
        rescrapedAt: clusterDeferrals.rescrapedAt,
        deferredByName: user.name,
      })
      .from(clusterDeferrals)
      .leftJoin(user, eq(user.id, clusterDeferrals.deferredByUserId))
      .where(
        and(
          eq(clusterDeferrals.householdId, householdId),
          gt(clusterDeferrals.deferUntil, sql`now()`)
        )
      )
      .orderBy(clusterDeferrals.deferUntil);
    if (rows.length === 0) {
      return [];
    }

    const clusterIds = rows.map((r) => r.clusterId);
    const clusterListings = await db
      .select({
        id: listings.id,
        clusterId: listings.clusterId,
        portal: listings.portal,
        title: listings.title,
        addressRaw: listings.addressRaw,
        priceMonthly: listings.priceMonthly,
        bedrooms: listings.bedrooms,
      })
      .from(listings)
      .where(inArray(listings.clusterId, clusterIds));

    // Group by cluster, then pick the cheapest as the headline + one photo.
    const byCluster = new Map<string, typeof clusterListings>();
    for (const l of clusterListings) {
      if (!l.clusterId) {
        continue;
      }
      const arr = byCluster.get(l.clusterId) ?? [];
      arr.push(l);
      byCluster.set(l.clusterId, arr);
    }
    const headlineIds = [...byCluster.values()]
      .map((ls) => cheapest(ls)?.id)
      .filter((id): id is string => Boolean(id));
    const photoRows = headlineIds.length
      ? await db
          .select({
            listingId: listingPhotos.listingId,
            url: listingPhotos.url,
            r2Key: listingPhotos.r2Key,
            position: listingPhotos.position,
          })
          .from(listingPhotos)
          .where(inArray(listingPhotos.listingId, headlineIds))
      : [];
    const photoByListing = new Map<string, { url: string; r2Key: string | null }>();
    for (const p of [...photoRows].sort((a, b) => a.position - b.position)) {
      if (!photoByListing.has(p.listingId)) {
        photoByListing.set(p.listingId, { url: p.url, r2Key: p.r2Key });
      }
    }

    return rows.map((r): DeferredItem => {
      const ls = byCluster.get(r.clusterId) ?? [];
      const headline = cheapest(ls);
      const photo = headline ? photoByListing.get(headline.id) : undefined;
      return {
        clusterId: r.clusterId,
        headlineTitle: headline?.title ?? "",
        headlineAddress: headline?.addressRaw ?? "",
        priceMonthly: headline?.priceMonthly ?? null,
        bedrooms: headline?.bedrooms ?? null,
        portals: [...new Set(ls.map((l) => l.portal))].sort(),
        photoUrl: photo ? resolvePhotoUrl(photo) : null,
        deferUntil: r.deferUntil.toISOString(),
        rescrapedAt: r.rescrapedAt ? r.rescrapedAt.toISOString() : null,
        deferredByName: r.deferredByName ?? null,
      };
    });
  }
);
