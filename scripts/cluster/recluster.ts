/**
 * One-off cross-portal re-cluster backfill.
 *
 * The original clusterer matched on exact normalised-address equality, so
 * the same property listed on Rightmove / Zoopla / OpenRent landed in
 * separate clusters (see src/lib/cluster/key.ts for the why). This merges
 * those duplicate clusters using the validated street-key + outcode +
 * bedrooms + price-corroboration rule, CROSS-PORTAL only, with existing
 * clusters treated as atomic (we only ever merge, never split).
 *
 * SAFE BY DEFAULT: prints the full plan and touches nothing. Pass --apply
 * to execute inside a single transaction. swipes / shortlist_pipeline FK
 * the cluster with onDelete:RESTRICT, so absorbed clusters' decision rows
 * are re-pointed (with conflict resolution) BEFORE the cluster is deleted.
 *
 * Swipe conflict (a user swiped the same flat on two portals → two
 * clusters): resolved skip-wins (preserve the blind veto), then
 * shortlist, then keep. Pipeline/notification conflicts: keep the
 * most-recent row.
 *
 *   dry run : doppler run --project gaff --config prd ... -- bun scripts/cluster/recluster.ts
 *   apply   : doppler run --project gaff --config prd ... -- bun scripts/cluster/recluster.ts --apply
 */
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import {
  addressOutcode,
  isDegenerateStreetKey,
  priceCorroborates,
  streetKey,
} from "../../src/lib/cluster/key";
import {
  type SwipeOutcome,
  resolveSwipeOutcome,
} from "../../src/lib/cluster/merge";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set (run via doppler prd)");
const APPLY = process.argv.includes("--apply");
const sql = neon(url);

type Row = {
  id: string;
  portal: string;
  cluster_id: string;
  address_raw: string;
  postcode: string | null;
  bedrooms: number | null;
  price_monthly: number | null;
  status: string;
};

const rows = (await sql`
  SELECT id, portal, cluster_id, address_raw, postcode, bedrooms, price_monthly, status
  FROM listings WHERE cluster_id IS NOT NULL`) as Row[];

// Merge decision uses ACTIVE listings only (matches the validated dry run);
// when a cluster merges, ALL its listings + decision rows move.
type Agg = {
  id: string;
  oc: Set<string>;
  beds: Set<number>;
  keys: Set<string>;
  prices: number[];
  portals: Set<string>;
};
const aggs = new Map<string, Agg>();
for (const r of rows) {
  if (r.status !== "active") continue;
  let a = aggs.get(r.cluster_id);
  if (!a) {
    a = { id: r.cluster_id, oc: new Set(), beds: new Set(), keys: new Set(), prices: [], portals: new Set() };
    aggs.set(r.cluster_id, a);
  }
  a.oc.add(addressOutcode(r.postcode, r.address_raw));
  if (r.bedrooms != null) a.beds.add(r.bedrooms);
  a.keys.add(streetKey(r.address_raw));
  if (r.price_monthly != null) a.prices.push(r.price_monthly);
  a.portals.add(r.portal);
}
const list = [...aggs.values()];

const inter = (a: Set<unknown>, b: Set<unknown>) => [...a].some((x) => b.has(x));
const sharesKey = (a: Agg, b: Agg) =>
  [...a.keys].filter((k) => !isDegenerateStreetKey(k)).some((k) => b.keys.has(k));
const portalDiverse = (a: Agg, b: Agg) =>
  !(a.portals.size === 1 && b.portals.size === 1 && [...a.portals][0] === [...b.portals][0]);
function mergeable(a: Agg, b: Agg): boolean {
  if (!inter(a.oc, b.oc) || !inter(a.beds, b.beds) || !sharesKey(a, b)) return false;
  if (!portalDiverse(a, b)) return false;
  if (!a.prices.length || !b.prices.length) return false;
  return a.prices.some((p) => b.prices.some((q) => priceCorroborates(p, q)));
}

