import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  type ShortlistPipeline,
  listingPhotos,
  listings,
  shortlistPipeline,
  user,
  vMutualMatches,
} from "../../../db/schema";
import {
  findOrCreateCluster,
  linkListingToCluster,
} from "../../lib/cluster/match";
import { parseListingUrl } from "../../lib/listing-url";
import {
  parseOpenrentDetail,
  parseRightmoveDetail,
  parseZooplaDetail,
} from "../../lib/parsers";
import type { ListingDetail, Portal } from "../../lib/parsers/types";
import {
  PIPELINE_ARCHIVED_REASONS,
  PIPELINE_STATUSES,
  type PipelineArchivedReason,
  type PipelineStatus,
} from "../../lib/pipeline-status";
import { zyteFetch } from "../../lib/zyte";
import type { MutualMatch } from "./shortlist";
import {
  hydrateClusterSummary,
  requireHouseholdScope,
} from "./shortlist-helpers.server";
/**
 * Shortlist pipeline server functions.
 *
 * Powers the kanban on `/shortlist`. A household's "Shortlisted"
 * column is derived from `v_mutual_matches` (every member has kept-or-
 * shortlisted a cluster). Stages beyond that (Contacted, Viewing
 * booked, Offer made, Archived) require an explicit row in
 * `shortlist_pipeline`. The list endpoint merges both sources so the
 * kanban always reflects:
 *
 *   - every mutual match that's NOT in `shortlist_pipeline` → Shortlisted
 *   - every row in `shortlist_pipeline` → the row's status
 *
 * Writes go through `setPipelineStatus`; the first transition out of
 * Shortlisted creates the row, subsequent transitions update it.
 */
import { tasks } from "./trigger.server";

// -----------------------------------------------------------------------------
// Input schemas
// -----------------------------------------------------------------------------

const setPipelineStatusSchema = z
  .object({
    clusterId: z.string().trim().min(1),
    status: z.enum(PIPELINE_STATUSES),
    archivedReason: z.enum(PIPELINE_ARCHIVED_REASONS).optional(),
  })
  .refine((v) => v.status === "archived" || v.archivedReason === undefined, {
    message: "archivedReason is only valid when status='archived'",
    path: ["archivedReason"],
  });

const setPipelineDetailsSchema = z.object({
  clusterId: z.string().trim().min(1),
  /** Free-text notes; empty string clears them (stored as NULL). */
  notes: z.string().max(4000),
   /**
    * Viewing date+time as a UTC ISO string (zone-explicit, `…Z`), or null to
    * clear. The client converts the `datetime-local` wall-clock to UTC before
    * sending — see `datetimeLocalToISO` — so `new Date()` below is unambiguous.
    * Must NOT be a bare `YYYY-MM-DDTHH:mm`: that parses as UTC server-side and
    * shifts the viewing by the user's timezone offset on every save.
    * Kept a string on the wire so it survives the server-fn round-trip without
    * serializer surprises.
    */
  viewingDate: z.string().min(1).nullable(),
  /** Viewing length in minutes (drives the calendar event's end). */
  viewingDurationMinutes: z.number().int().min(5).max(480).nullable(),
});

// -----------------------------------------------------------------------------
// Wire types
// -----------------------------------------------------------------------------

export type PipelineLastMovedBy = {
  userId: string;
  name: string;
} | null;

export type PipelineCard = MutualMatch & {
  status: PipelineStatus;
  /**
   * When the card most recently entered its current status. Falls back
   * to `matchedAt` (the mutual-match date) for cards still in the
   * derived "shortlisted" state — there's no `shortlist_pipeline` row
   * to read.
   */
  lastMovedAt: Date;
  lastMovedBy: PipelineLastMovedBy;
  notes: string | null;
  /** Scheduled viewing (date + time), or null if none booked yet. */
  viewingDate: Date | null;
  /** Viewing length in minutes, or null. */
  viewingDurationMinutes: number | null;
  archivedReason: PipelineArchivedReason | null;
};

