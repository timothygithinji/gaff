#!/usr/bin/env bun
/**
 * One-shot smoke-test seed for the `/admin` dashboard.
 *
 * Inserts a couple of fake scrape_runs + ai_runs rows attached to the
 * first search in the caller's branch DB so the metric cards + runs
 * table render non-empty during PR 9.5 verification.
 *
 * Usage (the npm script wires DATABASE_URL for the current git branch):
 *   doppler run --project gaff --config dev --scope ~/.t-stack/orgs/<org> -- \
 *     bun scripts/neon-env.ts bun scripts/admin-smoke-seed.ts
 *
 * NOTE: this is intentionally NOT a recurring fixture — re-running it
 * accumulates rows. Delete with:
 *   DELETE FROM scrape_runs WHERE id LIKE 'smoke-%';
 *   DELETE FROM ai_runs     WHERE id LIKE 'smoke-%';
 */
import { sql as drizzleSql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import * as schema from "../db/schema";

const db = getDb();

async function main() {
  let search = await db.query.searches.findFirst();
  if (!search) {
    // No search yet — bootstrap a household + smoke search so the
    // admin dashboard has something to point at. The household is
    // ownerless on purpose (smoke-only — auth flow creates real
    // households via Better Auth hooks).
    let hh = await db.query.households.findFirst();
    if (!hh) {
      const hhId = `smoke-hh-${nanoid(8)}`;
      await db.insert(schema.households).values({
        id: hhId,
        name: "Smoke household",
      });
      hh = await db.query.households.findFirst();
    }
    if (!hh) {
      console.error("Could not bootstrap household");
      process.exit(1);
    }
    const sid = `smoke-search-${nanoid(8)}`;
    await db.insert(schema.searches).values({
      id: sid,
      householdId: hh.id,
      name: "Smoke search",
      portals: ["rightmove", "zoopla", "openrent"],
      // Smoke search uses NW3 as a hand-built SearchLocation. Real
      // searches go through Google Places autocomplete; here we
      // hard-code centroid + bounds + the Rightmove locationIdentifier
      // resolved offline (NW3 → OUTCODE^1859) so the smoke run doesn't
      // need network access at seed time.
      location: {
        placeId: "",
        name: "NW3",
        formattedAddress: "NW3, UK",
        type: "postal_code",
        lat: 51.554,
        lng: -0.178,
        bounds: {
          ne: { lat: 51.575, lng: -0.155 },
          sw: { lat: 51.535, lng: -0.205 },
        },
        portalRefs: {
          rightmove: { locationIdentifier: "OUTCODE^1859" },
          zoopla: { q: "NW3, UK" },
          openrent: { term: "NW3" },
        },
      },
      excludeLocations: [],
      minBedrooms: 1,
      maxBedrooms: 3,
      minPrice: 1500,
      maxPrice: 3500,
      propertyTypes: [],
      commuteTargets: [],
      transportTargets: [],
      active: true,
    });
    search = await db.query.searches.findFirst({
      where: (s, { eq }) => eq(s.id, sid),
    });
  }
  if (!search) {
    console.error("Failed to find/create smoke search.");
    process.exit(1);
  }
  console.log(`Seeding into search ${search.id} (${search.name})`);

  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60 * 1000);

  // Some scrape runs
  await db.insert(schema.scrapeRuns).values([
    {
      id: `smoke-${nanoid(8)}`,
      searchId: search.id,
      portal: "rightmove",
      startedAt: minutesAgo(5),
      finishedAt: minutesAgo(4),
      status: "success",
      listingsFound: 24,
      newListings: 3,
      costUsd: "0.0042",
    },
    {
      id: `smoke-${nanoid(8)}`,
      searchId: search.id,
      portal: "zoopla",
      startedAt: minutesAgo(15),
      finishedAt: minutesAgo(14),
      status: "success",
      listingsFound: 18,
      newListings: 2,
      costUsd: "0.0038",
    },
    {
      id: `smoke-${nanoid(8)}`,
      searchId: search.id,
      portal: "openrent",
      startedAt: minutesAgo(45),
      finishedAt: minutesAgo(44),
      status: "failure",
      listingsFound: 0,
      newListings: 0,
      costUsd: "0.0001",
      errorMessage: "smoke: portal returned 503",
    },
  ]);

  // Some listings (needed for ai_runs.listingId join — we attach to
  // any existing listing if available; otherwise we bootstrap one so
  // the AI rows can land + the dedupe stats have something to count).
  let listing = await db.query.listings.findFirst({
    where: (l, { eq }) => eq(l.searchId, search.id),
  });
  if (!listing) {
    const clusterId = `smoke-cluster-${nanoid(8)}`;
    await db.insert(schema.propertyClusters).values({
      id: clusterId,
      normalisedAddress: `smoke ${clusterId}`,
      postcode: "NW3 1AA",
    });
    const baseListing = {
      searchId: search.id,
      clusterId,
      url: "https://example.com/smoke",
      title: "Smoke flat · Belsize Park Mews",
      addressRaw: "1 Smoke Mews, NW3 1AA",
      postcode: "NW3 1AA",
      bedrooms: 2,
      priceMonthly: 2400,
      rawJson: {},
    } as const;
    await db.insert(schema.listings).values([
      {
        id: `smoke-l-${nanoid(8)}`,
        portal: "rightmove",
        portalListingId: `smoke-rm-${nanoid(6)}`,
        ...baseListing,
      },
      {
        id: `smoke-l-${nanoid(8)}`,
        portal: "zoopla",
        portalListingId: `smoke-zo-${nanoid(6)}`,
        ...baseListing,
      },
    ]);
    listing = await db.query.listings.findFirst({
      where: (l, { eq }) => eq(l.searchId, search.id),
    });
  }

  if (listing) {
    await db.insert(schema.aiRuns).values([
      {
        id: `smoke-${nanoid(8)}`,
        listingId: listing.id,
        promptVersion: "v1.0.0",
        model: "claude-haiku-4-5",
        startedAt: minutesAgo(3),
        finishedAt: minutesAgo(2),
        status: "success",
        inputTokens: 1240,
        outputTokens: 280,
        costUsd: "0.00264",
      },
      {
        id: `smoke-${nanoid(8)}`,
        listingId: listing.id,
        promptVersion: "v1.0.0",
        model: "epc",
        startedAt: minutesAgo(8),
        finishedAt: minutesAgo(7),
        status: "success",
        costUsd: null,
      },
      {
        id: `smoke-${nanoid(8)}`,
        listingId: listing.id,
        promptVersion: "v1.0.0",
        model: "claude-haiku-4-5",
        startedAt: minutesAgo(60),
        finishedAt: minutesAgo(59),
        status: "failure",
        inputTokens: 800,
        outputTokens: 0,
        costUsd: "0.0008",
        errorMessage: "smoke: rate limited",
      },
    ]);
  } else {
    console.log(
      "No listings yet — ai_runs need a listing FK; skipping AI rows."
    );
  }

  const scrapeCount = await db.execute(
    drizzleSql`SELECT COUNT(*) FROM scrape_runs WHERE id LIKE 'smoke-%'`
  );
  const aiCount = await db.execute(
    drizzleSql`SELECT COUNT(*) FROM ai_runs WHERE id LIKE 'smoke-%'`
  );
  console.log("scrape_runs (smoke):", scrapeCount);
  console.log("ai_runs (smoke):", aiCount);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
