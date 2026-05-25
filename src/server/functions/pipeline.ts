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
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  type ShortlistPipeline,
  shortlistPipeline,
  user,
  vMutualMatches,
} from "../../../db/schema";
import {
  PIPELINE_ARCHIVED_REASONS,
  PIPELINE_STATUSES,
  type PipelineArchivedReason,
  type PipelineStatus,
} from "../../lib/pipeline-status";
import type { MutualMatch } from "./shortlist";
import {
  hydrateClusterSummary,
  requireHouseholdScope,
} from "./shortlist-helpers.server";

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

const setPipelineNotesSchema = z.object({
  clusterId: z.string().trim().min(1),
  notes: z.string().max(2000),
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
  archivedReason: PipelineArchivedReason | null;
};

export type PipelineColumns = Record<PipelineStatus, PipelineCard[]>;

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export const listPipeline = createServerFn({ method: "GET" }).handler(
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: merges the mutual-match + pipeline-row sources, hydrates each cluster, and buckets into columns in one linear pass — splitting it would scatter the column-assembly logic across helpers.
  async (): Promise<PipelineColumns> => {
    const { householdId, memberUserIds } = await requireHouseholdScope();
    const db = getDb();

    // Pull every mutual match for the household + every explicit
    // pipeline row in one pair of queries. We merge in JS — the row set
    // is bounded by the household's shortlisted volume (low double-
    // digit clusters in practice).
    const [mutualRows, pipelineRows] = await Promise.all([
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
        archivedReason: pipeline?.row.archivedReason ?? null,
      };
      columns[card.status].push(card);
    }

    // Sort each column: most-recently-moved first. Stable secondary
    // sort by clusterId keeps the order deterministic across refreshes.
    for (const status of PIPELINE_STATUSES) {
      columns[status].sort((a, b) => {
        const dt = b.lastMovedAt.getTime() - a.lastMovedAt.getTime();
        if (dt !== 0) {
          return dt;
        }
        return a.clusterId.localeCompare(b.clusterId);
      });
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
    const [mutualMatch, existing] = await Promise.all([
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

export const setPipelineNotes = createServerFn({ method: "POST" })
  .inputValidator(setPipelineNotesSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { householdId, currentUserId } = await requireHouseholdScope();
    const db = getDb();

    // Notes on a card require the card to already exist in the
    // pipeline. We don't auto-promote a Shortlisted (derived) card just
    // to attach notes — a status move comes first.
    const existing = await db
      .select({ id: shortlistPipeline.id })
      .from(shortlistPipeline)
      .where(
        and(
          eq(shortlistPipeline.householdId, householdId),
          eq(shortlistPipeline.clusterId, data.clusterId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new Error("card_not_in_pipeline");
    }

    const now = new Date();
    await db
      .update(shortlistPipeline)
      .set({
        notes: data.notes,
        lastMovedByUserId: currentUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(shortlistPipeline.householdId, householdId),
          eq(shortlistPipeline.clusterId, data.clusterId)
        )
      );

    return { ok: true };
  });

// Re-export for convenience — UI callers can pull every pipeline
// public type from a single module.
export type { ShortlistMember } from "./shortlist";
