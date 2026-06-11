/**
 * Shortlist + Matches server functions.
 *
 * Reads pivot on `v_mutual_matches` (the N-member aggregate view — see
 * `db/schema.ts` for the definition). Every list function returns
 * cluster-level summaries with the cheapest portal as the "headline"
 * listing, the other portals as a price-spread tail, and the members
 * who voted keep/shortlist on the cluster.
 *
 * Two list shapes:
 *
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
 *
 * Plain helpers (`hydrateClusterSummary`, `requireHouseholdScope`) live
 * in `./shortlist-helpers.server.ts` — the `.server.ts` suffix keeps the
 * client bundle from chasing their import graph (which transitively
 * pulls in `cloudflare:workers` via `session.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { swipes, userState, vMutualMatches } from "../../../db/schema";
import type { PropertyKind } from "../../lib/property-kind";
import {
  hydrateClusterSummaries,
  requireHouseholdScope,
} from "./shortlist-helpers.server";

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
  /** Coarse kind (flat / house / studio / share / other) classified from
   * {@link propertyType} + title — drives the card subtitle and the
   * pipeline Type filter, mirroring the review queue. */
  propertyKind: PropertyKind;
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
// Reads
// -----------------------------------------------------------------------------

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

  // One batched hydration (two round-trips) rather than 3 queries per
  // cluster — see `hydrateClusterSummaries`.
  const summaries = await hydrateClusterSummaries(
    db,
    rows.map((r) => ({
      clusterId: r.clusterId,
      searchId: r.searchId,
      matchedAt: r.matchedAt,
      householdMemberUserIds,
    }))
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
      const [row] = await db
        .select({ value: count() })
        .from(vMutualMatches)
        .where(eq(vMutualMatches.householdId, householdId));
      return { count: row?.value ?? 0 };
    }

    const lastSeen = stateRow[0]?.lastSeen;
    if (!lastSeen) {
      return { count: 0 };
    }

    const [row] = await db
      .select({ value: count() })
      .from(vMutualMatches)
      .where(
        and(
          eq(vMutualMatches.householdId, householdId),
          gt(vMutualMatches.matchedAt, lastSeen)
        )
      );
    return { count: row?.value ?? 0 };
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
