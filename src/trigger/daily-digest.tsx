/**
 * Daily new-listings digest. Declarative schedule at 08:00 Europe/London:
 * for each household, email every member the in-band listings that have
 * appeared since the last digest. Morning send = overnight enrichment is
 * done, so rows are rich.
 *
 * Watermark: `households.lastDigestAt`. NULL (never sent) is treated as
 * "the last 24h" so the first email isn't a backlog dump; it's advanced
 * to the run time on every household, even when nothing was sent, so the
 * window never widens.
 *
 * Blind review is preserved — this lists places to review, never a peer's
 * verdict — and household-skipped clusters are excluded (a veto hides it).
 */
import { logger, schedules } from "@trigger.dev/sdk";
import { and, desc, eq, gt, inArray, isNotNull, } from "drizzle-orm";
import { getDb } from "../../db";
import {
  householdMembers,
  households,
  listingPhotos,
  listings,
  searches,
  swipes,
  user,
} from "../../db/schema";
import { getResend } from "../lib/email/client";
import { FROM_EMAIL, appUrl, emailPhotoUrl } from "../lib/email/config";
import { DigestEmail, type DigestItem } from "../lib/email/digest-email";

/** CSS width the digest thumbnail renders at (see digest-email.tsx). */
const THUMB_WIDTH = 120;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 20;

type Db = ReturnType<typeof getDb>;

type NewListingRow = {
  id: string;
  clusterId: string | null;
  searchId: string;
  addressRaw: string;
  postcode: string | null;
  priceMonthly: number | null;
  bedrooms: number | null;
  firstSeenAt: Date;
};
type Band = { min: number | null; max: number | null };

function formatPrice(monthly: number | null): string {
  return monthly == null ? "Price on request" : `£${monthly.toLocaleString("en-GB")}/mo`;
}
function shortAddress(addressRaw: string): string {
  const idx = addressRaw.indexOf(",");
  return (idx === -1 ? addressRaw : addressRaw.slice(0, idx)).trim();
}
function outcodeOf(postcode: string | null): string {
  if (!postcode) {
    return "";
  }
  const t = postcode.trim().toUpperCase();
  const i = t.indexOf(" ");
  return i === -1 ? t : t.slice(0, i);
}
function priceWithinBand(
  price: number | null,
  min: number | null,
  max: number | null
): boolean {
  if (price == null) {
    return true;
  }
  if (min != null && price < min) {
    return false;
  }
  return !(max != null && price > max);
}

/** Cheapest in-band listing per cluster, from a batch of new arrivals. */
function pickHeadlines(
  rows: NewListingRow[],
  bandBySearch: Map<string, Band>
): Map<string, NewListingRow> {
  const head = new Map<string, NewListingRow>();
  for (const row of rows) {
    if (!row.clusterId) {
      continue;
    }
    const band = bandBySearch.get(row.searchId);
    if (band && !priceWithinBand(row.priceMonthly, band.min, band.max)) {
      continue;
    }
    const existing = head.get(row.clusterId);
    const cheaper =
      !existing ||
      (row.priceMonthly != null &&
        (existing.priceMonthly == null ||
          row.priceMonthly < existing.priceMonthly));
    if (cheaper) {
      head.set(row.clusterId, row);
    }
  }
  return head;
}

/** Absolute, thumbnail-sized first-photo URL per listing id. */
async function loadFirstPhotos(
  db: Db,
  listingIds: string[]
): Promise<Map<string, string>> {
  const byListing = new Map<string, string>();
  if (listingIds.length === 0) {
    return byListing;
  }
  const photos = await db
    .select({
      listingId: listingPhotos.listingId,
      url: listingPhotos.url,
      r2Key: listingPhotos.r2Key,
    })
    .from(listingPhotos)
    .where(inArray(listingPhotos.listingId, listingIds))
    .orderBy(listingPhotos.position);
  for (const p of photos) {
    if (!byListing.has(p.listingId)) {
      byListing.set(p.listingId, emailPhotoUrl(p, THUMB_WIDTH));
    }
  }
  return byListing;
}

