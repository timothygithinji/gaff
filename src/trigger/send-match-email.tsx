/**
 * Send the instant "you both want this" email when a cluster becomes a
 * mutual match. Triggered fire-and-forget from `recordSwipe` once the
 * swipe that completes the match lands (and the notification has been
 * claimed in `match_notifications`, so this only ever runs once per
 * household+cluster).
 *
 * Runs on Trigger.dev (Node) so React Email renders and `RESEND_API_KEY`
 * is available via the synced secrets. One email per household member,
 * each naming the OTHER member(s) — so it reads right for either
 * recipient without caring who completed the match.
 *
 * Email images use our own R2-served photo (right-sized, durable) via
 * `emailPhotoUrl`; the `/clusters/*` photo path is exempted from Cloudflare
 * Access (a bypass app in infra/cloudflare) so it loads without a login,
 * falling back to the portal CDN URL when a photo isn't cached yet. The CTA
 * links into the gated app (Access login is expected — the recipient is a
 * household member).
 */
import { logger, task } from "@trigger.dev/sdk";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  householdMembers,
  listingPhotos,
  listings,
  searches,
  user,
} from "../../db/schema";
import { getResend } from "../lib/email/client";
import { FROM_EMAIL, appUrl, emailPhotoUrl } from "../lib/email/config";
import { MatchEmail } from "../lib/email/match-email";

/** CSS width the match hero renders at (see match-email.tsx container). */
const HERO_WIDTH = 480;

export type SendMatchEmailPayload = {
  householdId: string;
  clusterId: string;
};

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

const WHITESPACE_RE = /\s+/;

function firstName(name: string | null): string {
  return (name ?? "").trim().split(WHITESPACE_RE)[0] || "your housemate";
}

export const sendMatchEmailTask = task({
  id: "send-match-email",
  maxDuration: 60,
  run: async ({ householdId, clusterId }: SendMatchEmailPayload) => {
    const db = getDb();

    const members = await db
      .select({ email: user.email, name: user.name })
      .from(householdMembers)
      .innerJoin(user, eq(user.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, householdId));
    if (members.length === 0) {
      logger.warn("send-match-email: no members, skipping", { householdId });
      return { sent: 0 };
    }

    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
    });
    if (!cluster) {
      throw new Error(`send-match-email: cluster ${clusterId} not found`);
    }

    // Cheapest listing in this cluster that belongs to the household's
    // searches — the headline the match feed would show.
    const headlineRows = await db
      .select({
        id: listings.id,
        addressRaw: listings.addressRaw,
        postcode: listings.postcode,
        priceMonthly: listings.priceMonthly,
        bedrooms: listings.bedrooms,
      })
      .from(listings)
      .innerJoin(searches, eq(listings.searchId, searches.id))
      .where(
        and(
          eq(listings.clusterId, clusterId),
          eq(searches.householdId, householdId)
        )
      )
      .orderBy(sql`${listings.priceMonthly} ASC NULLS LAST`)
      .limit(1);
    const headline = headlineRows[0];
    if (!headline) {
      logger.warn("send-match-email: no household listing for cluster", {
        householdId,
        clusterId,
      });
      return { sent: 0 };
    }

    const photoRows = await db
      .select({ url: listingPhotos.url, r2Key: listingPhotos.r2Key })
      .from(listingPhotos)
      .where(inArray(listingPhotos.listingId, [headline.id]))
      .orderBy(asc(listingPhotos.position))
      .limit(1);

    const address = shortAddress(headline.addressRaw);
    const props = {
      address,
      price: formatPrice(headline.priceMonthly),
      beds: headline.bedrooms,
      outcode: outcodeOf(headline.postcode ?? cluster.postcode),
      photoUrl: photoRows[0] ? emailPhotoUrl(photoRows[0], HERO_WIDTH) : null,
      listingUrl: `${appUrl()}/listings/${clusterId}?from=shortlist`,
    };

    const resend = getResend();
    let sent = 0;
    for (const member of members) {
      const partnerName =
        members
          .filter((m) => m.email !== member.email)
          .map((m) => firstName(m.name))
          .join(" & ") || "Your housemate";
      await resend.emails.send({
        from: FROM_EMAIL,
        to: member.email,
        subject: `You both want ${address}`,
        react: <MatchEmail partnerName={partnerName} {...props} />,
      });
      sent += 1;
    }

    logger.log("send-match-email: done", { householdId, clusterId, sent });
    return { sent };
  },
});