export type PipelineColumns = Record<PipelineStatus, PipelineCard[]>;

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

/** Default column order: most-recently-moved first, id as a stable
 * tie-break so the order is deterministic across refreshes. */
function byRecency(a: PipelineCard, b: PipelineCard): number {
  const dt = b.lastMovedAt.getTime() - a.lastMovedAt.getTime();
  return dt !== 0 ? dt : a.clusterId.localeCompare(b.clusterId);
}

/** Viewing-booked order: soonest viewing first, undated cards last,
 * then the usual recency tie-break. */
function byViewingDate(a: PipelineCard, b: PipelineCard): number {
  const av = a.viewingDate?.getTime() ?? null;
  const bv = b.viewingDate?.getTime() ?? null;
  if (av === null && bv === null) {
    return byRecency(a, b);
  }
  if (av === null) {
    return 1;
  }
  if (bv === null) {
    return -1;
  }
  return av !== bv ? av - bv : byRecency(a, b);
}

export const listPipeline = createServerFn({ method: "GET" }).handler(
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: merges the mutual-match + pipeline-row sources, hydrates each cluster, and buckets into columns in one linear pass — splitting it would scatter the column-assembly logic across helpers.
  async (): Promise<PipelineColumns> => {
    const { householdId, memberUserIds } = await requireHouseholdScope();
    const db = getDb();

    // Pull every mutual match for the household + every explicit
    // pipeline row in one pair of queries. We merge in JS — the row set
    // is bounded by the household's shortlisted volume (low double-
    // digit clusters in practice).
    const [mutualRows, pipelineRows] = await db.batch([
      db
        .select({
          clusterId: vMutualMatches.clusterId,
          searchId: vMutualMatches.searchId,
          matchedAt: vMutualMatches.matchedAt,
        })
        .from(vMutualMatches)
        .where(eq(vMutualMatches.householdId, householdId))
        .orderBy(desc(vMutualMatches.matchedAt)),
      db
        .select({
          row: shortlistPipeline,
          mover: { userId: user.id, name: user.name },
        })
        .from(shortlistPipeline)
        .leftJoin(user, eq(user.id, shortlistPipeline.lastMovedByUserId))
        .where(eq(shortlistPipeline.householdId, householdId)),
    ]);

    const pipelineByCluster = new Map<
      string,
      { row: ShortlistPipeline; mover: { userId: string; name: string } | null }
    >();
    for (const p of pipelineRows) {
      pipelineByCluster.set(p.row.clusterId, {
        row: p.row,
        mover: p.mover ?? null,
      });
    }

    // Hydrate every row in parallel. We hit hydrateClusterSummary for
    // both mutual matches (with their matchedAt) and any pipeline rows
    // that aren't backed by a mutual match anymore — e.g. a household
    // contacted an agent, then a member changed their swipe. The row
    // stays in the pipeline (durable household decision) until they
    // archive it.
    const seen = new Set<string>();
    const summaries: Array<MutualMatch | null> = [];
    const meta: Array<{
      clusterId: string;
      searchId: string;
      matchedAt: Date;
    }> = [];

    for (const m of mutualRows) {
      seen.add(m.clusterId);
      meta.push(m);
      summaries.push(
        await hydrateClusterSummary(db, {
          clusterId: m.clusterId,
          searchId: m.searchId,
          matchedAt: m.matchedAt,
          householdMemberUserIds: memberUserIds,
        })
      );
    }
    for (const [clusterId, p] of pipelineByCluster) {
      if (seen.has(clusterId)) {
        continue;
      }
      // No mutual match → use lastMovedAt as the "entered" timestamp so
      // the card still has a sortable date.
      meta.push({
        clusterId,
        searchId: "",
        matchedAt: p.row.lastMovedAt,
      });
      summaries.push(
        await hydrateClusterSummary(db, {
          clusterId,
          searchId: "",
          matchedAt: p.row.lastMovedAt,
          householdMemberUserIds: memberUserIds,
        })
      );
    }

    const columns: PipelineColumns = {
      shortlisted: [],
      contacted: [],
      viewing_booked: [],
      offer_made: [],
      archived: [],
    };

    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      const m = meta[i];
      if (!(summary && m)) {
        continue;
      }
      const pipeline = pipelineByCluster.get(m.clusterId);
      const card: PipelineCard = {
        ...summary,
        status: pipeline?.row.status ?? "shortlisted",
        lastMovedAt: pipeline?.row.lastMovedAt ?? m.matchedAt,
        lastMovedBy: pipeline?.mover ?? null,
        notes: pipeline?.row.notes ?? null,
        viewingDate: pipeline?.row.viewingDate ?? null,
        viewingDurationMinutes: pipeline?.row.viewingDurationMinutes ?? null,
        archivedReason: pipeline?.row.archivedReason ?? null,
      };
      columns[card.status].push(card);
    }

    // Sort each column: most-recently-moved first (stable id tie-break).
    // Exception: "Viewing booked" reads as a schedule, so it sorts by the
    // viewing date — soonest upcoming at the top, undated cards last.
    for (const status of PIPELINE_STATUSES) {
      columns[status].sort(
        status === "viewing_booked" ? byViewingDate : byRecency
      );
    }

    return columns;
  }
);

