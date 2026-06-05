/**
 * Per-cluster commute enrichment.
 *
 * Fan-out: `clusterTask.onSuccess` triggers one `enrich-commute` run
 * per newly-created cluster (mirroring `enrich-epc`). For each cluster
 * we:
 *
 *   1. Load the cluster's lat/lng.
 *   2. Pull the parent search's `commuteTargets` (the schema column
 *      already exists; the UI populates it). A cluster's parent search
 *      is the search of any of its listings — for a single-search
 *      household they all match; for the rare multi-search case we use
 *      the first listing's search.
 *   3. For every target, call Google Routes v2 to compute travel time
 *      from the cluster origin to the target lat/lng with the target's
 *      travel mode. TRANSIT requests use a fixed 09:00 Europe/London
 *      arrival time so results are comparable across runs (and across
 *      clusters); future work can promote `arrivalTime` onto the search
 *      config to make this user-tunable.
 *   4. Persist as `enrichments.commute_minutes: Record<label, minutes>`
 *      for every listing in the cluster, using the same UPSERT pattern
 *      as `enrich-epc` so we don't clobber whatever the AI task wrote
 *      into `features`.
 *
 * No-ops gracefully when:
 *   - the cluster has no lat/lng,
 *   - the search has zero commuteTargets,
 *   - the cluster's listings are empty (shouldn't happen post-cluster
 *     but cheap to guard).
 */

import { logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import * as schema from "../../db/schema";
import { mapsServerKey } from "../lib/env";
import {
  computeRoute,
  nextWeekdayAt,
  normaliseTravelMode,
} from "../lib/google-routes";
import { upsertEnrichmentForListings } from "./enrich-helpers";
import { enrichQueue } from "./queues";

export type EnrichCommutePayload = {
  clusterId: string;
};

export type EnrichCommuteOutput = {
  clusterId: string;
  targetsComputed: number;
  listingsTouched: number;
};

type CommuteTarget = {
  label: string;
  lat: number;
  lng: number;
  mode: string;
  maxMinutes?: number;
};

function parseNumeric(value: string | null): number | null {
  if (value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCommuteTarget(entry: unknown): CommuteTarget | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const o = entry as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const lat = typeof o.lat === "number" ? o.lat : Number(o.lat);
  const lng = typeof o.lng === "number" ? o.lng : Number(o.lng);
  const mode = typeof o.mode === "string" ? o.mode : "";
  if (!label || !mode || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    label,
    lat,
    lng,
    mode,
    maxMinutes: typeof o.maxMinutes === "number" ? o.maxMinutes : undefined,
  };
}

/**
 * Filter the JSONB blob from `searches.commuteTargets` down to the
 * subset of well-formed entries we can compute against. Bad rows are
 * skipped rather than thrown — better to enrich the valid targets and
 * surface a warning than to fail the whole cluster.
 */
function readCommuteTargets(raw: unknown): CommuteTarget[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(toCommuteTarget).filter((t): t is CommuteTarget => t !== null);
}

type CommuteContext = {
  clusterLat: number;
  clusterLng: number;
  listingIds: string[];
  targets: CommuteTarget[];
};

/**
 * Gather everything the run body needs from the DB (cluster lat/lng,
 * listings in the cluster, parent search's commute targets) and return
 * a single context bundle. Returns `null` when any precondition fails —
 * the caller logs a tailored skip reason on the way out.
 */
async function loadCommuteContext(
  db: ReturnType<typeof getDb>,
  clusterId: string,
  logSkip: (reason: string, extra?: Record<string, unknown>) => void
): Promise<CommuteContext | null> {
  const cluster = await db.query.propertyClusters.findFirst({
    where: (c, { eq: eqOp }) => eqOp(c.id, clusterId),
  });
  if (!cluster) {
    throw new Error(`enrich-commute: cluster ${clusterId} not found`);
  }
  const clusterLat = parseNumeric(cluster.lat);
  const clusterLng = parseNumeric(cluster.lng);
  if (clusterLat === null || clusterLng === null) {
    logSkip("cluster has no lat/lng");
    return null;
  }

  const listings = await db
    .select({ id: schema.listings.id, searchId: schema.listings.searchId })
    .from(schema.listings)
    .where(eq(schema.listings.clusterId, clusterId));
  if (listings.length === 0) {
    logSkip("cluster has no listings");
    return null;
  }
  const firstSearchId = listings[0]?.searchId;
  if (!firstSearchId) {
    logSkip("first listing has no searchId");
    return null;
  }
  const search = await db.query.searches.findFirst({
    where: (s, { eq: eqOp }) => eqOp(s.id, firstSearchId),
  });
  if (!search) {
    logSkip("parent search not found", { searchId: firstSearchId });
    return null;
  }
  const targets = readCommuteTargets(search.commuteTargets);
  if (targets.length === 0) {
    logSkip("search has no commuteTargets", { searchId: firstSearchId });
    return null;
  }

  return {
    clusterLat,
    clusterLng,
    listingIds: listings.map((l) => l.id),
    targets,
  };
}

export const enrichCommuteTask = task({
  id: "enrich-commute",
  queue: enrichQueue,
  maxDuration: 120,

  run: async (payload: EnrichCommutePayload): Promise<EnrichCommuteOutput> => {
    const db = getDb();
    const { clusterId } = payload;
    const GOOGLE_MAPS_API_KEY = mapsServerKey();
    const empty = { clusterId, targetsComputed: 0, listingsTouched: 0 };

    const ctx = await loadCommuteContext(db, clusterId, (reason, extra) => {
      logger.warn(`enrich-commute: ${reason}, skipping`, {
        clusterId,
        ...(extra ?? {}),
      });
    });
    if (!ctx) {
      return empty;
    }

    // 09:00 next London weekday — see file-header comment for the
    // arrivalTime story.
    const arrivalTime = nextWeekdayAt(9, Date.now());

    const commuteMinutes: Record<string, number> = {};
    for (const target of ctx.targets) {
      try {
        const result = await computeRoute({
          apiKey: GOOGLE_MAPS_API_KEY,
          origin: { lat: ctx.clusterLat, lng: ctx.clusterLng },
          destination: { lat: target.lat, lng: target.lng },
          travelMode: normaliseTravelMode(target.mode),
          arrivalTime,
        });
        commuteMinutes[target.label] = Math.round(result.durationSeconds / 60);
      } catch (err) {
        // One bad target shouldn't lose the rest of the targets for
        // this cluster — log and continue.
        logger.warn("enrich-commute: target failed", {
          clusterId,
          label: target.label,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (Object.keys(commuteMinutes).length === 0) {
      logger.warn("enrich-commute: every target failed, nothing to write", {
        clusterId,
      });
      return empty;
    }

    const touched = await upsertEnrichmentForListings(db, ctx.listingIds, {
      commuteMinutes,
    });

    logger.log("enrich-commute: done", {
      clusterId,
      targets: Object.keys(commuteMinutes),
      listingsTouched: touched,
    });

    return {
      clusterId,
      targetsComputed: Object.keys(commuteMinutes).length,
      listingsTouched: touched,
    };
  },
});
