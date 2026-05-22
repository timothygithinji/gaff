/**
 * Cluster matching helpers.
 *
 * Cross-portal dedupe pipeline:
 *
 *   normaliseAddress(raw)  →  property_clusters lookup  →  create-if-missing
 *                                                  ↓
 *                                       listings.cluster_id = ...
 *
 * The actual address normalisation lives in `./normalise.ts`. This module
 * is the find-or-create wrapper plus the listing-link UPDATE: pure database
 * mechanics, no Trigger.dev imports, no Zyte, no parsers — so the Trigger
 * task layer stays thin and the heavy logic stays unit-testable against a
 * fake db.
 *
 * Race-safety note: `property_clusters.normalised_address` carries a unique
 * index, and two concurrent scrape-portal runs can absolutely race on the
 * same building. We resolve that with `ON CONFLICT (normalised_address)
 * DO NOTHING RETURNING id` followed by a plain SELECT fallback — if the
 * insert won we get the new id; if a parallel insert won we get nothing
 * back and re-read the row by its normalised key. Either way the caller
 * gets one stable `clusterId` and a `created` flag they can use to gate
 * downstream enrichment triggers.
 */

import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { listings, propertyClusters } from "../../../db/schema";
import { normaliseAddress } from "./normalise";

/**
 * Minimal db handle shape — anything the helpers in this module need.
 * Typed structurally rather than against the full drizzle Database type
 * so unit tests can pass a fake adapter without pulling in neon-http.
 */
export type ClusterMatchDb = {
  insert: (table: typeof propertyClusters) => {
    values: (vals: {
      id: string;
      normalisedAddress: string;
      postcode: string | null;
      lat: string | null;
      lng: string | null;
    }) => {
      onConflictDoNothing: (opts: {
        target: typeof propertyClusters.normalisedAddress;
      }) => {
        returning: () => Promise<{ id: string }[]>;
      };
    };
  };
  select: (cols: { id: typeof propertyClusters.id }) => {
    from: (table: typeof propertyClusters) => {
      where: (predicate: ReturnType<typeof eq>) => Promise<{ id: string }[]>;
    };
  };
  update: (table: typeof listings) => {
    set: (vals: { clusterId: string }) => {
      where: (predicate: ReturnType<typeof sql>) => Promise<unknown>;
    };
  };
};

export type ListingForCluster = {
  addressRaw: string;
  postcode: string | null;
  lat: string | null;
  lng: string | null;
};

export type FindOrCreateResult = {
  clusterId: string;
  created: boolean;
};

/**
 * Find the cluster for a listing's address, or create a new one if it
 * doesn't exist yet.
 *
 * Returns the cluster id plus a `created` flag — callers use the flag to
 * decide whether to fire downstream enrichment triggers (we only run
 * EPC + AI enrichment once per cluster, not once per listing).
 *
 * Steps:
 *
 *   1. Compute the normalised key from the raw address.
 *   2. Attempt to INSERT a new property_clusters row, swallowing the
 *      unique-index violation with `ON CONFLICT DO NOTHING RETURNING id`.
 *      If we get a row back, we won the race and `created = true`.
 *   3. Otherwise, SELECT the existing row by its normalised key and
 *      return `created = false`. This is the lookup arm for both the
 *      "already exists from a previous run" case and the "a parallel
 *      insert beat us by milliseconds" case.
 *
 * Throws if the SELECT fallback also returns nothing — that only happens
 * if the row was deleted between the failed insert and the select, which
 * shouldn't happen during normal scraping. Surfacing it loudly is better
 * than silently re-inserting and risking a duplicate.
 */
export async function findOrCreateCluster(
  db: ClusterMatchDb,
  listing: ListingForCluster
): Promise<FindOrCreateResult> {
  const normalised = normaliseAddress(listing.addressRaw);

  const inserted = await db
    .insert(propertyClusters)
    .values({
      id: nanoid(),
      normalisedAddress: normalised,
      postcode: listing.postcode,
      lat: listing.lat,
      lng: listing.lng,
    })
    .onConflictDoNothing({ target: propertyClusters.normalisedAddress })
    .returning();

  if (inserted.length > 0) {
    const row = inserted[0];
    if (!row) {
      // Belt-and-braces: noUncheckedIndexedAccess gives us `row | undefined`,
      // and we've already gated on `length > 0`.
      throw new Error(
        "findOrCreateCluster: returning() said length>0 but row was undefined"
      );
    }
    return { clusterId: row.id, created: true };
  }

  // INSERT lost the conflict race (either to a previous run or to a
  // parallel scrape-portal). Look up the existing cluster by its
  // normalised key — that's the column the unique index is on.
  const existing = await db
    .select({ id: propertyClusters.id })
    .from(propertyClusters)
    .where(eq(propertyClusters.normalisedAddress, normalised));

  if (existing.length === 0) {
    throw new Error(
      `findOrCreateCluster: insert conflict but no existing row for normalised address ${normalised}`
    );
  }

  const row = existing[0];
  if (!row) {
    throw new Error(
      "findOrCreateCluster: select returned length>0 but row was undefined"
    );
  }

  return { clusterId: row.id, created: false };
}

/**
 * UPDATE listings.cluster_id. Idempotent: the predicate checks both that
 * the listing matches and that its cluster_id is either NULL or already
 * the same value, so re-running the task doesn't toggle rows that were
 * already linked.
 *
 * We don't UPDATE rows whose cluster_id already points at a DIFFERENT
 * cluster — that would only happen if an address normalisation rule
 * changed, and silently re-pointing would inherit one cluster's swipes
 * into another. PR 4 doesn't change normalisation rules; if it ever does
 * we'll handle the migration explicitly.
 */
export async function linkListingToCluster(
  db: ClusterMatchDb,
  listingId: string,
  clusterId: string
): Promise<void> {
  await db
    .update(listings)
    .set({ clusterId })
    .where(
      sql`${listings.id} = ${listingId} AND (${listings.clusterId} IS NULL OR ${listings.clusterId} = ${clusterId})`
    );
}
