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
 * The "Public records" section now sources broadband, amenities,
 * and flood from the typed `enrichments.broadband / amenities /
 * flood` JSONB columns written by the sibling cluster enrichment tasks.
 * The legacy "AI broadband string" fallback is gone — if the cluster
 * task hasn't run yet, the row renders as "Pending".
 *
 * Authorisation: the cluster must have at least one listing belonging
 * to a search owned by the caller's household. Anything else 404s.
 */
import { createServerFn } from "@tanstack/react-start";
import { tasks } from "@trigger.dev/sdk";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  councilTaxRates,
  enrichments,
  householdMembers,
  listingPhotos,
  listings,
  propertyClusters,
  searches,
  swipes,
  user,
} from "../../../db/schema";
import { filterFeatures } from "../../lib/ai/feature-filter";
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
import {
  type ResolvedEpc,
  parseEnrichmentEpc,
  pickPortalEpcRating,
  resolveEpc,
} from "../../lib/epc";
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
  /** Manual full-address override (see `setClusterAddress`), or null. */
  userAddress: string | null;
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

/**
 * The EPC value shape is owned by `src/lib/epc.ts` (shared with the
 * review card so both surfaces resolve the band identically).
 */
export type ListingDetailEpc = ResolvedEpc;

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
  /**
   * Provenance for the sqft figure (Zoopla `ingested.sizeSource` —
   * e.g. "structured_data"). Lets the UI tag the chip with a
   * confidence cue. Null when no source was published.
   */
  sizeSource: string | null;
  /**
   * True when council tax is exempt for this property (Rightmove
   * `livingCosts.councilTaxExempt`). Surfaced on the Costs row so the
   * household notices the saving.
   */
  councilTaxExempt: boolean | null;
  /**
   * Zoopla's free-text administration-fees / Client Money Protection
   * disclosure. Distinct from `feesText` (Rightmove's equivalent).
   */
  administrationFeesText: string | null;
  nearestStations: NearestStation[];
};

/**
 * Optional "Property facts" block lifted off the Rightmove parser.
 * Renders on the detail page as a small table of statutory disclosures —
 * heating type, parking, flood history, listed-building flag, etc.
 * Whole block is omitted when none of the underlying fields are present.
 */
export type ListingDetailPropertyFacts = {
  materialInfo: {
    heating: string | null;
    parking: string | null;
    garden: string | null;
    electricity: string | null;
    water: string | null;
    sewerage: string | null;
    accessibility: string | null;
  } | null;
  floodDisclosure: {
    floodedInLastFiveYears: boolean | null;
    floodDefences: boolean | null;
    floodSources: string[];
  } | null;
  listedBuilding: boolean | null;
};

/**
 * Extras off the agent customer record — Rightmove only today. The
 * `descriptionHtml` is the agent's own copy; callers must sanitize
 * before rendering. `brochureUrl` is a CTA-grade direct link to the
 * letting brochure PDF.
 */
export type ListingDetailAgentExtras = {
  descriptionHtml: string | null;
  logoUrl: string | null;
  affiliations: string[];
  brochureUrl: string | null;
};

export type ListingDetailBroadband = {
  technology: "FTTP" | "FTTC" | "ADSL" | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  fttpAvailable: boolean;
};

/**
 * One nearest-station row with Google-Routes-computed travel times.
 * `walkMinutes` / `transitMinutes` are independently nullable — a
 * station might have a walking estimate but no transit option, or
 * vice versa.
 */
export type ListingDetailStationRoute = {
  name: string;
  walkMinutes: number | null;
  transitMinutes: number | null;
  /** Straight-line distance from the listing, in miles (from Rightmove). */
  distanceMiles?: number | null;
};

export type ListingDetailTransitKind = "tube" | "rail" | "tram" | "bus";

export type ListingDetailPlaceCategory =
  | "transport"
  | "park"
  | "shop"
  | "gp"
  | "restaurant";

export type ListingDetailTransitMode =
  | "tube"
  | "overground"
  | "elizabeth-line"
  | "dlr"
  | "tram"
  | "national-rail";

