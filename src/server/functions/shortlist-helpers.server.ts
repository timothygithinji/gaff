/**
 * Server-only helpers shared by `shortlist.ts` and `pipeline.ts`.
 *
 * Lives in a `.server.ts` file so TanStack Start's build never even
 * resolves this module from the client bundle — it can freely import
 * `session.ts` (which pulls in `cloudflare:workers`) without leaking
 * those imports into the browser graph.
 *
 * If we exported these helpers from `shortlist.ts` directly, the
 * client-side import of `listMyOutcomes` would force rollup to
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
import { classifyPropertyKind } from "../../lib/property-kind";
import { resolvePhotoUrl } from "./photo-url";
import { requestMemo } from "./request-cache.server";
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

type ListingRow = typeof listings.$inferSelect;

/**
 * Cheapest-first. NULL prices sink. Stable secondary sort by id so we
 * never flip between rows with identical prices.
 */
function cheapestFirst(a: ListingRow, b: ListingRow): number {
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
}

/**
 * Hydrate many clusters into the wire shape in a fixed **two** DB
 * round-trips, regardless of how many clusters are passed.
 *
 * The old per-cluster path (`hydrateClusterSummary`) issued three serial
 * queries each, and its callers looped — `listPipeline` even `await`ed in
 * a `for` loop — so a Shortlist with N clusters cost ~3N serial Neon
 * subrequests (the CF logs showed these pages fanning out to 40+). This
 * collapses that to: one `db.batch` for all listings + all member votes,
 * then one query for the headline photos once each cluster's cheapest
 * listing is known.
 *
 * Results are returned positionally aligned with `inputs` (a clusterId
 * appearing in two inputs — e.g. swiped under two searches — yields the
 * same summary for each). An entry is `null` when its cluster has no
 * backing listings (brief scrape / cluster churn).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear fetch→group→map aggregation — the two batched reads, the per-cluster grouping, and the row assembly read top-to-bottom; splitting would scatter the data flow across helpers.
export async function hydrateClusterSummaries(
  db: ReturnType<typeof getDb>,
  inputs: ClusterSummaryInput[]
): Promise<Array<MutualMatch | null>> {
  if (inputs.length === 0) {
    return [];
  }

  const clusterIds = [...new Set(inputs.map((i) => i.clusterId))];
  const memberUserIds = [
    ...new Set(inputs.flatMap((i) => i.householdMemberUserIds)),
  ];

  // Round-trip 1: every listing in the batch + every member vote across
  // the batch, shipped as a single HTTP request to Neon.
  const [allListings, allVotes] = await db.batch([
    db.select().from(listings).where(inArray(listings.clusterId, clusterIds)),
    db
      .select({
        clusterId: swipes.clusterId,
        userId: swipes.userId,
        name: user.name,
        email: user.email,
      })
      .from(swipes)
      .innerJoin(user, eq(user.id, swipes.userId))
      .where(
        and(
          inArray(swipes.clusterId, clusterIds),
          inArray(swipes.userId, memberUserIds),
          inArray(swipes.outcome, ["keep", "shortlist"])
        )
      ),
  ]);

  // Cheapest-first listings + headline per cluster.
  const sortedByCluster = new Map<string, ListingRow[]>();
  for (const row of allListings) {
    if (!row.clusterId) {
      continue;
    }
    const existing = sortedByCluster.get(row.clusterId);
    if (existing) {
      existing.push(row);
    } else {
      sortedByCluster.set(row.clusterId, [row]);
    }
  }
  const headlineByCluster = new Map<string, ListingRow>();
  for (const [clusterId, rows] of sortedByCluster) {
    rows.sort(cheapestFirst);
    const headline = rows[0];
    if (headline) {
      headlineByCluster.set(clusterId, headline);
    }
  }

  // Round-trip 2: the first photo for every headline listing. Ordering by
  // position means the first row seen per listing is its lowest position.
  const headlineIds = [...headlineByCluster.values()].map((l) => l.id);
  const photoRows =
    headlineIds.length > 0
      ? await db
          .select({
            listingId: listingPhotos.listingId,
            url: listingPhotos.url,
            r2Key: listingPhotos.r2Key,
          })
          .from(listingPhotos)
          .where(inArray(listingPhotos.listingId, headlineIds))
          .orderBy(listingPhotos.position)
      : [];
  const photoByListing = new Map<string, { url: string; r2Key: string | null }>();
  for (const p of photoRows) {
    if (!photoByListing.has(p.listingId)) {
      photoByListing.set(p.listingId, { url: p.url, r2Key: p.r2Key });
    }
  }

  // Voters per cluster, deduped by user.
  const votersByCluster = new Map<string, Map<string, ShortlistMember>>();
  for (const row of allVotes) {
    let voters = votersByCluster.get(row.clusterId);
    if (!voters) {
      voters = new Map();
      votersByCluster.set(row.clusterId, voters);
    }
    if (!voters.has(row.userId)) {
      voters.set(row.userId, {
        userId: row.userId,
        name: row.name,
        emailInitial: initialOf(row.email),
      });
    }
  }

  return inputs.map((input) => {
    const sortedListings = sortedByCluster.get(input.clusterId);
    const headlineListing = headlineByCluster.get(input.clusterId);
    if (!sortedListings || !headlineListing) {
      return null;
    }

    const headlinePhoto = photoByListing.get(headlineListing.id);
    const photoUrl = headlinePhoto ? resolvePhotoUrl(headlinePhoto) : null;

    const portalSpread = sortedListings
      .filter((l) => l.id !== headlineListing.id)
      .map((l) => ({
        portal: l.portal,
        priceMonthly: l.priceMonthly,
        url: l.url,
      }));

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
        receptions:
          sortedListings.find((l) => l.receptions != null)?.receptions ?? null,
        propertyType: headlineListing.propertyType,
        propertyKind: classifyPropertyKind(
          headlineListing.propertyType,
          headlineListing.title
        ),
        postcode: headlineListing.postcode,
        photoUrl,
        portal: headlineListing.portal,
        url: headlineListing.url,
        agentEmail: readAgentEmail(headlineListing.rawJson),
      },
      portalSpread,
      members: [...(votersByCluster.get(input.clusterId)?.values() ?? [])],
    };
  });
}

/**
 * Single-cluster convenience wrapper around {@link hydrateClusterSummaries}.
 * Prefer the batched form when hydrating more than one cluster.
 */
export async function hydrateClusterSummary(
  db: ReturnType<typeof getDb>,
  input: ClusterSummaryInput
): Promise<MutualMatch | null> {
  const [summary] = await hydrateClusterSummaries(db, [input]);
  return summary ?? null;
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
  // Memoized per request: every server function on a page calls this, so
  // without the cache the same two membership lookups ran once per query
  // (4× on the Review screen). Keyed by user so a household member's
  // request never reuses another's scope.
  return requestMemo(`household-scope:${session.userId}`, async () => {
    const db = getDb();
    // One round-trip instead of two: the subquery resolves the user's
    // household id, and the outer query returns every member of it (the
    // user included). Empty result ⇒ the user has no household.
    const householdIdFor = db
      .select({ id: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, session.userId))
      .limit(1);
    const members = await db
      .select({
        householdId: householdMembers.householdId,
        userId: householdMembers.userId,
      })
      .from(householdMembers)
      .where(inArray(householdMembers.householdId, householdIdFor));
    const householdId = members[0]?.householdId;
    if (!householdId) {
      throw new Error("no_household");
    }
    return {
      householdId,
      memberUserIds: members.map((m) => m.userId),
      currentUserId: session.userId,
    };
  });
}
