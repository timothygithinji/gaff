/**
 * Listing-detail screen server function.
 *
 * Powers `/listings/$clusterId` — the deep-dive page the user lands on
 * after tapping a card on Review or Shortlist. Aggregates every listing
 * row belonging to one cluster, picks the cheapest as the headline,
 * surfaces the per-portal price spread (the "+£50" deltas in the
 * design), pulls AI enrichment for the floorplan / small-print, and
 * folds in the user's + their household partners' swipe outcomes so
 * the sticky bottom CTA can branch on state.
 *
 * Authorisation: the cluster must have at least one listing belonging
 * to a search owned by the caller's household. Anything else 404s.
 * Mirrors the household scoping in `review.ts` and `shortlist.ts`.
 *
 * Public records: postcodes.io is the only typed external client we
 * use here. It gives us the admin district + police-force area (a
 * coarse "crime area" label). Broadband + flood risk + amenity counts
 * are not in postcodes.io — broadband comes from AI enrichment when
 * available; the rest render as "pending" placeholders until we land a
 * dedicated client for them (deferred to v1.1).
 */
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  enrichments,
  householdMembers,
  listingPhotos,
  listings,
  searches,
  swipes,
  user,
} from "../../../db/schema";
import type { Features } from "../../lib/ai/prompt";
import { createPostcodesClient } from "../../lib/api-clients/postcodes-io";
import { lookupPostcode } from "../../lib/api-clients/postcodes-io/generated";
import { env as parsedEnv } from "../../lib/env";
import type { Env } from "../../server";
import { getCurrentUser } from "./session";

// -----------------------------------------------------------------------------
// Wire types
// -----------------------------------------------------------------------------

export type ListingDetailCluster = {
  id: string;
  normalisedAddress: string;
  postcode: string | null;
  lat: string | null;
  lng: string | null;
};

export type ListingDetailHeadline = {
  listingId: string;
  portal: string;
  url: string;
  addressRaw: string;
  priceMonthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  postcode: string | null;
  firstSeenAt: string;
};

export type ListingDetailPortalRow = {
  portal: string;
  priceMonthly: number | null;
  url: string;
  agentName: string | null;
  agentEmail: string | null;
  /** Pence delta from the headline (cheapest) row. Always >= 0. */
  deltaFromHeadline: number | null;
};

export type ListingDetailPhoto = {
  url: string;
  r2Key: string | null;
  position: number;
};

export type ListingDetailEpc = {
  rating: string;
  potential?: string;
  expiresOn?: string;
};

export type ListingDetailSmallPrintItem = {
  severity: "ok" | "caution" | "problem";
  label: string;
  note: string | null;
};

export type ListingDetailPublicRecords = {
  /** "900 Mb FTTP" or similar; AI-extracted, may be undefined. */
  broadband?: string;
  /** Police force area (admin label) — the "where the crime stats apply". */
  crime?: {
    area: string;
    rateLabel: string;
    incidents12mo?: number;
  };
  /** "Very low" | "Low" | "Medium" | "High" — not wired in v1. */
  floodRisk?: string;
  within500m?: {
    gp?: number;
    cafes?: number;
    parks?: number;
    pubs?: number;
  };
};

export type ListingDetailPartnerSwipe = {
  memberId: string;
  userId: string;
  name: string;
  outcome: "keep" | "skip" | "shortlist" | null;
};

export type ListingDetailPayload = {
  cluster: ListingDetailCluster;
  headline: ListingDetailHeadline;
  portalSpread: ListingDetailPortalRow[];
  photos: ListingDetailPhoto[];
  floorplan?: { url: string };
  features?: Features;
  smallPrint: ListingDetailSmallPrintItem[];
  epc?: ListingDetailEpc;
  commuteMinutes?: Record<string, number>;
  publicRecords?: ListingDetailPublicRecords;
  mySwipe?: "keep" | "skip" | "shortlist";
  partnerSwipes: ListingDetailPartnerSwipe[];
  /** Search id that owns the headline listing — needed for swipe writes. */
  searchId: string;
  /**
   * Google Maps Embed API key — surfaced through the server function so
   * the route doesn't need to call `env()` (which only resolves
   * server-side). The Embed API is referrer-restricted on the Google
   * side, so leaking the key is fine for v1.
   */
  googleMapsApiKey: string;
};

