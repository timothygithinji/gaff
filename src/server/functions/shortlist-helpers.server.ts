/**
 * Server-only helpers shared by `shortlist.ts` and `pipeline.ts`.
 *
 * Lives in a `.server.ts` file so TanStack Start's build never even
 * resolves this module from the client bundle — it can freely import
 * `session.ts` (which pulls in `cloudflare:workers`) without leaking
 * those imports into the browser graph.
 *
 * If we exported these helpers from `shortlist.ts` directly, the
 * client-side import of `listMutualMatches` would force rollup to
 * resolve every other export's import chain (including `cloudflare:
 * workers`) just to know what types are exposed, and the build would
 * fail in the client environment.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  householdMembers,
  listingPhotos,
  listings,
  swipes,
  user,
} from "../../../db/schema";
import { getCurrentUser } from "./session";
import type { MutualMatch, ShortlistMember } from "./shortlist";

/** First grapheme of an email address, upper-cased for avatar initials. */
function initialOf(email: string): string {
  return (email[0] ?? "?").toUpperCase();
}

type ClusterSummaryInput = {
  clusterId: string;
  searchId: string;
  matchedAt: Date;
  householdMemberUserIds: string[];
};

/**
 * Hydrate one cluster into the wire shape. Pulls the cheapest listing
 * for the cluster (across all portals), the price spread, the
 * cheapest's first photo, and the household members who voted into the
 * cluster.
 *
 * Returns `null` when the cluster has no listings backing it (this can
 * happen briefly during scrape / cluster churn).
 */
export async function hydrateClusterSummary(
  db: ReturnType<typeof getDb>,
  input: ClusterSummaryInput
): Promise<MutualMatch | null> {
  const clusterListings = await db
    .select()
    .from(listings)
    .where(eq(listings.clusterId, input.clusterId));

  if (clusterListings.length === 0) {
    return null;
  }

  // Cheapest-first. NULL prices sink. Stable secondary sort by id so
  // we never flip between rows with identical prices.
  const sortedListings = [...clusterListings].sort((a, b) => {
    if (a.priceMonthly == null && b.priceMonthly == null) {
      return a.id.localeCompare(b.id);
    }
    if (a.priceMonthly == null) {
      return 1;
    }
    if (b.priceMonthly == null) {
      return -1;
    }
    if (a.priceMonthly === b.priceMonthly) {
      return a.id.localeCompare(b.id);
    }
    return a.priceMonthly - b.priceMonthly;
  });

  const headlineListing = sortedListings[0];
  if (!headlineListing) {
    return null;
  }

  const headlinePhotos = await db
    .select({ url: listingPhotos.url, r2Key: listingPhotos.r2Key })
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, headlineListing.id))
    .orderBy(listingPhotos.position)
    .limit(1);
  const headlinePhoto = headlinePhotos[0];
  const photoUrl = headlinePhoto
    ? (headlinePhoto.r2Key ?? headlinePhoto.url)
    : null;

  const portalSpread = sortedListings
    .filter((l) => l.id !== headlineListing.id)
    .map((l) => ({
      portal: l.portal,
      priceMonthly: l.priceMonthly,
      url: l.url,
    }));

  const voterRows = await db
    .select({
      userId: swipes.userId,
      name: user.name,
      email: user.email,
    })
    .from(swipes)
    .innerJoin(user, eq(user.id, swipes.userId))
    .where(
      and(
        eq(swipes.clusterId, input.clusterId),
        inArray(swipes.userId, input.householdMemberUserIds),
        inArray(swipes.outcome, ["keep", "shortlist"])
      )
    );
  const dedupedVoters = new Map<string, ShortlistMember>();
  for (const row of voterRows) {
    if (!dedupedVoters.has(row.userId)) {
      dedupedVoters.set(row.userId, {
        userId: row.userId,
        name: row.name,
        emailInitial: initialOf(row.email),
      });
    }
  }

  return {
    clusterId: input.clusterId,
    searchId: input.searchId,
    matchedAt: input.matchedAt,
    headline: {
      listingId: headlineListing.id,
      addressRaw: headlineListing.addressRaw,
      priceMonthly: headlineListing.priceMonthly,
      bedrooms: headlineListing.bedrooms,
      bathrooms: headlineListing.bathrooms,
      propertyType: headlineListing.propertyType,
      postcode: headlineListing.postcode,
      photoUrl,
      portal: headlineListing.portal,
      url: headlineListing.url,
      agentEmail: readAgentEmail(headlineListing.rawJson),
    },
    portalSpread,
    members: [...dedupedVoters.values()],
  };
}

function readAgentEmail(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const obj = rawJson as Record<string, unknown>;
  const candidate = obj.agentEmail ?? obj.agent_email ?? obj.email;
  if (typeof candidate === "string" && candidate.includes("@")) {
    return candidate;
  }
  return null;
}

/**
 * Resolve the caller's household + every member's user id. Throws when
 * there's no session or no household — mirrors the pattern in
 * `review.ts`'s `requireHouseholdMembers`.
 */
export async function requireHouseholdScope(): Promise<{
  householdId: string;
  memberUserIds: string[];
  currentUserId: string;
}> {
  const session = await getCurrentUser();
  if (!session) {
    throw new Error("unauthorized");
  }
  const db = getDb();
  const myMembership = await db.query.householdMembers.findFirst({
    where: (hm, { eq: eqOp }) => eqOp(hm.userId, session.userId),
  });
  if (!myMembership) {
    throw new Error("no_household");
  }
  const members = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, myMembership.householdId));
  return {
    householdId: myMembership.householdId,
    memberUserIds: members.map((m) => m.userId),
    currentUserId: session.userId,
  };
}