// -----------------------------------------------------------------------------
// Writes
// -----------------------------------------------------------------------------

export const setPipelineStatus = createServerFn({ method: "POST" })
  .inputValidator(setPipelineStatusSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { householdId, currentUserId } = await requireHouseholdScope();
    const db = getDb();

    // Authz: the cluster must already be part of the household's
    // pipeline (either via mutual match OR via an existing row). We
    // don't let a caller move a cluster the household never agreed on.
    const [mutualMatch, existing] = await db.batch([
      db
        .select({ clusterId: vMutualMatches.clusterId })
        .from(vMutualMatches)
        .where(
          and(
            eq(vMutualMatches.householdId, householdId),
            eq(vMutualMatches.clusterId, data.clusterId)
          )
        )
        .limit(1),
      db
        .select({ id: shortlistPipeline.id })
        .from(shortlistPipeline)
        .where(
          and(
            eq(shortlistPipeline.householdId, householdId),
            eq(shortlistPipeline.clusterId, data.clusterId)
          )
        )
        .limit(1),
    ]);

    if (mutualMatch.length === 0 && existing.length === 0) {
      throw new Error("cluster_not_in_pipeline");
    }

    const now = new Date();
    const archivedReason =
      data.status === "archived" ? (data.archivedReason ?? "other") : null;

    await db
      .insert(shortlistPipeline)
      .values({
        id: nanoid(),
        householdId,
        clusterId: data.clusterId,
        status: data.status,
        archivedReason,
        lastMovedAt: now,
        lastMovedByUserId: currentUserId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [shortlistPipeline.householdId, shortlistPipeline.clusterId],
        set: {
          status: data.status,
          archivedReason,
          lastMovedAt: now,
          lastMovedByUserId: currentUserId,
          updatedAt: now,
        },
      });

    return { ok: true };
  });

/**
 * Set the household's notes + viewing date for a cluster.
 *
 * Unlike {@link setPipelineStatus}, this never touches `status` or the
 * move-audit columns — editing notes isn't a stage move, so it mustn't
 * reorder the board or rewrite "moved 2 days ago by Alice". A card still
 * in the derived "shortlisted" state has no row yet; the first edit
 * creates one at `shortlisted` (a no-op status-wise), seeding the audit
 * columns from this edit since there's no prior move to preserve.
 */
