/**
 * One-off: split clusters the ORIGINAL exact-address layer over-merged.
 *
 * The first-layer normaliser keys on the exact normalised address string,
 * so different homes that share a road-level string ("Brownlow Road,
 * London N11") collapse into one cluster. This finds those and splits them
 * back apart, using the only discriminators we have: rent + coordinates
 * (see src/lib/cluster/coords.ts — coords are noisy, so we only split when
 * two listings agree on NEITHER price NOR location).
 *
 * Conservative by design: within a cluster, listings are linked when they
 * price-corroborate OR sit within ~30m. A cluster splits only if it breaks
 * into >1 unlinked component. Ambiguous same-price/noisy-coord listings
 * stay together (we can't prove they differ; a human can still merge/split
 * via the UI).
 *
 * Swipes stay put: the component keeping the cheapest listing keeps the
 * ORIGINAL cluster id (and thus its swipes/pipeline/notifications); only
 * the split-off components get NEW clusters. New clusters get a suffixed
 * normalised_address (the base is taken by the original) — that just means
 * they won't be re-found by exact-address match, which is fine.
 *
 *   dry run : doppler run --project gaff --config prd ... -- bun scripts/cluster/split-overmerged.ts
 *   apply   : doppler run --project gaff --config prd ... -- bun scripts/cluster/split-overmerged.ts --apply
 */
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import {
  type Coord,
  coordsCorroborate,
  distanceMetres,
  listingCoord,
} from "../../src/lib/cluster/coords";
import {
  priceCorroborates,
  streetKey,
  streetKeyHasUnit,
} from "../../src/lib/cluster/key";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set (run via doppler prd)");
}
const APPLY = process.argv.includes("--apply");
const sql = neon(url);

type Row = {
  id: string;
  cluster_id: string;
  portal: string;
  address_raw: string;
  postcode: string | null;
  price_monthly: number | null;
  status: string;
  lat: string | null;
  lng: string | null;
  raw_json: unknown;
};

const rows = (await sql`
  SELECT id, cluster_id, portal, address_raw, postcode, price_monthly, status, lat, lng, raw_json
  FROM listings WHERE cluster_id IS NOT NULL`) as Row[];

type L = Row & { coord: Coord | null };
const byCluster = new Map<string, L[]>();
for (const r of rows) {
  const l: L = {
    ...r,
    coord: listingCoord({ lat: r.lat, lng: r.lng, rawJson: r.raw_json }),
  };
  let bucket = byCluster.get(r.cluster_id);
  if (!bucket) {
    bucket = [];
    byCluster.set(r.cluster_id, bucket);
  }
  bucket.push(l);
}

// Within a cluster, two listings are the same property if rent corroborates
// OR they're within ~30m. Components of unlinked listings → a split.
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
      if (!(a && b)) {
        continue;
      }
      // Mirror the live merge policy (clustersAreDuplicates): coords within
      // ~30m always link. Price links too, EXCEPT when both listings carry a
      // real coordinate yet sit >30m apart on a unit-less road key
      // ("turnpike lane|") — there every flat rents about the same, so a
      // price match is coincidence and location is the honest discriminator.
      // When either side lacks a coordinate we can't place it, so we keep the
      // price fallback rather than strand a real cross-portal duplicate.
      const ka = streetKey(a.address_raw);
      const sameUnitBearingKey =
        ka === streetKey(b.address_raw) && streetKeyHasUnit(ka);
      const bothHaveCoords = a.coord != null && b.coord != null;
      const priceLinks =
        priceCorroborates(a.price_monthly, b.price_monthly) &&
        (sameUnitBearingKey || !bothHaveCoords);
      const same = coordsCorroborate(a.coord, b.coord, 30) || priceLinks;
      if (same) {
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
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(l);
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

const maxSpread = (ls: L[]): number => {
  const cs = ls.map((l) => l.coord).filter((c): c is Coord => c != null);
  let d = 0;
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const b = cs[j];
      if (a && b) {
        d = Math.max(d, distanceMetres(a, b));
      }
    }
  }
  return Math.round(d);
};

const plan: { clusterId: string; keep: L[]; splitOff: L[][] }[] = [];
for (const [clusterId, ls] of byCluster) {
  if (ls.length < 2) {
    continue;
  }
  const comps = components(ls);
  if (comps.length < 2) {
    continue;
  }
  // The component holding the overall cheapest listing keeps the cluster id.
  const headline = cheapestActive(ls);
  const keepIdx = comps.findIndex((c) => c.some((l) => l.id === headline.id));
  const keep = comps[keepIdx];
  if (!keep) {
    continue;
  }
  const splitOff = comps.filter((_, i) => i !== keepIdx);
  plan.push({ clusterId, keep, splitOff });
}

// Decision rows on the clusters we'd split (they stay on the kept cluster).
const splitIds = plan.map((p) => p.clusterId);
let swipeRows = 0;
if (splitIds.length) {
  const sw = (await sql`SELECT COUNT(*)::int n FROM swipes WHERE cluster_id = ANY(${splitIds})`) as { n: number }[];
  swipeRows = sw[0]?.n ?? 0;
}

console.log(`\n=== SPLIT OVER-MERGED CLUSTERS (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
console.log(`clusters to split: ${plan.length}   new clusters created: ${plan.reduce((n, p) => n + p.splitOff.length, 0)}`);
console.log(`swipes on these clusters (stay on the kept component): ${swipeRows}\n`);
for (const p of plan) {
  console.log(`cluster ${p.clusterId.slice(0, 8)}  → keep 1 + split ${p.splitOff.length}  (coordSpread ${maxSpread([...p.keep, ...p.splitOff.flat()])}m)`);
  const show = (tag: string, ls: L[]) => {
    for (const l of ls) {
      console.log(`   ${tag} [${l.portal}/${l.status}] £${l.price_monthly} ${l.coord ? `(${l.coord.lat.toFixed(4)},${l.coord.lng.toFixed(4)})` : "(no coord)"} "${l.address_raw}"`);
    }
  };
  show("KEEP ", p.keep);
  for (const grp of p.splitOff) {
    show("SPLIT", grp);
  }
}

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to execute.\n");
  process.exit(0);
}

// ---- APPLY ----
neonConfig.webSocketConstructor = (globalThis as { WebSocket?: unknown }).WebSocket as never;
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const p of plan) {
    for (const grp of p.splitOff) {
      const rep = cheapestActive(grp);
      const base = (
        await client.query("SELECT normalised_address FROM property_clusters WHERE id=$1", [p.clusterId])
      ).rows[0]?.normalised_address as string;
      const newId = nanoid();
      // Suffix keeps the unique index happy; base stays on the kept cluster.
      const normalised = `${base}#${newId.slice(0, 8)}`;
      await client.query(
        "INSERT INTO property_clusters (id, normalised_address, postcode, lat, lng, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,now(),now())",
        [newId, normalised, rep.postcode ?? null, rep.coord?.lat ?? null, rep.coord?.lng ?? null]
      );
      const ids = grp.map((l) => l.id);
      await client.query("UPDATE listings SET cluster_id=$1 WHERE id = ANY($2)", [newId, ids]);
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
