/**
 * Listing-detail screen server function.
 *
 * Powers `/listings/$clusterId` — the deep-dive page the user lands on
 * after tapping a card on Review or Shortlist. Aggregates every listing
 * row belonging to one cluster, picks the cheapest as the headline,
 * surfaces the per-portal price spread, pulls AI enrichment for the
 * `highlights` / `watchouts` / `summary` v2 schema, and folds in the
 * user's + their household partners' swipe outcomes so the sticky
 * bottom CTA can branch on state.
 *
 * v2 wire-shape: the legacy `smallPrint` field has been retired in
 * favour of `highlights` + `watchouts`. Old enrichment rows under
 * PROMPT_VERSION=v1.0.0 don't carry these arrays — for those rows
 * `highlights` and `watchouts` default to []. Once each listing
 * re-enriches under v2.0.0 the new arrays populate.
 *
 * The "Public records" section now sources broadband, crime, amenities,
 * and flood from the typed `enrichments.broadband / crime / amenities /
 * flood` JSONB columns written by the sibling cluster enrichment tasks.
 * The legacy "AI broadband string" fallback is gone — if the cluster
 * task hasn't run yet, the row renders as "Pending".
 *
 * Authorisation: the cluster must have at least one listing belonging
 * to a search owned by the caller's household. Anything else 404s.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  councilTaxRates,
  enrichments,
  householdMembers,
  listingPhotos,
  listings,
  searches,
  swipes,
  user,
} from "../../../db/schema";
import type {
  Features,
  HighlightItem,
  WatchoutItem,
} from "../../lib/ai/prompt";
import {
  COUNCIL_TAX_BANDS,
  type CouncilTaxBand,
  bandAmountPence,
  normaliseBand,
} from "../../lib/council-tax";
import { env as parsedEnv } from "../../lib/env";
import type { ListingDetail, NearestStation } from "../../lib/parsers/types";
import { resolvePhotoUrl } from "./photo-url";
import { requireHouseholdScope } from "./shortlist-helpers.server";

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

/**
 * Re-exported convenience aliases for the consumer side; the
 * authoritative source is `src/lib/ai/prompt.ts`.
 */
export type ListingDetailHighlight = HighlightItem;
export type ListingDetailWatchout = WatchoutItem;

/** One band's estimated council tax, in whole pounds. */
export type ListingDetailCouncilTaxBand = {
  band: CouncilTaxBand;
  annualPounds: number;
  monthlyPounds: number;
};

/**
 * Council tax estimate for a listing's billing authority: every band
 * A–H, plus which band the listing itself is (so the UI can highlight
 * it — or fall back to the whole table when the listing's band is
 * unknown, which is common).
 */
export type ListingDetailCouncilTax = {
  /** Billing-authority name, e.g. "Barnet". */
  authority: string;
  /** Tax year the figures are for, e.g. "2026-27". */
  year: string;
  /** The listing's band, if known — for highlighting in the table. */
  listingBand: CouncilTaxBand | null;
  /** All eight bands, ascending A→H. */
  bands: ListingDetailCouncilTaxBand[];
};

/**
 * Closed-shape "fine print" lifted off `listing.rawJson` so the UI can
 * surface a stable set of tenancy-relevant facts (deposit, fees,
 * minimum term, available-from, agent contact, billsIncluded).
 */
export type ListingDetailFineprint = {
  deposit: number | null;
  feesText: string | null;
  minimumTermMonths: number | null;
  letType: string | null;
  serviceChargeAnnual: number | null;
  groundRentAnnual: number | null;
  availableFrom: string | null;
  agentName: string | null;
  agentPhone: string | null;
  agentBranchUrl: string | null;
  billsIncluded: boolean | null;
  /** The listing's own band, when the portal reported one. */
  councilTaxBand: string | null;
  /**
   * Estimated council tax for every band A–H in the listing's billing
   * authority, derived from the seeded area Band D via the fixed
   * statutory ratios. Null when we couldn't resolve the authority or
   * have no seeded rate for it. Approximate — parish precepts vary
   * within an authority. England only.
   */
  councilTax: ListingDetailCouncilTax | null;
  furnished: "furnished" | "unfurnished" | "part_furnished" | null;
  sizeSqFt: number | null;
  nearestStations: NearestStation[];
};

