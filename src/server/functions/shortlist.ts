/**
 * Shortlist + Matches server functions.
 *
 * Reads pivot on `v_mutual_matches` (the N-member aggregate view — see
 * `db/schema.ts` for the definition). Every list function returns
 * cluster-level summaries with the cheapest portal as the "headline"
 * listing, the other portals as a price-spread tail, and the members
 * who voted keep/shortlist on the cluster.
 *
 * Three list shapes:
 *
 *   listMutualMatches   — clusters every household member has kept-or-
 *     shortlisted. Powers both the Shortlist screen's "Mutual" tab AND
 *     the dedicated `/matches` route.
 *   listMyOutcomes      — clusters the current user has personally swiped
 *     into ('keep' or 'shortlist'). Powers the "Yours" tab.
 *   listMemberOutcomes  — same but for ANOTHER household member. Powers
 *     the per-member tabs in 3+ households.
 *
 * Two badge functions:
 *
 *   unreadMatchCount    — count of mutual matches that landed *after* the
 *     caller last opened the Matches tab. Defaults to "never seen" (i.e.
 *     all mutual matches count) when no `user_state` row exists.
 *   markMatchesSeen     — upserts the caller's `last_seen_matches`
 *     timestamp; clears the badge.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  householdMembers,
  listingPhotos,
  listings,
  swipes,
  user,
  userState,
  vMutualMatches,
} from "../../../db/schema";
import { getCurrentUser } from "./session";

const outcomeFilterSchema = z.enum(["keep", "shortlist", "keep_or_shortlist"]);

const memberOutcomesSchema = z.object({
  memberId: z.string().trim().min(1),
  outcome: outcomeFilterSchema.default("keep_or_shortlist"),
});

const myOutcomesSchema = z.object({
  outcome: outcomeFilterSchema.default("keep_or_shortlist"),
});

// -----------------------------------------------------------------------------
// Wire types
// -----------------------------------------------------------------------------

export type ShortlistHeadline = {
  listingId: string;
  addressRaw: string;
  priceMonthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  postcode: string | null;
  photoUrl: string | null;
  portal: string;
  url: string;
  /** rawJson may carry an agent email; we surface it for the "Plan a viewing" CTA. */
  agentEmail: string | null;
};

export type ShortlistPortalSpread = {
  portal: string;
  priceMonthly: number | null;
  url: string;
};

export type ShortlistMember = {
  userId: string;
  name: string;
  emailInitial: string;
};

export type MutualMatch = {
  clusterId: string;
  searchId: string;
  matchedAt: Date;
  headline: ShortlistHeadline;
  portalSpread: ShortlistPortalSpread[];
  members: ShortlistMember[];
};

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