export const setPipelineDetails = createServerFn({ method: "POST" })
  .inputValidator(setPipelineDetailsSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { householdId, currentUserId } = await requireHouseholdScope();
    const db = getDb();

    // Same authz as a move: the cluster must already be in the household's
    // pipeline (mutual match OR an existing row) before we'll annotate it.
    const [mutualMatch, existing] = await db.batch([
      db
        .select({ clusterId: vMutualMatches.clusterId })
        .from(vMutualMatches)
        .where(
          and(
            eq(vMutualMatches.householdId, householdId),
            eq(vMutualMatches.clusterId, data.clusterId)
          )
        )
        .limit(1),
      db
        .select({ id: shortlistPipeline.id })
        .from(shortlistPipeline)
        .where(
          and(
            eq(shortlistPipeline.householdId, householdId),
            eq(shortlistPipeline.clusterId, data.clusterId)
          )
        )
        .limit(1),
    ]);

    if (mutualMatch.length === 0 && existing.length === 0) {
      throw new Error("cluster_not_in_pipeline");
    }

    const trimmedNotes = data.notes.trim();
    const notes = trimmedNotes.length > 0 ? trimmedNotes : null;
    const viewingDate = data.viewingDate ? new Date(data.viewingDate) : null;
    if (viewingDate && Number.isNaN(viewingDate.getTime())) {
      throw new Error("invalid_viewing_date");
    }
    // Duration only means something with a date; clear it otherwise.
    const viewingDurationMinutes = viewingDate
      ? data.viewingDurationMinutes
      : null;

    const now = new Date();
    await db
      .insert(shortlistPipeline)
      .values({
        id: nanoid(),
        householdId,
        clusterId: data.clusterId,
        status: "shortlisted",
        notes,
        viewingDate,
        viewingDurationMinutes,
        lastMovedAt: now,
        lastMovedByUserId: currentUserId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [shortlistPipeline.householdId, shortlistPipeline.clusterId],
        // Only the annotation columns — leave status + move-audit intact.
        set: { notes, viewingDate, viewingDurationMinutes, updatedAt: now },
      });

    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Add by URL
// -----------------------------------------------------------------------------

function parsePortalDetail(portal: Portal, html: string): ListingDetail {
  if (portal === "rightmove") {
    return parseRightmoveDetail(html);
  }
  if (portal === "zoopla") {
    return parseZooplaDetail(html);
  }
  return parseOpenrentDetail(html);
}

/** Cluster enrichment fan-out, fired by string ID so the Worker bundle
 * doesn't pull in the Trigger task modules. Mirrors `cluster.ts` onSuccess.
 * Best-effort — the pipeline card already exists by the time these run. */
async function fireClusterEnrichment(clusterId: string): Promise<void> {
  const payload = { clusterId };
  await Promise.all([
    tasks.trigger("enrich-epc", payload),
    tasks.trigger("enrich-commute", payload),
    tasks.trigger("enrich-amenities", payload),
    tasks.trigger("enrich-broadband", payload),
    tasks.trigger("enrich-council-tax", payload),
    tasks.trigger("enrich-station-routes", payload),
    tasks.trigger("enrich-nearby-transit", payload),
  ]);
}

const addByUrlSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

export type AddListingByUrlResult = {
  clusterId: string;
  /** True when the listing already existed (no scrape was needed). */
  deduped: boolean;
};

/**
 * Add a property to the household's pipeline from a pasted listing URL.
 *
 *   1. Parse the URL → portal + listing ID (rejects non-listing URLs).
 *   2. If we already have that listing, reuse its cluster (no scrape) —
 *      "if it's not found in search" is the only path that fetches.
 *   3. Otherwise scrape the detail page (synchronously, via Zyte),
 *      create the listing (searchId NULL — it belongs to no search),
 *      cluster it (dedupes by address), and store its photos.
 *   4. Insert a `shortlisted` pipeline row (idempotent).
 *   5. Fire enrichment for a newly-created cluster + AI/photo-cache for a
 *      newly-scraped listing, async.
 *
 * Lands the card in the Shortlisted column immediately, skipping the
 * swipe/review feed (which only surfaces search-backed listings).
 */
export const addListingByUrl = createServerFn({ method: "POST" })
  .inputValidator(addByUrlSchema)
  .handler(async ({ data }): Promise<AddListingByUrlResult> => {
    const { householdId, currentUserId } = await requireHouseholdScope();
    const db = getDb();

    const parsed = parseListingUrl(data.url);
    if (!parsed) {
      throw new Error("invalid_listing_url");
    }
    const { portal, portalListingId, canonicalUrl } = parsed;

    const existing = await db
      .select({
        id: listings.id,
        clusterId: listings.clusterId,
        addressRaw: listings.addressRaw,
        postcode: listings.postcode,
        lat: listings.lat,
        lng: listings.lng,
      })
      .from(listings)
      .where(
        and(
          eq(listings.portal, portal),
          eq(listings.portalListingId, portalListingId)
        )
      )
      .limit(1);

    let clusterId: string;
    let newCluster = false;
    let scrapedListingId: string | null = null;

    const prior = existing[0];
    if (prior) {
      // Already in the system (from a search or a previous add): reuse its
      // cluster, clustering it now if it never got linked.
      if (prior.clusterId) {
        clusterId = prior.clusterId;
      } else {
        const res = await findOrCreateCluster(db, prior);
        clusterId = res.clusterId;
        newCluster = res.created;
        await linkListingToCluster(db, prior.id, clusterId);
      }
    } else {
      const apiKey = process.env.ZYTE_API_KEY;
      if (!apiKey) {
        throw new Error("scrape_unavailable");
      }
      const res = await zyteFetch({ apiKey, url: canonicalUrl, browserHtml: true });
      const detail = parsePortalDetail(portal, res.html);

      const listingId = nanoid();
      scrapedListingId = listingId;
      const lat = detail.lat != null ? String(detail.lat) : null;
      const lng = detail.lng != null ? String(detail.lng) : null;
      await db.insert(listings).values({
        id: listingId,
        portal,
        portalListingId,
        searchId: null,
        url: canonicalUrl,
        title: detail.title,
        addressRaw: detail.addressRaw,
        postcode: detail.postcode ?? null,
        bedrooms: detail.bedrooms ?? null,
        bathrooms: detail.bathrooms ?? null,
        priceMonthly: detail.priceMonthly ?? null,
        propertyType: detail.propertyType ?? null,
        lat,
        lng,
        sizeSqFt: detail.sizeSqFt ?? null,
        councilTaxBand: detail.councilTaxBand ?? null,
        petsAccepted: detail.tenantPreferences?.petsAccepted ?? null,
        rawJson: detail as unknown as Record<string, unknown>,
      });

      const clusterRes = await findOrCreateCluster(db, {
        addressRaw: detail.addressRaw,
        postcode: detail.postcode ?? null,
        lat,
        lng,
      });
      clusterId = clusterRes.clusterId;
      newCluster = clusterRes.created;
      await linkListingToCluster(db, listingId, clusterId);

      if (detail.photos.length > 0) {
        await db.insert(listingPhotos).values(
          detail.photos.map((url, position) => ({
            id: nanoid(),
            listingId,
            url,
            position,
          }))
        );
      }
    }

    // Add to the pipeline (Shortlisted). Idempotent — re-adding a cluster
    // already in the pipeline is a no-op and never demotes it.
    const now = new Date();
    await db
      .insert(shortlistPipeline)
      .values({
        id: nanoid(),
        householdId,
        clusterId,
        status: "shortlisted",
        lastMovedAt: now,
        lastMovedByUserId: currentUserId,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [shortlistPipeline.householdId, shortlistPipeline.clusterId],
      });

    // Best-effort enrichment — the card is already usable without it.
    try {
      if (newCluster) {
        await fireClusterEnrichment(clusterId);
      }
      if (scrapedListingId) {
        await Promise.all([
          tasks.trigger("enrich-ai", { listingId: scrapedListingId }),
          tasks.trigger("cache-photos", { listingId: scrapedListingId }),
        ]);
      }
    } catch {
      // Enrichment is downstream + retried by its own schedules; never
      // fail the user's add because a trigger call hiccupped.
    }

    return { clusterId, deduped: prior !== undefined };
  });
