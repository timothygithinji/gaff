/**
 * Phase 0 — split clusters that over-merged DIFFERENT homes, using the free
 * photo content-key signal (no perceptual hashing, no schema change).
 *
 * Within a cluster, two listings are the SAME home when:
 *   - they're on DIFFERENT portals (content keys never collide across CDNs,
 *     so we can't disprove identity here — leave them linked; the perceptual
 *     pass in Phase 2 resolves cross-portal), OR
 *   - they're on the SAME portal and their photo content keys overlap enough
 *     (contentKeysMatch) — i.e. a genuine re-list / the same listing scraped
 *     by two searches.
 *
 * So an edge is CUT only on positive evidence of difference: two same-portal
 * listings whose photos don't overlap are different flats in one building
 * (the Turnpike Lane / jRr failure). The cluster splits into the connected
 * components that survive. The component holding the cheapest active listing
 * keeps the original cluster id (and its swipes/enrichment); the rest become
 * new clusters with a suffixed normalised_address.
 *
 * Listings with NO cached photos can't be placed by this signal, so they
 * stay attached to the cheapest component rather than being stranded.
 *
 *   dry run : doppler run --project gaff --config prd ... -- bun scripts/cluster/split-by-photos.ts
 *   apply   : doppler run --project gaff --config prd ... -- bun scripts/cluster/split-by-photos.ts --apply
 *   one id  : ... -- bun scripts/cluster/split-by-photos.ts <clusterId> [--apply]
 */
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { contentKeysMatch, photoContentKey } from "../../src/lib/cluster/photo-identity";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set (run via doppler prd)");
}
const APPLY = process.argv.includes("--apply");
const onlyCluster = process.argv.find(
  (a) => !a.startsWith("--") && !a.includes("/") && a.length > 8
);
const sql = neon(url);

type Row = {
  id: string;
  cluster_id: string;
  portal: string;
  price_monthly: number | null;
  status: string;
  postcode: string | null;
};

const rows = (await sql`
  SELECT id, cluster_id, portal, price_monthly, status, postcode
  FROM listings WHERE cluster_id IS NOT NULL`) as Row[];

const photoRows = (await sql`
  SELECT listing_id, url FROM listing_photos`) as { listing_id: string; url: string }[];
const keysByListing = new Map<string, Set<string>>();
for (const p of photoRows) {
  const k = photoContentKey(p.url);
  if (!k) {
    continue;
  }
  let s = keysByListing.get(p.listing_id);
  if (!s) {
    s = new Set();
    keysByListing.set(p.listing_id, s);
  }
  s.add(k);
}

type L = Row & { keys: Set<string> };
const byCluster = new Map<string, L[]>();
for (const r of rows) {
  const l: L = { ...r, keys: keysByListing.get(r.id) ?? new Set() };
  let bucket = byCluster.get(r.cluster_id);
  if (!bucket) {
    bucket = [];
    byCluster.set(r.cluster_id, bucket);
  }
  bucket.push(l);
}

/**
 * Same home? Cross-portal → can't disprove with content keys, keep linked.
 * Same portal → require photo overlap. A listing with no photos links to
 * anything (we can't prove it differs), so it never strands.
 */
function sameHome(a: L, b: L): boolean {
  if (a.portal !== b.portal) {
    return true;
  }
  if (a.keys.size === 0 || b.keys.size === 0) {
    return true;
  }
  return contentKeysMatch(a.keys, b.keys);
}

function components(ls: L[]): L[][] {
  const parent = ls.map((_, i) => i);
  const find = (x: number): number => {
    const px = parent[x];
    if (px === undefined || px === x) {
      return x;
    }
    const root = find(px);
    parent[x] = root;
    return root;
  };
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i];
      const b = ls[j];
      if (a && b && sameHome(a, b)) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, L[]>();
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (!l) {
      continue;
    }
    const root = find(i);
    let g = groups.get(root);
    if (!g) {
      g = [];
      groups.set(root, g);
    }
    g.push(l);
  }
  return [...groups.values()];
}

const cheapestActive = (ls: L[]): L =>
  ls.reduce((best, l) => {
    if (l.status !== best.status) {
      return l.status === "active" ? l : best;
    }
    const lp = l.price_monthly ?? Number.POSITIVE_INFINITY;
    const bp = best.price_monthly ?? Number.POSITIVE_INFINITY;
    return lp < bp ? l : best;
  });

const plan: { clusterId: string; keep: L[]; splitOff: L[][] }[] = [];
for (const [clusterId, ls] of byCluster) {
  if (onlyCluster && clusterId !== onlyCluster) {
    continue;
  }
  if (ls.length < 2) {
    continue;
  }
  const comps = components(ls);
  if (comps.length < 2) {
    continue;
  }
  const headline = cheapestActive(ls);
  const keepIdx = comps.findIndex((c) => c.some((l) => l.id === headline.id));
  const keep = comps[keepIdx];
  if (!keep) {
    continue;
  }
  plan.push({
    clusterId,
    keep,
    splitOff: comps.filter((_, i) => i !== keepIdx),
  });
}

const splitIds = plan.map((p) => p.clusterId);
let swipeRows = 0;
if (splitIds.length) {
  const sw = (await sql`SELECT COUNT(*)::int n FROM swipes WHERE cluster_id = ANY(${splitIds})`) as { n: number }[];
  swipeRows = sw[0]?.n ?? 0;
}

console.log(`\n=== SPLIT BY PHOTOS (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
console.log(`clusters to split: ${plan.length}   new clusters: ${plan.reduce((n, p) => n + p.splitOff.length, 0)}`);
console.log(`swipes on split clusters (stay on kept component): ${swipeRows}\n`);
for (const p of plan) {
  console.log(`cluster ${p.clusterId.slice(0, 8)} → keep ${p.keep.length} + split into ${p.splitOff.length} new`);
  const show = (tag: string, ls: L[]) => {
    for (const l of ls) {
      console.log(`   ${tag} [${l.portal}/${l.status}] £${l.price_monthly} ${l.keys.size}ph  ${l.id}`);
    }
  };
  show("KEEP ", p.keep);
  for (const grp of p.splitOff) {
    show("SPLIT", grp);
  }
}

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply.\n");
  process.exit(0);
}

neonConfig.webSocketConstructor = (globalThis as { WebSocket?: unknown }).WebSocket as never;
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const p of plan) {
    const base = (
      await client.query("SELECT normalised_address FROM property_clusters WHERE id=$1", [p.clusterId])
    ).rows[0]?.normalised_address as string;
    for (const grp of p.splitOff) {
      const rep = cheapestActive(grp);
      const newId = nanoid();
      const normalised = `${base}#${newId.slice(0, 8)}`;
      await client.query(
        "INSERT INTO property_clusters (id, normalised_address, postcode, created_at, updated_at) VALUES ($1,$2,$3,now(),now())",
        [newId, normalised, rep.postcode ?? null]
      );
      await client.query("UPDATE listings SET cluster_id=$1 WHERE id = ANY($2)", [
        newId,
        grp.map((l) => l.id),
      ]);
    }
  }
  await client.query("COMMIT");
  console.log("\n✅ APPLIED in one transaction.\n");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("\n❌ ROLLED BACK:", e);
  throw e;
} finally {
  client.release();
  await pool.end();
}