export type ListingDetailBroadband = {
  technology: "FTTP" | "FTTC" | "ADSL" | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  fttpAvailable: boolean;
};

export type ListingDetailCrime = {
  month: string;
  total: number;
  topCategory: { category: string; count: number } | null;
};

export type ListingDetailAmenities = {
  withinMeters: number;
  counts: Record<string, number>;
};

export type ListingDetailFlood = {
  riskLevel: "very-low" | "low" | "medium" | "high" | "unknown";
};

export type ListingDetailPublicRecords = {
  broadband?: ListingDetailBroadband;
  crime?: ListingDetailCrime;
  amenities?: ListingDetailAmenities;
  flood?: ListingDetailFlood;
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
  summary: string | null;
  highlights: ListingDetailHighlight[];
  watchouts: ListingDetailWatchout[];
  epc?: ListingDetailEpc;
  commuteMinutes?: Record<string, number>;
  publicRecords?: ListingDetailPublicRecords;
  fineprint: ListingDetailFineprint;
  mySwipe?: "keep" | "skip" | "shortlist";
  partnerSwipes: ListingDetailPartnerSwipe[];
  searchId: string;
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

function asFeatures(value: unknown): Features | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  return value as Features;
}

function readDetail(rawJson: unknown): ListingDetail | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  return rawJson as ListingDetail;
}

function readAgent(rawJson: unknown): {
  name: string | null;
  email: string | null;
  phone: string | null;
  branchUrl: string | null;
} {
  if (!rawJson || typeof rawJson !== "object") {
    return { name: null, email: null, phone: null, branchUrl: null };
  }
  const obj = rawJson as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const emailCandidate = obj.agentEmail ?? obj.agent_email ?? obj.email;
  return {
    name: str(obj.agentName) ?? str(obj.agent_name),
    email:
      typeof emailCandidate === "string" && emailCandidate.includes("@")
        ? emailCandidate
        : null,
    phone: str(obj.agentPhone) ?? str(obj.agent_phone),
    branchUrl: str(obj.agentBranchUrl),
  };
}

function readFloorplanUrl(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") {
    return null;
  }
  const url = (rawJson as Record<string, unknown>).floorplanUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

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

function asBroadband(value: unknown): ListingDetailBroadband | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const b = value as Record<string, unknown>;
  return {
    technology:
      b.technology === "FTTP" ||
      b.technology === "FTTC" ||
      b.technology === "ADSL"
        ? b.technology
        : null,
    downloadMbps: typeof b.downloadMbps === "number" ? b.downloadMbps : null,
    uploadMbps: typeof b.uploadMbps === "number" ? b.uploadMbps : null,
    fttpAvailable: b.fttpAvailable === true,
  };
}

function asCrime(value: unknown): ListingDetailCrime | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const c = value as Record<string, unknown>;
  const month = typeof c.month === "string" ? c.month : null;
  const total = typeof c.total === "number" ? c.total : null;
  if (!(month && total !== null)) {
    return;
  }
  const byCategory =
    c.byCategory && typeof c.byCategory === "object"
      ? (c.byCategory as Record<string, number>)
      : {};
  const top = Object.entries(byCategory)
    .filter(([, n]) => typeof n === "number")
    .sort(([, a], [, b]) => b - a)[0];
  return {
    month,
    total,
    topCategory: top ? { category: top[0], count: top[1] } : null,
  };
}

