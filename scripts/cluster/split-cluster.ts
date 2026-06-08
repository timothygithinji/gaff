/**
 * Split ONE over-merged cluster into its true homes by full photo identity
 * (content-key AND cross-portal perceptual hash). Unlike the same-portal-only
 * Phase 0 (`split-by-photos.ts`), this separates cross-portal listings too —
 * the phash pairs a Zoopla and a Rightmove listing of the same flat, and keeps
 * genuinely different flats apart.
 *
 * The component holding the cheapest ACTIVE listing keeps the original cluster
 * id — and therefore its swipes/pipeline/notifications, which were made against
 * that headline view. The other components become new clusters. Nothing is
 * stranded: swipes stay on the kept component.
 *
 *   dry run : doppler run ... -- bun scripts/cluster/split-cluster.ts <clusterId>
 *   apply   : doppler run ... -- bun scripts/cluster/split-cluster.ts <clusterId> --apply
 */
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { addressOutcode } from "../../src/lib/cluster/key";
import {
  type ListingPhotoSignals,
  groupByPhotoIdentity,
} from "../../src/lib/cluster/photo-match";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set (run via doppler prd)");
}
const APPLY = process.argv.includes("--apply");
const clusterId = process.argv
  .slice(2)
  .find((a) => !a.startsWith("--") && !a.includes("/"));
if (!clusterId) {
  throw new Error("usage: split-cluster.ts <clusterId> [--apply]");
}
const sql = neon(url);

type LRow = {
  id: string;
  portal: string;
  price_monthly: number | null;
  status: string;
  postcode: string | null;
  address_raw: string;
  bedrooms: number | null;
};
const listings = (await sql`
  SELECT id, portal, price_monthly, status, postcode, address_raw, bedrooms
  FROM listings WHERE cluster_id = ${clusterId}`) as LRow[];
if (listings.length < 2) {
  console.log(`Cluster ${clusterId} has <2 listings — nothing to split.`);
  process.exit(0);
}

const photos = (await sql`
  SELECT lp.listing_id, lp.content_key, lp.phash
  FROM listing_photos lp JOIN listings l ON l.id = lp.listing_id
  WHERE l.cluster_id = ${clusterId}`) as {
  listing_id: string;
  content_key: string | null;
  phash: string | null;
}[];
const ckBy = new Map<string, string[]>();
const phBy = new Map<string, bigint[]>();
for (const p of photos) {
  if (p.content_key) {
    (ckBy.get(p.listing_id) ?? ckBy.set(p.listing_id, []).get(p.listing_id))?.push(p.content_key);
  }
  if (p.phash) {
    (phBy.get(p.listing_id) ?? phBy.set(p.listing_id, []).get(p.listing_id))?.push(BigInt(p.phash));
  }
}

const meta = new Map(listings.map((l) => [l.id, l]));
const signals: ListingPhotoSignals[] = listings.map((l) => ({
  id: l.id,
  outcode: addressOutcode(l.postcode, l.address_raw),
  bedrooms: l.bedrooms,
  portal: l.portal,
  contentKeys: ckBy.get(l.id) ?? [],
  phashes: phBy.get(l.id) ?? [],
}));
const groups = groupByPhotoIdentity(signals);

const priceOf = (id: string) =>
  meta.get(id)?.price_monthly ?? Number.POSITIVE_INFINITY;
const statusOf = (id: string) => meta.get(id)?.status ?? "";
const cheapestActive = (ids: string[]): string =>
  ids.reduce((best, id) => {
    if (statusOf(id) !== statusOf(best)) {
      return statusOf(id) === "active" ? id : best;
    }
    return priceOf(id) < priceOf(best) ? id : best;
  });

console.log(`\n=== SPLIT CLUSTER ${clusterId} (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
console.log(`${listings.length} listings → ${groups.length} homes\n`);
if (groups.length < 2) {
  console.log("Already a single home by photo identity — nothing to split.\n");
  process.exit(0);
}

// The component holding the overall cheapest active listing keeps the id.
const overallCheapest = cheapestActive(listings.map((l) => l.id));
const keepIdx = groups.findIndex((g) => g.includes(overallCheapest));
groups.forEach((g, i) => {
  console.log(`home ${i + 1}${i === keepIdx ? " (KEEPS cluster id + swipes)" : " (NEW cluster)"}:`);
  for (const id of g) {
    const l = meta.get(id);
    console.log(`   [${l?.portal}] £${l?.price_monthly} ${l?.bedrooms}bd  ${String(l?.address_raw).slice(0, 40)}`);
  }
});

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply.\n");
  process.exit(0);
}

neonConfig.webSocketConstructor = (globalThis as { WebSocket?: unknown }).WebSocket as never;
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const base = (
    await client.query("SELECT normalised_address, postcode FROM property_clusters WHERE id=$1", [clusterId])
  ).rows[0];
  let made = 0;
  for (let i = 0; i < groups.length; i++) {
    if (i === keepIdx) {
      continue;
    }
    const g = groups[i] as string[];
    const rep = cheapestActive(g);
    const newId = nanoid();
    await client.query(
      "INSERT INTO property_clusters (id, normalised_address, postcode, created_at, updated_at) VALUES ($1,$2,$3,now(),now())",
      [newId, `${base?.normalised_address}#${newId.slice(0, 8)}`, meta.get(rep)?.postcode ?? base?.postcode ?? null]
    );
    await client.query("UPDATE listings SET cluster_id=$1 WHERE id = ANY($2)", [newId, g]);
    made++;
  }
  await client.query("COMMIT");
  console.log(`\n✅ APPLIED — ${made} new clusters split off; original keeps the cheapest home + swipes.\n`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("\n❌ ROLLED BACK:", e);
  throw e;
} finally {
  client.release();
  await pool.end();
}