/** New in-band, non-vetoed clusters for a household since `since`. */
async function newClustersForHousehold(
  db: Db,
  householdId: string,
  since: Date
): Promise<{ items: DigestItem[]; total: number }> {
  const active = await db
    .select({
      id: searches.id,
      minPrice: searches.minPrice,
      maxPrice: searches.maxPrice,
    })
    .from(searches)
    .where(and(eq(searches.householdId, householdId), eq(searches.active, true)));
  if (active.length === 0) {
    return { items: [], total: 0 };
  }
  const bandBySearch = new Map(
    active.map((s) => [s.id, { min: s.minPrice, max: s.maxPrice }] as const)
  );

  // New arrivals since the watermark, in the household's active searches.
  // `inArray(searchId, …)` already excludes manually-added rows (searchId
  // NULL); the filter below narrows the type to match `NewListingRow`.
  const rawRows = await db
    .select({
      id: listings.id,
      clusterId: listings.clusterId,
      searchId: listings.searchId,
      addressRaw: listings.addressRaw,
      postcode: listings.postcode,
      priceMonthly: listings.priceMonthly,
      bedrooms: listings.bedrooms,
      firstSeenAt: listings.firstSeenAt,
    })
    .from(listings)
    .where(
      and(
        isNotNull(listings.clusterId),
        inArray(
          listings.searchId,
          active.map((s) => s.id)
        ),
        gt(listings.firstSeenAt, since)
      )
    )
    .orderBy(desc(listings.firstSeenAt));
  const rows: NewListingRow[] = rawRows.filter(
    (r): r is NewListingRow => r.searchId !== null
  );

  const headByCluster = pickHeadlines(rows, bandBySearch);
  if (headByCluster.size === 0) {
    return { items: [], total: 0 };
  }

  // Drop household-vetoed clusters (any member swiped skip).
  const clusterIds = [...headByCluster.keys()];
  const skips = await db
    .select({ clusterId: swipes.clusterId })
    .from(swipes)
    .innerJoin(householdMembers, eq(swipes.userId, householdMembers.userId))
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(swipes.outcome, "skip"),
        inArray(swipes.clusterId, clusterIds)
      )
    );
  const skipped = new Set(skips.map((s) => s.clusterId));

  // Newest-first order, vetoes removed.
  const ordered = clusterIds
    .filter((id) => !skipped.has(id))
    .map((id) => headByCluster.get(id) as NewListingRow)
    .sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime());
  if (ordered.length === 0) {
    return { items: [], total: 0 };
  }

  const shown = ordered.slice(0, MAX_ITEMS);
  const firstPhoto = await loadFirstPhotos(
    db,
    shown.map((h) => h.id)
  );

  const items: DigestItem[] = shown.map((h) => ({
    address: shortAddress(h.addressRaw),
    price: formatPrice(h.priceMonthly),
    beds: h.bedrooms,
    outcode: outcodeOf(h.postcode),
    photoUrl: firstPhoto.get(h.id) ?? null,
    listingUrl: `${appUrl()}/listings/${h.clusterId}?from=review`,
  }));
  return { items, total: ordered.length };
}

export const dailyDigestTask = schedules.task({
  id: "daily-digest",
  cron: { pattern: "0 8 * * *", timezone: "Europe/London" },
  run: async () => {
    const db = getDb();
    const allHouseholds = await db
      .select({ id: households.id, lastDigestAt: households.lastDigestAt })
      .from(households);

    const now = new Date();
    const reviewUrl = `${appUrl()}/`;
    let householdsEmailed = 0;

    for (const h of allHouseholds) {
      const since = h.lastDigestAt ?? new Date(now.getTime() - DAY_MS);
      const { items, total } = await newClustersForHousehold(db, h.id, since);
      // Advance the watermark regardless, so the window never widens.
      await db
        .update(households)
        .set({ lastDigestAt: now })
        .where(eq(households.id, h.id));
      if (items.length === 0) {
        continue;
      }

      const members = await db
        .select({ email: user.email })
        .from(householdMembers)
        .innerJoin(user, eq(user.id, householdMembers.userId))
        .where(eq(householdMembers.householdId, h.id));
      if (members.length === 0) {
        continue;
      }

      const resend = getResend();
      for (const member of members) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: member.email,
          subject:
            total === 1 ? "1 new place to review" : `${total} new places to review`,
          react: <DigestEmail count={total} items={items} reviewUrl={reviewUrl} />,
        });
      }
      householdsEmailed += 1;
      logger.log("daily-digest: sent", {
        householdId: h.id,
        total,
        members: members.length,
      });
    }

    return { householdsEmailed };
  },
});