function asAmenities(value: unknown): ListingDetailAmenities | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const a = value as Record<string, unknown>;
  const withinMeters = typeof a.withinMeters === "number" ? a.withinMeters : 0;
  const counts =
    a.counts && typeof a.counts === "object"
      ? Object.fromEntries(
          Object.entries(a.counts as Record<string, unknown>).filter(
            ([, v]) => typeof v === "number"
          ) as [string, number][]
        )
      : {};
  if (Object.keys(counts).length === 0) {
    return;
  }
  return { withinMeters, counts };
}

function asFlood(value: unknown): ListingDetailFlood | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const f = value as Record<string, unknown>;
  const rl = f.riskLevel;
  if (
    rl === "very-low" ||
    rl === "low" ||
    rl === "medium" ||
    rl === "high" ||
    rl === "unknown"
  ) {
    return { riskLevel: rl };
  }
  return;
}

/**
 * The cluster's seeded council tax rate, when one is on file. Band D is
 * in pence; we turn it into a whole-pounds estimate for the listing's
 * actual band inside `buildFineprint`.
 */
type CouncilTaxContext = {
  bandDPence: number;
  authorityName: string;
  taxYear: string;
};

/**
 * Expand the cluster's area Band D into all eight bands (A–H) via the
 * fixed statutory ratios, in whole pounds, annual + monthly. Returns
 * null when there's no seeded rate for the authority.
 */
function buildCouncilTax(
  band: string | null,
  councilTax: CouncilTaxContext | null
): ListingDetailCouncilTax | null {
  if (!councilTax) {
    return null;
  }
  const bands: ListingDetailCouncilTaxBand[] = COUNCIL_TAX_BANDS.map((b) => {
    // `b` is always a valid band, so bandAmountPence never returns null here.
    const pence = bandAmountPence(councilTax.bandDPence, b) ?? 0;
    return {
      band: b,
      annualPounds: Math.round(pence / 100),
      monthlyPounds: Math.round(pence / 1200),
    };
  });
  return {
    authority: councilTax.authorityName,
    year: councilTax.taxYear,
    listingBand: normaliseBand(band),
    bands,
  };
}

function buildFineprint(
  headline: typeof listings.$inferSelect,
  councilTax: CouncilTaxContext | null
): ListingDetailFineprint {
  const d = readDetail(headline.rawJson);
  const agent = readAgent(headline.rawJson);
  const councilTaxBand = d?.councilTaxBand ?? headline.councilTaxBand ?? null;
  return {
    deposit: d?.deposit ?? null,
    feesText: d?.feesText ?? null,
    minimumTermMonths: d?.minimumTermMonths ?? null,
    letType: d?.letType ?? null,
    serviceChargeAnnual: d?.serviceChargeAnnual ?? null,
    groundRentAnnual: d?.groundRentAnnual ?? null,
    availableFrom:
      d?.availableFrom ?? headline.availableFrom?.toISOString() ?? null,
    agentName: agent.name,
    agentPhone: agent.phone,
    agentBranchUrl: agent.branchUrl,
    billsIncluded:
      typeof d?.billsIncluded === "boolean" ? d.billsIncluded : null,
    councilTaxBand,
    councilTax: buildCouncilTax(councilTaxBand, councilTax),
    furnished: d?.furnished ?? null,
    sizeSqFt: d?.sizeSqFt ?? headline.sizeSqFt ?? null,
    nearestStations: Array.isArray(d?.nearestStations) ? d.nearestStations : [],
  };
}

// -----------------------------------------------------------------------------
// Server function
// -----------------------------------------------------------------------------

