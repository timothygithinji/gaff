/**
 * Unit tests for the find-or-create and listing-link helpers.
 *
 * We don't spin up a real Postgres — the goal here is to exercise the
 * race-handling logic against a fake db adapter. The adapter mimics the
 * drizzle chain shape (`insert(...).values(...).onConflictDoNothing(...).
 * returning()`) tightly enough that the helpers can't tell the difference,
 * while letting us choose whether the insert "won" or "lost" the conflict
 * race on a per-test basis.
 */

import { describe, expect, it, vi } from "vitest";
import type { ClusterMatchDb, ListingForCluster } from "./match";
import { findOrCreateCluster, linkListingToCluster } from "./match";

// Top-level so the rejects.toThrow assertion isn't re-compiling the
// regex on every call (biome's useTopLevelRegex rule).
const NO_EXISTING_ROW_RE = /no existing row for normalised address/;

type FakeDbOptions = {
  /** What the insert .returning() promise should resolve to. */
  insertReturns: { id: string }[];
  /** What the lookup select should resolve to (race-loss path). */
  selectReturns?: { id: string }[];
};

/**
 * Build a minimal stub that satisfies `ClusterMatchDb`. Each chainable
 * step records the call so tests can assert what was wired through.
 */
function makeFakeDb(opts: FakeDbOptions) {
  const inserted: Array<{
    values: unknown;
    conflictTarget: unknown;
  }> = [];
  const selected: Array<{ predicate: unknown }> = [];
  const updated: Array<{ set: unknown; predicate: unknown }> = [];

  // The mock returns Promise.resolve(...) (rather than `async () => ...`)
  // because biome's useAwait rule flags async fns that never await — but
  // the production code DOES await these, so they have to be thenable.
  // Promise.resolve avoids both the lint and an unnecessary microtask hop.
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => ({
        onConflictDoNothing: vi.fn((conflictOpts: { target: unknown }) => ({
          returning: vi.fn(() => {
            inserted.push({
              values,
              conflictTarget: conflictOpts.target,
            });
            return Promise.resolve(opts.insertReturns);
          }),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((predicate: unknown) => {
          selected.push({ predicate });
          return Promise.resolve(opts.selectReturns ?? []);
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((setVals: unknown) => ({
        where: vi.fn((predicate: unknown) => {
          updated.push({ set: setVals, predicate });
          return Promise.resolve(undefined);
        }),
      })),
    })),
  } as unknown as ClusterMatchDb;

  return { db, inserted, selected, updated };
}

const SAMPLE: ListingForCluster = {
  addressRaw: "Flat 4, 12 Elm Street, NW3 1AA",
  postcode: "NW3 1AA",
  lat: "51.555000",
  lng: "-0.180000",
};

describe("findOrCreateCluster", () => {
  it("creates a new cluster when none exists (insert wins the race)", async () => {
    const { db, inserted } = makeFakeDb({
      insertReturns: [{ id: "clust_new_123" }],
    });

    const result = await findOrCreateCluster(db, SAMPLE);

    expect(result.created).toBe(true);
    expect(result.clusterId).toBe("clust_new_123");

    // The insert payload should carry the normalised address, not the raw one.
    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    if (!row) {
      throw new Error("expected an insert to have been recorded");
    }
    const vals = row.values as {
      normalisedAddress: string;
      postcode: string | null;
    };
    expect(vals.normalisedAddress).toBe("flat 4 12 elm street nw3 1aa");
    expect(vals.postcode).toBe("NW3 1AA");
  });

  it("returns the existing cluster when the insert loses the conflict race", async () => {
    const { db, selected } = makeFakeDb({
      insertReturns: [], // conflict — empty returning
      selectReturns: [{ id: "clust_pre_existing_456" }],
    });

    const result = await findOrCreateCluster(db, SAMPLE);

    expect(result.created).toBe(false);
    expect(result.clusterId).toBe("clust_pre_existing_456");
    expect(selected).toHaveLength(1); // we DID fall back to a select
  });

  it("throws if the insert conflicted AND the select fallback finds nothing", async () => {
    const { db } = makeFakeDb({
      insertReturns: [],
      selectReturns: [],
    });

    await expect(findOrCreateCluster(db, SAMPLE)).rejects.toThrow(
      NO_EXISTING_ROW_RE
    );
  });

  it("normalises distinct flats in the same building into different keys", async () => {
    // Two separate calls. Each should write a DIFFERENT normalised key
    // through to the insert layer — this is the same anti-collapse invariant
    // we test for in normalise.test.ts, but at the find-or-create boundary.
    const { db: dbA, inserted: insertedA } = makeFakeDb({
      insertReturns: [{ id: "clust_flat1" }],
    });
    const { db: dbB, inserted: insertedB } = makeFakeDb({
      insertReturns: [{ id: "clust_flat2" }],
    });

    await findOrCreateCluster(dbA, {
      ...SAMPLE,
      addressRaw: "Flat 1, 22 Elm Street, NW3 1AA",
    });
    await findOrCreateCluster(dbB, {
      ...SAMPLE,
      addressRaw: "Flat 2, 22 Elm Street, NW3 1AA",
    });

    const rowA = insertedA[0];
    const rowB = insertedB[0];
    if (!rowA || !rowB) {
      throw new Error("expected each call to insert exactly one row");
    }
    const keyA = (rowA.values as { normalisedAddress: string })
      .normalisedAddress;
    const keyB = (rowB.values as { normalisedAddress: string })
      .normalisedAddress;
    expect(keyA).not.toBe(keyB);
  });
});

describe("linkListingToCluster", () => {
  it("issues exactly one UPDATE against the listings table", async () => {
    const { db, updated } = makeFakeDb({
      insertReturns: [],
    });

    await linkListingToCluster(db, "listing_abc", "clust_xyz");

    expect(updated).toHaveLength(1);
    const row = updated[0];
    if (!row) {
      throw new Error("expected an update to have been recorded");
    }
    expect(row.set).toMatchObject({ clusterId: "clust_xyz" });
  });
});