/**
 * One place within ~1 mile of the cluster, from the
 * `enrich-nearby-transit` Google Places sweep. Carries coordinates so
 * the detail map can plot it and draw an on-demand walk/transit route to
 * it when the user taps its chip. Distinct from
 * {@link ListingDetailStationRoute} (Rightmove-only, nearest few, with
 * precomputed minutes) — this is the full 1-mile picture, all portals,
 * across transport / parks / shops / GPs / restaurants.
 */
export type ListingDetailNearbyTransit = {
  name: string;
  category: ListingDetailPlaceCategory;
  /** Transit sub-type (transport only); null otherwise. */
  kind: ListingDetailTransitKind | null;
  /**
   * TfL modes serving a station (line roundels) — e.g. ["tube"] or
   * ["national-rail","overground"]. Absent for buses / non-stations / and
   * stations outside TfL coverage.
   */
  modes?: ListingDetailTransitMode[];
  lat: number;
  lng: number;
  distanceMiles: number;
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
  amenities?: ListingDetailAmenities;
  flood?: ListingDetailFlood;
};

export type ListingDetailPartnerSwipe = {
  memberId: string;
  userId: string;
  name: string;
  outcome: "keep" | "skip" | "shortlist" | null;
  /** ISO timestamp of their swipe, or null if they haven't swiped. */
  swipedAt: string | null;
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
  /**
   * Realistic walking + transit minutes to each of the cluster's
   * nearest stations, computed at enrichment time. Omitted when the
   * cluster has no Rightmove-sourced nearestStations to anchor on, or
   * when `enrich-station-routes` hasn't run yet.
   */
  stationRoutes?: ListingDetailStationRoute[];
  /**
   * Every public-transport stop within ~1 mile of the cluster (tube /
   * rail / tram / bus), with coordinates, from the Google Places sweep.
   * Drives the interactive "Where it sits" map — independent of the
   * search's commute criteria. Omitted until `enrich-nearby-transit`
   * has run.
   */
  nearbyTransit?: ListingDetailNearbyTransit[];
  publicRecords?: ListingDetailPublicRecords;
  /**
   * Material Information + flood/listed-building disclosures, when the
   * source portal exposed them (Rightmove today). Omitted when nothing
   * to show — the UI suppresses the whole section in that case.
   */
  propertyFacts?: ListingDetailPropertyFacts;
  /**
   * Agent extras (brochure URL, branch description HTML, logo,
   * affiliations). Omitted when the source portal didn't publish them.
   */
  agentExtras?: ListingDetailAgentExtras;
  fineprint: ListingDetailFineprint;
  mySwipe?: "keep" | "skip" | "shortlist";
  /** ISO timestamp of the current user's swipe, or null if not yet swiped. */
  mySwipeAt: string | null;
  partnerSwipes: ListingDetailPartnerSwipe[];
  searchId: string;
  googleMapsApiKey: string;
  /** logo.dev publishable token for brand logos on nearby chips; undefined when unset. */
  logoToken?: string;
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

/**
 * The listing's council tax band, scanning the whole cluster headline-
 * first. The cheapest headline often lacks a band (OpenRent never
 * publishes one) while a Zoopla/Rightmove sibling in the same cluster
 * does — so we fall through to siblings rather than show "band unknown"
 * when the figure is sitting one row over.
 */
function pickCouncilTaxBand(
  clusterListings: (typeof listings.$inferSelect)[]
): string | null {
  for (const l of clusterListings) {
    const d = readDetail(l.rawJson);
    const band = d?.councilTaxBand ?? l.councilTaxBand ?? null;
    if (band) {
      return band;
    }
  }
  return null;
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

function asStationRoutes(
  value: unknown
): ListingDetailStationRoute[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const out: ListingDetailStationRoute[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name : null;
    if (!name) {
      continue;
    }
    const walk =
      typeof r.walkMinutes === "number" && Number.isFinite(r.walkMinutes)
        ? r.walkMinutes
        : null;
    const transit =
      typeof r.transitMinutes === "number" && Number.isFinite(r.transitMinutes)
        ? r.transitMinutes
        : null;
    if (walk === null && transit === null) {
      continue;
    }
    out.push({ name, walkMinutes: walk, transitMinutes: transit });
  }
  return out.length > 0 ? out : undefined;
}

const TRANSIT_KINDS = new Set(["tube", "rail", "tram", "bus"]);
const PLACE_CATEGORIES = new Set([
  "transport",
  "park",
  "shop",
  "gp",
  "restaurant",
]);
const TRANSIT_MODES = new Set([
  "tube",
  "overground",
  "elizabeth-line",
  "dlr",
  "tram",
  "national-rail",
]);

function asTransitModes(
  value: unknown
): ListingDetailTransitMode[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const out = value.filter(
    (m): m is ListingDetailTransitMode =>
      typeof m === "string" && TRANSIT_MODES.has(m)
  );
  return out.length > 0 ? out : undefined;
}

/**
 * Validate + coerce the `enrichments.nearbyTransit` JSONB blob into the
 * wire type. Drops entries missing a name, a recognised category, or
 * finite coordinates; `kind` is kept only for the transport category.
 * Returns undefined when nothing usable survives so the payload omits the
 * key (and the map falls back to the marker-only view).
 */
function asNearbyTransit(
  value: unknown
): ListingDetailNearbyTransit[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const out: ListingDetailNearbyTransit[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const category = typeof r.category === "string" ? r.category : "";
    const kind = typeof r.kind === "string" ? r.kind : "";
    const lat = typeof r.lat === "number" ? r.lat : Number.NaN;
    const lng = typeof r.lng === "number" ? r.lng : Number.NaN;
    if (
      !name ||
      !PLACE_CATEGORIES.has(category) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue;
    }
    const distance =
      typeof r.distanceMiles === "number" && Number.isFinite(r.distanceMiles)
        ? r.distanceMiles
        : 0;
    const modes = asTransitModes(r.modes);
    out.push({
      name,
      category: category as ListingDetailPlaceCategory,
      kind: TRANSIT_KINDS.has(kind) ? (kind as ListingDetailTransitKind) : null,
      ...(modes ? { modes } : {}),
      lat,
      lng,
      distanceMiles: distance,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Fallback station routes from the listing's raw `nearestStations` (always
 * present on Rightmove), used when `enrich-station-routes` hasn't populated
 * the computed walk/transit times yet. Carries names only (walk/transit
 * `null`) — enough for the map to draw a walking route to the nearest
 * station and for the commute strip to list them — sorted nearest-first.
 */
function stationRoutesFromNearest(
  stations: NearestStation[]
): ListingDetailStationRoute[] | undefined {
  const named = stations.filter((s) => typeof s.name === "string" && s.name);
  if (named.length === 0) {
    return;
  }
  return [...named]
    .sort(
      (a, b) =>
        (a.distanceMiles ?? Number.POSITIVE_INFINITY) -
        (b.distanceMiles ?? Number.POSITIVE_INFINITY)
    )
    .slice(0, 3)
    .map((s) => ({
      name: s.name,
      walkMinutes: null,
      transitMinutes: null,
      distanceMiles: typeof s.distanceMiles === "number" ? s.distanceMiles : null,
    }));
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
  councilTax: CouncilTaxContext | null,
  councilTaxBand: string | null
): ListingDetailFineprint {
  const d = readDetail(headline.rawJson);
  const agent = readAgent(headline.rawJson);
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
    sizeSource: d?.sizeSource ?? null,
    councilTaxExempt:
      typeof d?.councilTaxExempt === "boolean" ? d.councilTaxExempt : null,
    administrationFeesText: d?.administrationFeesText ?? null,
    nearestStations: Array.isArray(d?.nearestStations) ? d.nearestStations : [],
  };
}

/**
 * Lift the Rightmove material-info + flood-disclosure + listed-building
 * block off the listing's rawJson. Returns `null` (not a sparse object)
 * when nothing is present, so the caller can skip rendering the whole
 * section instead of showing an empty card.
 */
function buildPropertyFacts(
  headline: typeof listings.$inferSelect
): ListingDetailPropertyFacts | null {
  const d = readDetail(headline.rawJson);
  if (!d) {
    return null;
  }
  const mi = d.materialInfo;
  const fd = d.floodDisclosure;
  const lb = typeof d.listedBuilding === "boolean" ? d.listedBuilding : null;
  const materialInfo = mi
    ? {
        heating: mi.heating ?? null,
        parking: mi.parking ?? null,
        garden: mi.garden ?? null,
        electricity: mi.electricity ?? null,
        water: mi.water ?? null,
        sewerage: mi.sewerage ?? null,
        accessibility: mi.accessibility ?? null,
      }
    : null;
  const floodDisclosure = fd
    ? {
        floodedInLastFiveYears: fd.floodedInLastFiveYears ?? null,
        floodDefences: fd.floodDefences ?? null,
        floodSources: Array.isArray(fd.floodSources) ? fd.floodSources : [],
      }
    : null;
  if (!(materialInfo || floodDisclosure) && lb === null) {
    return null;
  }
  return { materialInfo, floodDisclosure, listedBuilding: lb };
}

function buildAgentExtras(
  headline: typeof listings.$inferSelect
): ListingDetailAgentExtras | null {
  const d = readDetail(headline.rawJson);
  if (!d) {
    return null;
  }
  const descriptionHtml = d.agentDescriptionHtml ?? null;
  const logoUrl = d.agentLogoUrl ?? null;
  const affiliations = Array.isArray(d.agentAffiliations)
    ? d.agentAffiliations
    : [];
  const brochureUrl = d.brochureUrl ?? null;
  if (
    !(descriptionHtml || logoUrl || brochureUrl) &&
    affiliations.length === 0
  ) {
    return null;
  }
  return { descriptionHtml, logoUrl, affiliations, brochureUrl };
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
    // Pull the persisted features, then strip generic-noise items via
    // the shared filter. Lets the v2.0.0 enrichments that pre-date the
    // tightened prompt benefit immediately — no re-run cost.
    const features = filterFeatures(asFeatures(enrichment?.features), {
      deposit: readDetail(headlineListing.rawJson)?.deposit ?? null,
      priceMonthly: headlineListing.priceMonthly,
    });
    const highlights = Array.isArray(features?.highlights)
      ? features.highlights
      : [];
    const watchouts = Array.isArray(features?.watchouts)
      ? features.watchouts
      : [];
    const summary =
      typeof features?.summary === "string" ? features.summary : null;
    // Prefer the building's own EPC band as published on the listing over
    // the postcode-level estimate the enrichment task derives — see
    // `resolveEpc`. Scans every listing in the cluster for the letter.
    const epc = resolveEpc(
      pickPortalEpcRating(sortedListings),
      parseEnrichmentEpc(enrichment?.epc)
    );
    const commuteMinutes = asCommuteMinutes(enrichment?.commuteMinutes);
    const stationRoutes = asStationRoutes(enrichment?.stationRoutes);
    const nearbyTransit = asNearbyTransit(enrichment?.nearbyTransit);
    const broadband = asBroadband(enrichment?.broadband);
    const amenities = asAmenities(enrichment?.amenities);
    const flood = asFlood(enrichment?.flood);

    // Step 7: swipe state for every household member.
    const swipeRows = await db
      .select({
        userId: swipes.userId,
        outcome: swipes.outcome,
        createdAt: swipes.createdAt,
      })
      .from(swipes)
      .where(
        and(
          eq(swipes.clusterId, data.clusterId),
          inArray(swipes.userId, memberUserIds)
        )
      );
    const swipeByUser = new Map(swipeRows.map((s) => [s.userId, s.outcome]));
    const swipeAtByUser = new Map(
      swipeRows.map((s) => [s.userId, s.createdAt])
    );

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
        swipedAt: swipeAtByUser.get(m.userId)?.toISOString() ?? null,
      }));

    const mySwipe = swipeByUser.get(currentUserId) ?? undefined;
    const mySwipeAt = swipeAtByUser.get(currentUserId)?.toISOString() ?? null;

    // Step 8: public records — broadband / amenities / flood from the
    // typed enrichment columns.
    const publicRecords: ListingDetailPublicRecords | undefined = (() => {
      const out: ListingDetailPublicRecords = {};
      if (broadband) {
        out.broadband = broadband;
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

    const fineprint = buildFineprint(
      headlineListing,
      councilTaxContext,
      pickCouncilTaxBand(sortedListings)
    );
    const propertyFacts = buildPropertyFacts(headlineListing);
    const agentExtras = buildAgentExtras(headlineListing);
    // Prefer the enriched walk/transit routes; fall back to the raw nearest
    // stations so the map + commute strip still work before (or if)
    // `enrich-station-routes` populates the computed times. Either way, merge
    // the straight-line distance (from raw `nearestStations`) onto each route
    // so the chips can show "0.1 mi" even on the enriched path.
    const stationDistanceByName = new Map(
      fineprint.nearestStations
        .filter((s) => typeof s.name === "string" && s.name)
        .map((s) => [
          s.name,
          typeof s.distanceMiles === "number" ? s.distanceMiles : null,
        ])
    );
    const resolvedStationRoutes = (
      stationRoutes ?? stationRoutesFromNearest(fineprint.nearestStations)
    )?.map((r) => ({
      ...r,
      distanceMiles: r.distanceMiles ?? stationDistanceByName.get(r.name) ?? null,
    }));

    return {
      cluster: {
        id: cluster.id,
        normalisedAddress: cluster.normalisedAddress,
        postcode: cluster.postcode,
        lat: cluster.lat,
        lng: cluster.lng,
        userAddress: cluster.userAddress ?? null,
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
      ...(resolvedStationRoutes
        ? { stationRoutes: resolvedStationRoutes }
        : {}),
      ...(nearbyTransit ? { nearbyTransit } : {}),
      ...(publicRecords ? { publicRecords } : {}),
      ...(propertyFacts ? { propertyFacts } : {}),
      ...(agentExtras ? { agentExtras } : {}),
      fineprint,
      ...(mySwipe ? { mySwipe } : {}),
      mySwipeAt,
      partnerSwipes,
      searchId: headlineListing.searchId ?? "",
      googleMapsApiKey: parsedEnv().GOOGLE_MAPS_API_KEY,
      ...(parsedEnv().LOGODEV_TOKEN
        ? { logoToken: parsedEnv().LOGODEV_TOKEN }
        : {}),
    };
  });

const setClusterAddressSchema = z.object({
  clusterId: z.string().trim().min(1),
  // The full address the user pinned from the photos + Google Maps. An
  // empty string clears the override (back to the scraped address).
  address: z.string().trim().max(300),
});

/**
 * Manually set a building's full address so EPC can resolve the exact
 * certificate instead of a postcode-level estimate (see `enrich-epc`).
 * The portals usually withhold the door number; the user reads it off the
 * listing photos against Google Maps and pins it here. Writes the override
 * onto the cluster and re-fires `enrich-epc` to re-resolve with it.
 *
 * Authz: the cluster must have a listing in one of the caller's
 * household's searches — you can only correct a building you can see.
 */
export const setClusterAddress = createServerFn({ method: "POST" })
  .inputValidator(setClusterAddressSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { householdId } = await requireHouseholdScope();
    const db = getDb();

    const owned = await db
      .select({ id: listings.id })
      .from(listings)
      .innerJoin(searches, eq(listings.searchId, searches.id))
      .where(
        and(
          eq(listings.clusterId, data.clusterId),
          eq(searches.householdId, householdId)
        )
      )
      .limit(1);
    if (owned.length === 0) {
      throw new Error("cluster_not_found");
    }

    const userAddress = data.address.length > 0 ? data.address : null;
    await db
      .update(propertyClusters)
      .set({ userAddress })
      .where(eq(propertyClusters.id, data.clusterId));

    // Re-resolve EPC with the corrected address. Fire-and-forget — the
    // listing-detail query is invalidated client-side and will pick up the
    // refreshed enrichment on its next read.
    await tasks.trigger("enrich-epc", { clusterId: data.clusterId });

    return { ok: true };
  });