export const getListingDetail = createServerFn({ method: "GET" })
  .inputValidator(getListingDetailSchema)
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 8-step aggregation handler — each step is small and labelled; splitting would obscure the data flow.
  .handler(async ({ data }): Promise<ListingDetailPayload> => {
    const { householdId, memberUserIds, currentUserId } =
      await requireHouseholdScope();
    const db = getDb();

    // Step 1: pull the household's active searches.
    const householdSearches = await db
      .select({ id: searches.id })
      .from(searches)
      .where(eq(searches.householdId, householdId));
    const searchIds = householdSearches.map((s) => s.id);
    if (searchIds.length === 0) {
      throw new Error("not_found");
    }

    // Step 2: load the cluster + listings.
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
      throw new Error("not_found");
    }

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

    // Step 3: dedup portal spread.
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
      const agent = readAgent(l.rawJson);
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

    // Step 4: photos for the headline listing.
    const photoRows = await db
      .select()
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, headlineListing.id))
      .orderBy(listingPhotos.position);

    const photos: ListingDetailPhoto[] = photoRows.map((p) => ({
      url: resolvePhotoUrl(p),
      r2Key: p.r2Key,
      position: p.position,
    }));

    // Step 5: floorplan URL — first available across listings.
    let floorplanUrl: string | null = null;
    for (const l of sortedListings) {
      const u = readFloorplanUrl(l.rawJson);
      if (u) {
        floorplanUrl = u;
        break;
      }
    }

    // Step 6: enrichment — latest prompt version.
    const enrichmentRows = await db
      .select()
      .from(enrichments)
      .where(eq(enrichments.listingId, headlineListing.id))
      .orderBy(desc(enrichments.promptVersion))
      .limit(1);
    const enrichment = enrichmentRows[0];
    const features = asFeatures(enrichment?.features);
    const highlights = Array.isArray(features?.highlights)
      ? features.highlights
      : [];
    const watchouts = Array.isArray(features?.watchouts)
      ? features.watchouts
      : [];
    const summary =
      typeof features?.summary === "string" ? features.summary : null;
    const epc = asEpc(enrichment?.epc);
    const commuteMinutes = asCommuteMinutes(enrichment?.commuteMinutes);
    const broadband = asBroadband(enrichment?.broadband);
    const crime = asCrime(enrichment?.crime);
    const amenities = asAmenities(enrichment?.amenities);
    const flood = asFlood(enrichment?.flood);

    // Step 7: swipe state for every household member.
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

    // Step 8: public records — broadband / crime / amenities / flood
    // from the typed enrichment columns. The legacy postcodes.io
    // crime-area lookup is gone — data.police.uk via `enrich-crime.ts`
    // gives us actual counts.
    const publicRecords: ListingDetailPublicRecords | undefined = (() => {
      const out: ListingDetailPublicRecords = {};
      if (broadband) {
        out.broadband = broadband;
      }
      if (crime) {
        out.crime = crime;
      }
      if (amenities) {
        out.amenities = amenities;
      }
      if (flood) {
        out.flood = flood;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    })();

    // Council tax rate: look up the latest seeded Band D figure for the
    // cluster's billing authority (resolved by `enrich-council-tax`).
    // `buildFineprint` turns it into a per-band, whole-pounds estimate.
    let councilTaxContext: CouncilTaxContext | null = null;
    if (cluster.councilTaxAuthorityCode) {
      const rateRows = await db
        .select({
          bandDPence: councilTaxRates.bandDPence,
          authorityName: councilTaxRates.authorityName,
          taxYear: councilTaxRates.taxYear,
        })
        .from(councilTaxRates)
        .where(eq(councilTaxRates.authorityCode, cluster.councilTaxAuthorityCode))
        .orderBy(desc(councilTaxRates.taxYear))
        .limit(1);
      councilTaxContext = rateRows[0] ?? null;
    }

    const fineprint = buildFineprint(headlineListing, councilTaxContext);

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
      summary,
      highlights,
      watchouts,
      ...(epc ? { epc } : {}),
      ...(commuteMinutes ? { commuteMinutes } : {}),
      ...(publicRecords ? { publicRecords } : {}),
      fineprint,
      ...(mySwipe ? { mySwipe } : {}),
      partnerSwipes,
      searchId: headlineListing.searchId,
      googleMapsApiKey: parsedEnv().GOOGLE_MAPS_API_KEY,
    };
  });