/**
 * Pluck a string-typed `agentEmail` (or close variants) from the
 * polymorphic `listings.rawJson` blob. Returns null when the portal
 * parser didn't capture one. Today's parsers don't all surface this —
 * the helper keeps the call sites tolerant.
 */
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
async function hydrateClusterSummary(
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

  const portalSpread: ShortlistPortalSpread[] = sortedListings
    .filter((l) => l.id !== headlineListing.id)
    .map((l) => ({
      portal: l.portal,
      priceMonthly: l.priceMonthly,
      url: l.url,
    }));

  // Members who voted keep/shortlist on this cluster. The view already
  // proved every member agreed for a mutual match, but `listMyOutcomes`
  // / `listMemberOutcomes` also hydrate through here for shape parity —
  // so we still scope the query to the cluster's actual voters.
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

/**
 * Resolve the caller's household + every member's user id. Throws when
 * there's no session or no household — mirrors the pattern in
 * `review.ts`'s `requireHouseholdMembers`.
 */
async function requireHouseholdScope(): Promise<{
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

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export const listMutualMatches = createServerFn({ method: "GET" }).handler(
  async (): Promise<MutualMatch[]> => {
    const { householdId, memberUserIds } = await requireHouseholdScope();
    const db = getDb();

    const rows = await db
      .select({
        clusterId: vMutualMatches.clusterId,
        searchId: vMutualMatches.searchId,
        matchedAt: vMutualMatches.matchedAt,
      })
      .from(vMutualMatches)
      .where(eq(vMutualMatches.householdId, householdId))
      .orderBy(desc(vMutualMatches.matchedAt));

    const summaries = await Promise.all(
      rows.map((r) =>
        hydrateClusterSummary(db, {
          clusterId: r.clusterId,
          searchId: r.searchId,
          matchedAt: r.matchedAt,
          householdMemberUserIds: memberUserIds,
        })
      )
    );
    return summaries.filter((s): s is MutualMatch => s !== null);
  }
);

/**
 * The current user's own keep / shortlist picks. The view-mutual feed
 * already covers the "we both agreed" case — this powers the "Yours"
 * tab on the Shortlist screen, where you want to see what you've
 * personally saved (regardless of whether anyone else has weighed in).
 */
export const listMyOutcomes = createServerFn({ method: "GET" })
  .inputValidator(myOutcomesSchema)
  .handler(async ({ data }): Promise<MutualMatch[]> => {
    const { memberUserIds, currentUserId } = await requireHouseholdScope();
    return listOutcomesFor(currentUserId, data.outcome, memberUserIds);
  });

/**
 * Another household member's keep / shortlist picks. Used for the
 * per-member tabs (Tim's, Sarah's, etc) on the Shortlist screen in
 * 3+ households. Caller must share a household with `memberId`.
 */
export const listMemberOutcomes = createServerFn({ method: "GET" })
  .inputValidator(memberOutcomesSchema)
  .handler(async ({ data }): Promise<MutualMatch[]> => {
    const { memberUserIds } = await requireHouseholdScope();
    if (!memberUserIds.includes(data.memberId)) {
      throw new Error("forbidden");
    }
    return listOutcomesFor(data.memberId, data.outcome, memberUserIds);
  });

/**
 * Shared body for the two outcome list functions. Returns clusters the
 * given user has swiped into, newest-swipe-first, hydrated to the same
 * MutualMatch shape so the UI can render uniformly.
 */
async function listOutcomesFor(
  userId: string,
  outcome: z.infer<typeof outcomeFilterSchema>,
  householdMemberUserIds: string[]
): Promise<MutualMatch[]> {
  const db = getDb();

  const outcomeFilter: Array<"keep" | "shortlist"> =
    outcome === "keep_or_shortlist" ? ["keep", "shortlist"] : [outcome];

  // Latest swipe per (cluster, search) for this user. We group by both
  // so the same cluster swiped in two searches surfaces once per search
  // — matching the view's semantics.
  const rows = await db
    .select({
      clusterId: swipes.clusterId,
      searchId: swipes.searchId,
      matchedAt: sql<Date>`MAX(${swipes.createdAt})`.as("matched_at"),
    })
    .from(swipes)
    .where(
      and(eq(swipes.userId, userId), inArray(swipes.outcome, outcomeFilter))
    )
    .groupBy(swipes.clusterId, swipes.searchId)
    .orderBy(sql`MAX(${swipes.createdAt}) DESC`);

  const summaries = await Promise.all(
    rows.map((r) =>
      hydrateClusterSummary(db, {
        clusterId: r.clusterId,
        searchId: r.searchId,
        matchedAt: r.matchedAt,
        householdMemberUserIds,
      })
    )
  );
  return summaries.filter((s): s is MutualMatch => s !== null);
}

// -----------------------------------------------------------------------------
// Matches-tab badge state
// -----------------------------------------------------------------------------

export const unreadMatchCount = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ count: number }> => {
    const { householdId, currentUserId } = await requireHouseholdScope();
    const db = getDb();

    const stateRow = await db
      .select({ lastSeen: userState.lastSeenMatches })
      .from(userState)
      .where(eq(userState.userId, currentUserId))
      .limit(1);

    // No row yet → treat as "never seen" so every existing match
    // surfaces as unread. The user gets a meaningful badge on first
    // open instead of an inaccurate zero.
    if (stateRow.length === 0) {
      const allRows = await db
        .select({ clusterId: vMutualMatches.clusterId })
        .from(vMutualMatches)
        .where(eq(vMutualMatches.householdId, householdId));
      return { count: allRows.length };
    }

    const lastSeen = stateRow[0]?.lastSeen;
    if (!lastSeen) {
      return { count: 0 };
    }

    const newRows = await db
      .select({ clusterId: vMutualMatches.clusterId })
      .from(vMutualMatches)
      .where(
        and(
          eq(vMutualMatches.householdId, householdId),
          gt(vMutualMatches.matchedAt, lastSeen)
        )
      );
    return { count: newRows.length };
  }
);

export const markMatchesSeen = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { currentUserId } = await requireHouseholdScope();
    const db = getDb();

    const now = new Date();
    await db
      .insert(userState)
      .values({
        userId: currentUserId,
        lastSeenMatches: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userState.userId,
        set: {
          lastSeenMatches: now,
          updatedAt: now,
        },
      });

    return { ok: true };
  }
);