// -----------------------------------------------------------------------------
// Input schemas
// -----------------------------------------------------------------------------

const getListingDetailSchema = z.object({
  clusterId: z.string().trim().min(1),
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Coerce the polymorphic `features` jsonb to the Features shape. */
function asFeatures(value: unknown): Features | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  return value as Features;
}

/** Read agent name / email best-effort from a listings.rawJson blob. */
function readAgentInfo(rawJson: unknown): {
  name: string | null;
  email: string | null;
} {
  if (!rawJson || typeof rawJson !== "object") {
    return { name: null, email: null };
  }
  const obj = rawJson as Record<string, unknown>;
  let name: string | null = null;
  if (typeof obj.agentName === "string") {
    name = obj.agentName;
  } else if (typeof obj.agent_name === "string") {
    name = obj.agent_name;
  }
  const emailCandidate = obj.agentEmail ?? obj.agent_email ?? obj.email;
  const email =
    typeof emailCandidate === "string" && emailCandidate.includes("@")
      ? emailCandidate
      : null;
  return { name, email };
}

/** Read a `floorplanUrl` from raw_json (only set on ListingDetail blobs). */
function readFloorplanUrl(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const obj = rawJson as Record<string, unknown>;
  const url = obj.floorplanUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/** Coerce the polymorphic `epc` jsonb into the wire shape (optional fields). */
function asEpc(value: unknown): ListingDetailEpc | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const obj = value as {
    currentRating?: unknown;
    potentialRating?: unknown;
    expiresOn?: unknown;
  };
  if (typeof obj.currentRating !== "string") {
    return;
  }
  return {
    rating: obj.currentRating,
    potential:
      typeof obj.potentialRating === "string" ? obj.potentialRating : undefined,
    expiresOn: typeof obj.expiresOn === "string" ? obj.expiresOn : undefined,
  };
}

function asCommuteMinutes(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Resolve the caller's household + every member's user id. Throws on
 * no-session / no-household. Mirrors `requireHouseholdScope` in
 * shortlist.ts.
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
  const db = getDb(env as unknown as Env);
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
// Public-records enrichment
// -----------------------------------------------------------------------------

/**
 * In-isolate cache for postcodes.io lookups. The Worker reuses isolates
 * across requests so a household viewing several listings in the same
 * outcode only pays the round-trip once.
 *
 * Keyed by uppercase postcode-with-no-space ("NW34QT").
 */
const postcodeCache = new Map<string, ListingDetailPublicRecords | null>();

/**
 * Hits postcodes.io for one postcode and returns the slice of
 * public-records data we surface in the UI. Returns null when the
 * postcode is missing / un-resolvable.
 *
 * Today the only field we can populate from postcodes.io is the
 * "crime area" label — postcodes.io exposes `pfa` (police force area)
 * and `admin_district`. Crime counts live on the police.uk API which
 * we don't speak yet (v1.1).
 *
 * Marked `export` so tests can hit it directly without the server-fn
 * wrapper, but it's a plain async function — no `createServerFn` call.
 */
export async function enrichPublicRecords(args: {
  postcode: string | null;
}): Promise<ListingDetailPublicRecords | null> {
  if (!args.postcode) {
    return null;
  }
  const cleaned = args.postcode.replace(/\s+/g, "").toUpperCase();
  if (postcodeCache.has(cleaned)) {
    return postcodeCache.get(cleaned) ?? null;
  }

  try {
    const client = createPostcodesClient();
    const res = await lookupPostcode({
      client,
      path: { postcode: args.postcode },
    });
    if (!res.data?.result) {
      postcodeCache.set(cleaned, null);
      return null;
    }
    const r = res.data.result as {
      admin_district?: unknown;
      pfa?: unknown;
    };
    const adminDistrict =
      typeof r.admin_district === "string" ? r.admin_district : null;
    const pfa = typeof r.pfa === "string" ? r.pfa : null;
    const area = pfa ?? adminDistrict;

    if (!area) {
      postcodeCache.set(cleaned, null);
      return null;
    }

    const payload: ListingDetailPublicRecords = {
      crime: {
        area,
        // Without the police.uk numbers we can't classify vs the city
        // average — surface a neutral label so the UI still renders.
        rateLabel: "See police.uk",
      },
    };
    postcodeCache.set(cleaned, payload);
    return payload;
  } catch {
    // postcodes.io is unauthenticated + free; transient failures
    // shouldn't tank the page. Cache the null so we don't retry on
    // every refresh.
    postcodeCache.set(cleaned, null);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Server function
// -----------------------------------------------------------------------------

export const getListingDetail = createServerFn({ method: "GET" })
  .inputValidator(getListingDetailSchema)
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 8-step aggregation handler — each step is small and labelled with a comment; splitting would obscure the data flow.
  .handler(async ({ data }): Promise<ListingDetailPayload> => {
    const { householdId, memberUserIds, currentUserId } =
      await requireHouseholdScope();
    const db = getDb(env as unknown as Env);

    // Step 1: pull the household's active searches; we only ever
    // surface listings tied to one of these. (An inactive search's
    // historical listings stay visible — but a search that was never
    // owned by this household never does.)
    const householdSearches = await db
      .select({ id: searches.id })
      .from(searches)
      .where(eq(searches.householdId, householdId));
    const searchIds = householdSearches.map((s) => s.id);
    if (searchIds.length === 0) {
      throw new Error("not_found");
    }

    // Step 2: load the cluster + every listing in it that belongs to
    // one of this household's searches.
    const cluster = await db.query.propertyClusters.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, data.clusterId),
    });
    if (!cluster) {
      throw new Error("not_found");
    }

    const clusterListings = await db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.clusterId, data.clusterId),
          inArray(listings.searchId, searchIds)
        )
      );

    if (clusterListings.length === 0) {
      // The cluster exists, but no listing on it is owned by this
      // household → treat as 404 (same as if the cluster were
      // unknown).
      throw new Error("not_found");
    }

    // Cheapest-first ordering. NULL prices sink to the bottom; stable
    // tie-break by id to keep the order deterministic across refreshes.
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
      throw new Error("not_found");
    }

    const headlinePrice = headlineListing.priceMonthly;

    // Step 3: portal spread — every distinct portal listing in the
    // cluster, in cheapest-first order. We dedupe by
    // `(portal, portalListingId)` because the listings table is keyed
    // by (search_id, portal, portal_listing_id), so the *same* physical
    // listing can have multiple rows when more than one of the
    // household's searches scraped it. Without this, a single Rightmove
    // listing picked up by two overlapping searches would render twice.
    // We keep the first occurrence — `sortedListings` is cheapest-first
    // so duplicates would carry identical prices anyway.
    const seenPortalListings = new Set<string>();
    const dedupedListings = sortedListings.filter((l) => {
      const key = `${l.portal}::${l.portalListingId}`;
      if (seenPortalListings.has(key)) {
        return false;
      }
      seenPortalListings.add(key);
      return true;
    });

    const portalSpread: ListingDetailPortalRow[] = dedupedListings.map((l) => {
      const agent = readAgentInfo(l.rawJson);
      const delta =
        l.priceMonthly != null && headlinePrice != null
          ? l.priceMonthly - headlinePrice
          : null;
      return {
        portal: l.portal,
        priceMonthly: l.priceMonthly,
        url: l.url,
        agentName: agent.name,
        agentEmail: agent.email,
        deltaFromHeadline: delta,
      };
    });

    // Step 4: photos for the headline listing only. Fall back to the
    // portal URL when no R2 mirror exists.
    const photoRows = await db
      .select()
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, headlineListing.id))
      .orderBy(listingPhotos.position);

    const photos: ListingDetailPhoto[] = photoRows.map((p) => ({
      url: p.r2Key ?? p.url,
      r2Key: p.r2Key,
      position: p.position,
    }));

    // Step 5: a floorplan URL might be on any listing's raw_json — we
    // surface the first one we find. Today only Rightmove + OpenRent
    // capture this; Zoopla does on detail pages but the parser uses
    // ListingSummary by default.
    let floorplanUrl: string | null = null;
    for (const l of sortedListings) {
      const u = readFloorplanUrl(l.rawJson);
      if (u) {
        floorplanUrl = u;
        break;
      }
    }

    // Step 6: enrichment — latest prompt version. We attach the
    // headline listing's enrichment row. Other portals' enrichments
    // are deliberately ignored — the headline is the canonical source
    // of truth for AI output (one cluster, one extracted features
    // payload).
    const enrichmentRows = await db
      .select()
      .from(enrichments)
      .where(eq(enrichments.listingId, headlineListing.id))
      .orderBy(desc(enrichments.promptVersion))
      .limit(1);
    const enrichment = enrichmentRows[0];
    const features = asFeatures(enrichment?.features);
    const smallPrint = features?.smallPrint ?? [];
    const epc = asEpc(enrichment?.epc);
    const commuteMinutes = asCommuteMinutes(enrichment?.commuteMinutes);

    // Step 7: swipe state for every household member on this cluster.
    // We surface the caller's own outcome separately from the
    // partners'. The UI uses this to drive the sticky CTA copy
    // (see `src/components/listing-detail/detail-cta.tsx`).
    const swipeRows = await db
      .select({
        userId: swipes.userId,
        outcome: swipes.outcome,
      })
      .from(swipes)
      .where(
        and(
          eq(swipes.clusterId, data.clusterId),
          inArray(swipes.userId, memberUserIds)
        )
      );
    const swipeByUser = new Map(swipeRows.map((s) => [s.userId, s.outcome]));

    const memberRows = await db
      .select({
        memberId: householdMembers.id,
        userId: householdMembers.userId,
        name: user.name,
      })
      .from(householdMembers)
      .innerJoin(user, eq(user.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, householdId));

    const partnerSwipes: ListingDetailPartnerSwipe[] = memberRows
      .filter((m) => m.userId !== currentUserId)
      .map((m) => ({
        memberId: m.memberId,
        userId: m.userId,
        name: m.name,
        outcome: swipeByUser.get(m.userId) ?? null,
      }));

    const mySwipe = swipeByUser.get(currentUserId) ?? undefined;

    // Step 8: public records — postcodes.io fills the crime area. The
    // rest of the section is fed by AI broadband (if present) and
    // pending placeholders for flood / amenities.
    const postcode = headlineListing.postcode ?? cluster.postcode;
    const postcodesData = await enrichPublicRecords({ postcode });

    const publicRecords: ListingDetailPublicRecords | undefined = (() => {
      const broadband =
        typeof features?.broadband === "string"
          ? features.broadband
          : undefined;
      const crime = postcodesData?.crime;
      if (!(broadband || crime)) {
        return;
      }
      return {
        ...(broadband ? { broadband } : {}),
        ...(crime ? { crime } : {}),
      };
    })();

    return {
      cluster: {
        id: cluster.id,
        normalisedAddress: cluster.normalisedAddress,
        postcode: cluster.postcode,
        lat: cluster.lat,
        lng: cluster.lng,
      },
      headline: {
        listingId: headlineListing.id,
        portal: headlineListing.portal,
        url: headlineListing.url,
        addressRaw: headlineListing.addressRaw,
        priceMonthly: headlineListing.priceMonthly,
        bedrooms: headlineListing.bedrooms,
        bathrooms: headlineListing.bathrooms,
        propertyType: headlineListing.propertyType,
        postcode: headlineListing.postcode,
        firstSeenAt: headlineListing.firstSeenAt.toISOString(),
      },
      portalSpread,
      photos,
      ...(floorplanUrl ? { floorplan: { url: floorplanUrl } } : {}),
      ...(features ? { features } : {}),
      smallPrint,
      ...(epc ? { epc } : {}),
      ...(commuteMinutes ? { commuteMinutes } : {}),
      ...(publicRecords ? { publicRecords } : {}),
      ...(mySwipe ? { mySwipe } : {}),
      partnerSwipes,
      searchId: headlineListing.searchId,
      googleMapsApiKey: parsedEnv().GOOGLE_MAPS_API_KEY,
    };
  });