const parent = new Map(list.map((a) => [a.id, a.id]));
function find(x: string): string {
  const p = parent.get(x);
  if (p === undefined || p === x) {
    return x;
  }
  const root = find(p);
  parent.set(x, root);
  return root;
}
for (let i = 0; i < list.length; i++) {
  for (let j = i + 1; j < list.length; j++) {
    const a = list[i];
    const b = list[j];
    if (a && b && mergeable(a, b)) {
      parent.set(find(a.id), find(b.id));
    }
  }
}

const comps = new Map<string, string[]>();
for (const a of list) {
  const root = find(a.id);
  const arr = comps.get(root) ?? [];
  arr.push(a.id);
  comps.set(root, arr);
}
const groups = [...comps.values()].filter((c) => c.length > 1);

// Decision-row counts per cluster, to choose survivors + size the impact.
type Counts = { swipes: number; pipeline: number; notif: number; listings: number };
const clusterIds = groups.flat();
const decisionCounts = new Map<string, Counts>();
const countsFor = (id: string): Counts =>
  decisionCounts.get(id) ?? { swipes: 0, pipeline: 0, notif: 0, listings: 0 };
for (const id of clusterIds) {
  decisionCounts.set(id, { swipes: 0, pipeline: 0, notif: 0, listings: 0 });
}
if (clusterIds.length) {
  const idList = clusterIds;
  type CountRow = { cluster_id: string; n: number };
  const load = (q: Promise<unknown>) => q as Promise<CountRow[]>;
  const sw = await load(sql`SELECT cluster_id, COUNT(*)::int n FROM swipes WHERE cluster_id = ANY(${idList}) GROUP BY 1`);
  const pp = await load(sql`SELECT cluster_id, COUNT(*)::int n FROM shortlist_pipeline WHERE cluster_id = ANY(${idList}) GROUP BY 1`);
  const nt = await load(sql`SELECT cluster_id, COUNT(*)::int n FROM match_notifications WHERE cluster_id = ANY(${idList}) GROUP BY 1`);
  const lc = await load(sql`SELECT cluster_id, COUNT(*)::int n FROM listings WHERE cluster_id = ANY(${idList}) GROUP BY 1`);
  for (const r of sw) {
    countsFor(r.cluster_id).swipes = r.n;
  }
  for (const r of pp) {
    countsFor(r.cluster_id).pipeline = r.n;
  }
  for (const r of nt) {
    countsFor(r.cluster_id).notif = r.n;
  }
  for (const r of lc) {
    countsFor(r.cluster_id).listings = r.n;
  }
}
// Survivor = most decision rows, then most listings, then smallest id.
function pickSurvivor(ids: string[]): string {
  return [...ids].sort((a, b) => {
    const A = countsFor(a);
    const B = countsFor(b);
    const da = A.swipes + A.pipeline + A.notif;
    const db = B.swipes + B.pipeline + B.notif;
    return db - da || B.listings - A.listings || a.localeCompare(b);
  })[0] as string;
}

const plan = groups.map((ids) => {
  const survivor = pickSurvivor(ids);
  const absorbed = ids.filter((x) => x !== survivor);
  return { survivor, absorbed, ids };
});

