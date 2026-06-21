/**
 * Per-household new-listings digest.
 *
 * Event-driven, NOT a clock: `scrape-search` triggers this task once the
 * full scrape→cluster→detail→enrich chain for a search has completed (a
 * true join — see scrape-search.ts), so the digest only ever goes out
 * when a search actually finished and the rows are rich. The trigger is
 * debounced per household, so several searches finishing in the same
 * window coalesce into a single email per household.
 *
 * Watermark: `households.lastDigestAt`. NULL (never sent) is treated as
 * "the last 24h" so the first email isn't a backlog dump; it's advanced
 * to the run time up front, even when nothing is sent, so the window
 * never widens.
 *
 * The set of "places to review" is computed by the SAME
 * `loadRankedQueueClusterIds` the review screens use, so the count the
 * email promises can never exceed what the review queue actually shows —
 * the old hand-rolled price-only query could (and did) email places the
 * queue then dropped on beds/baths/exclusions/type, leaving nothing to
 * review.
 *
 * Blind review is preserved — this lists places to review, never a peer's
 * verdict. The digest is built per recipient: each member's own swipes are
 * filtered out (by the shared queue logic), but a partner's skip never
 * hides a new place from you.
 */
import { logger, task } from "@trigger.dev/sdk";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import {
  householdMembers,
  households,
  listingPhotos,
  listings,
  user,
} from "../../db/schema";
import { getResend } from "../lib/email/client";
import { appUrl, emailPhotoUrl, fromEmail } from "../lib/email/config";
import { DigestEmail, type DigestItem } from "../lib/email/digest-email";
import { loadRankedQueueClusterIds } from "../server/functions/reviewable-queue";

/** CSS width the digest thumbnail renders at (see digest-email.tsx). */
const THUMB_WIDTH = 120;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 20;

type Db = ReturnType<typeof getDb>;

type NewListingRow = {
  id: string;
  clusterId: string;
  addressRaw: string;
  postcode: string | null;
  priceMonthly: number | null;
  bedrooms: number | null;
  firstSeenAt: Date;
};

function formatPrice(monthly: number | null): string {
  return monthly == null
    ? "Price on request"
    : `£${monthly.toLocaleString("en-GB")}/mo`;
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

/** Cheapest listing per cluster, from a batch of new arrivals. */
function pickHeadlines(rows: NewListingRow[]): Map<string, NewListingRow> {
  const head = new Map<string, NewListingRow>();
  for (const row of rows) {
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

/**
 * The reviewable clusters that are NEW to a recipient since `since`, built
 * for one member. Selection delegates to {@link loadRankedQueueClusterIds}
 * — the exact same logic the review queue uses — so the email can only ever
 * promise places the queue would actually show this user (their own swipes
 * and household defers are already removed by that function). We then keep
 * the subset with a genuinely new arrival since the last digest.
 */
async function newReviewableClustersForRecipient(
  db: Db,
  householdId: string,
  recipientUserId: string,
  since: Date
): Promise<{ items: DigestItem[]; total: number }> {
  // The recipient's review queue, identical to the on-screen one.
  const { clusterIds } = await loadRankedQueueClusterIds(
    db,
    householdId,
    recipientUserId
  );
  if (clusterIds.length === 0) {
    return { items: [], total: 0 };
  }

  // Of those reviewable clusters, the ones that gained a listing since the
  // last digest — these are what's genuinely "new to review".
  const rawRows = await db
    .select({
      id: listings.id,
      clusterId: listings.clusterId,
      addressRaw: listings.addressRaw,
      postcode: listings.postcode,
      priceMonthly: listings.priceMonthly,
      bedrooms: listings.bedrooms,
      firstSeenAt: listings.firstSeenAt,
    })
    .from(listings)
    .where(
      and(
        inArray(listings.clusterId, clusterIds),
        gt(listings.firstSeenAt, since)
      )
    )
    .orderBy(desc(listings.firstSeenAt));
  const rows: NewListingRow[] = rawRows.filter(
    (r): r is NewListingRow => r.clusterId !== null
  );

  const headByCluster = pickHeadlines(rows);
  if (headByCluster.size === 0) {
    return { items: [], total: 0 };
  }

  // Newest-first order.
  const ordered = [...headByCluster.values()].sort(
    (a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime()
  );

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

export const householdDigestTask = task({
  id: "household-digest",
  maxDuration: 120,
  run: async ({ householdId }: { householdId: string }) => {
    const db = getDb();
    const household = await db.query.households.findFirst({
      where: (h, { eq: eqOp }) => eqOp(h.id, householdId),
      columns: { id: true, lastDigestAt: true },
    });
    if (!household) {
      logger.warn("household-digest: household not found", { householdId });
      return { recipients: 0 };
    }

    const now = new Date();
    const since = household.lastDigestAt ?? new Date(now.getTime() - DAY_MS);
    // Advance the watermark up front, so the window never widens regardless
    // of what any individual member ends up receiving (or if a send fails).
    await db
      .update(households)
      .set({ lastDigestAt: now })
      .where(eq(households.id, householdId));

    const members = await db
      .select({ userId: householdMembers.userId, email: user.email })
      .from(householdMembers)
      .innerJoin(user, eq(user.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, householdId));
    if (members.length === 0) {
      return { recipients: 0 };
    }

    const resend = getResend();
    const reviewUrl = `${appUrl()}/`;
    // Build the digest per recipient: each member's own swipes are filtered
    // out by the shared queue logic, but a partner's skip never hides a new
    // place from them.
    let sentCount = 0;
    for (const member of members) {
      const { items, total } = await newReviewableClustersForRecipient(
        db,
        householdId,
        member.userId,
        since
      );
      if (items.length === 0) {
        continue;
      }
      await resend.emails.send({
        from: fromEmail(),
        to: member.email,
        subject:
          total === 1
            ? "1 new place matched your search"
            : `${total} new places matched your search`,
        react: <DigestEmail count={total} items={items} reviewUrl={reviewUrl} />,
      });
      sentCount += 1;
    }

    logger.log("household-digest: sent", {
      householdId,
      recipients: sentCount,
      members: members.length,
    });
    return { recipients: sentCount };
  },
});