const addrOf = (cid: string) => rows.filter((r) => r.cluster_id === cid).map((r) => `[${r.portal}/${r.status}] £${r.price_monthly} "${r.address_raw}"`);
let totSw = 0, totPp = 0, totNt = 0, totLs = 0;
console.log(`\n=== RE-CLUSTER PLAN (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
console.log(`current clusters: ${list.length}   merge groups: ${plan.length}   clusters removed: ${plan.reduce((n, g) => n + g.absorbed.length, 0)}\n`);
for (const g of plan) {
  for (const a of g.absorbed) {
    const d = countsFor(a);
    totSw += d.swipes; totPp += d.pipeline; totNt += d.notif; totLs += d.listings;
  }
  console.log(`survivor ${g.survivor.slice(0, 8)}  ← absorb ${g.absorbed.map((x) => x.slice(0, 8)).join(", ")}`);
  for (const cid of g.ids) {
    const d = countsFor(cid);
    const tag = cid === g.survivor ? "KEEP " : "MERGE";
    console.log(`   ${tag} ${cid.slice(0, 8)} (listings:${d.listings} swipes:${d.swipes} pipeline:${d.pipeline} notif:${d.notif})`);
    for (const ln of addrOf(cid)) console.log(`         ${ln}`);
  }
}
console.log(`\nrows that will move from absorbed clusters: listings:${totLs} swipes:${totSw} pipeline:${totPp} notif:${totNt}`);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to execute.\n");
  process.exit(0);
}

// ---- APPLY (single transaction via WebSocket pool) ----
// Bun ships a global WebSocket; neon's Pool needs it wired up explicitly.
neonConfig.webSocketConstructor = (globalThis as { WebSocket?: unknown }).WebSocket as never;
const pool = new Pool({ connectionString: url });
const c = await pool.connect();
try {
  await c.query("BEGIN");
  for (const g of plan) {
    for (const cid of g.absorbed) {
      // swipes — re-point, resolving (user, search) conflicts skip-wins.
      const sw = (await c.query("SELECT id, user_id, search_id, outcome FROM swipes WHERE cluster_id=$1", [cid])).rows;
      for (const s of sw) {
        const ex = (await c.query("SELECT id, outcome FROM swipes WHERE cluster_id=$1 AND user_id=$2 AND search_id=$3", [g.survivor, s.user_id, s.search_id])).rows[0];
        if (ex) {
          const win = resolveSwipeOutcome(
            ex.outcome as SwipeOutcome,
            s.outcome as SwipeOutcome
          );
          if (win !== ex.outcome) await c.query("UPDATE swipes SET outcome=$1 WHERE id=$2", [win, ex.id]);
          await c.query("DELETE FROM swipes WHERE id=$1", [s.id]);
        } else {
          await c.query("UPDATE swipes SET cluster_id=$1 WHERE id=$2", [g.survivor, s.id]);
        }
      }
      // shortlist_pipeline — re-point, conflict keep most-recently-moved.
      const pp = (await c.query("SELECT id, household_id, last_moved_at, status FROM shortlist_pipeline WHERE cluster_id=$1", [cid])).rows;
      for (const p of pp) {
        const ex = (await c.query("SELECT id, last_moved_at FROM shortlist_pipeline WHERE cluster_id=$1 AND household_id=$2", [g.survivor, p.household_id])).rows[0];
        if (ex) {
          if (new Date(p.last_moved_at) > new Date(ex.last_moved_at)) {
            await c.query("DELETE FROM shortlist_pipeline WHERE id=$1", [ex.id]);
            await c.query("UPDATE shortlist_pipeline SET cluster_id=$1 WHERE id=$2", [g.survivor, p.id]);
          } else {
            await c.query("DELETE FROM shortlist_pipeline WHERE id=$1", [p.id]);
          }
        } else {
          await c.query("UPDATE shortlist_pipeline SET cluster_id=$1 WHERE id=$2", [g.survivor, p.id]);
        }
      }
      // match_notifications — re-point, drop on conflict (already notified).
      const nt = (await c.query("SELECT id, household_id FROM match_notifications WHERE cluster_id=$1", [cid])).rows;
      for (const n of nt) {
        const ex = (await c.query("SELECT id FROM match_notifications WHERE cluster_id=$1 AND household_id=$2", [g.survivor, n.household_id])).rows[0];
        if (ex) await c.query("DELETE FROM match_notifications WHERE id=$1", [n.id]); else await c.query("UPDATE match_notifications SET cluster_id=$1 WHERE id=$2", [g.survivor, n.id]);
      }
      // listings (all statuses) then drop the now-empty cluster.
      await c.query("UPDATE listings SET cluster_id=$1 WHERE cluster_id=$2", [g.survivor, cid]);
      await c.query("DELETE FROM property_clusters WHERE id=$1", [cid]);
    }
  }
  await c.query("COMMIT");
  console.log("\n✅ APPLIED in one transaction.\n");
} catch (e) {
  await c.query("ROLLBACK");
  console.error("\n❌ ROLLED BACK:", e);
  throw e;
} finally {
  c.release();
  await pool.end();
}
