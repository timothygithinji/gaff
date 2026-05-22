# Gaff — implementation plan (PR 3 → PR 9.5)

The first 7 commits (Phase A through PR 2) landed the foundations: Drizzle
domain schema, Neon per-branch databases, TanStack Start SSR on Workers,
Better Auth with the Cloudflare Access bridge plugin, typed EPC +
postcodes.io clients, the portal parsers (Rightmove + Zoopla + OpenRent)
with live HTML fixtures + 32 Vitest tests, the Doppler runtime injection
chain, per-search Neon branching, the `better_auth` schema isolation, the
branch-name hooks, and the `.gitignore` cleanup.

This file picks up from there. It covers everything that turns the
foundation into the actual rental-finder app — search creation, the
scrape pipeline, clustering, AI enrichment, the four user-facing screens,
and a basic admin view.

## Locked decisions

- **Onboarding** — Cloudflare Access is the firewall; the table is
  canonical. Invite-by-email flow inside the app.
- **Scrape cadence** — per-search picker in the UI, default **daily**.
  Stored on Trigger.dev as an IMPERATIVE schedule; the schedule's
  `externalId` is the back-link to `search.id`. **Not stored in our DB.**
- **AI model** — `claude-haiku-4-5` for enrichment.
- **Designs** — 5 Paper artboards (Review, Listing detail, Shortlist,
  Search create, Admin·runs). 390 px mobile + 1440 px admin. Fonts:
  **Fraunces** (display serif) + **Inter** (UI).
- **Mineral palette** — `--ground #F4EFE6`, `--copper #9B5A3E`, `--brass
  #7A6A4A` + ink/bone/paper.
- **Household size** — works at 1, 2, and N members. The UI parameterises
  on `household_members.count`. Never assumes exactly two.
- **Trigger.dev v4** SDK (`@trigger.dev/sdk`, already pinned to
  `^4.4.6`). Queues are pre-declared; lifecycle hooks use the single-object
  signature; `triggerAndWait` returns a `Result`; no `Promise.all` on
  `triggerAndWait` (use `batchTriggerAndWait`).

## Open decisions still to lock

1. **Tailwind v4** (current, CSS-driven theming) vs v3 — recommend v4.
2. **Maps** — Google Maps Embed (cheap, fast) vs Mapbox (prettier) —
   recommend Google Embed for v1.
3. **Invite delivery** — copy-link (paste manually into WhatsApp /
   Signal) vs Resend email — recommend copy-link for v1.
4. **Bottom-nav visibility on Search create** — the design hides it for
   the full-screen modal — confirm same.

---

## Cross-cutting prereqs (land once, used by everything below)

### Schema migration `0001_n_member_mutual_matches.sql`

The only schema change is generalising the view. **No `searches.scrapeCron`,
`scrapeScheduleId`, or `nextScrapeAt` columns** — that all lives on
Trigger.dev.

```sql
DROP VIEW v_mutual_matches;

CREATE VIEW v_mutual_matches AS
WITH member_counts AS (
  SELECT household_id, COUNT(*) AS member_count
  FROM household_members
  GROUP BY household_id
),
agreement AS (
  SELECT
    sw.cluster_id,
    sw.search_id,
    s.household_id,
    COUNT(DISTINCT sw.user_id) AS agree_count,
    MAX(sw.created_at) AS matched_at
  FROM swipes sw
  JOIN searches s ON s.id = sw.search_id
  WHERE sw.outcome IN ('keep','shortlist')
  GROUP BY sw.cluster_id, sw.search_id, s.household_id
)
SELECT a.cluster_id, a.search_id, a.household_id, a.matched_at
FROM agreement a
JOIN member_counts m ON m.household_id = a.household_id
WHERE a.agree_count = m.member_count;
```

Semantics: a cluster appears in the mutual feed when **every active
household member** has kept-or-shortlisted it. Works at any size — solo
(auto-mutual with self), couple (Tim + Peareace), N (every flatmate).

### Tooling adds

- **Tailwind v4** + **Fraunces** + **Inter** via `@fontsource`.
- A handful of **Radix primitives** (Dialog, DropdownMenu, Toast, Slider,
  Tabs). No full shadcn install — copy-paste only what's needed.
- **React Hook Form + Zod** resolver.
- **TanStack Start `createServerFn()`** for all mutations.
- **TanStack Query** for server-function data fetching (matches scout's
  pattern; lets us cache schedule rows alongside everything else).
- **CSS vars** on `:root`:
  `--ground #F4EFE6 · --copper #9B5A3E · --brass #7A6A4A · --ink #18120B · --bone #FBF7EE · --paper #FFFFFF`.

### `<HouseholdContext>` provider

Loads the current user's household with `member_count` so screens can
branch cleanly on size.

### Onboarding flow

Better Auth post-signin hook:

- No `household_members` row for the user → auto-create household ("Your
  household"), add user as `owner`. They land in **solo mode**
  (Reviews / Searches / Saved; no Matches tab).
- `/settings/household` lists members + owner-only invite + remove
  member.
- Invite: single-use token in Better Auth's `verification` table. UI
  shows a copy-link (no email infra for v1 — paste into WhatsApp etc.).
- Accept at `/invite/$token`: requires sign-in (CF Access still gates
  network access), INSERTs `household_members`. Matches tab appears for
  every member after this.
- Remove member: owner-only, deletes the membership row but preserves
  their swipes (history stays). The view recomputes naturally — clusters
  that were mutual with the removed member may un-mutual until remaining
  members re-agree.

### UI parameterisation by household size

| Element | 1 | 2 (designed) | 3+ |
|---|---|---|---|
| Bottom nav "Matches" tab | hide | keep | keep, count = mutual feed size |
| Shortlist tabs | "Saved" only | `Mutual N · Yours N · Peareace's N` | `Mutual N · Yours N · <per member>` |
| "BOTH KEPT" badge | drop | "BOTH KEPT" | "ALL KEPT" / "4 of 4 KEPT" with avatar stack |
| Listing detail CTA | "Keep" | "Keep · waiting on Peareace" | "Keep · waiting on Peareace + 2 others" |
| Settings → household | invite only | members + invite | members + invite + remove |

### Trigger.dev schedule wrappers — the canonical pattern

`src/server/functions/schedules.ts` — thin wrappers around `schedules.*`
from the v4 SDK. Modelled on `timothygithinji/scout/server/functions/schedules.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import type { ScheduleObject } from "@trigger.dev/core/v3";
import { schedules, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

const cronPatternSchema = z.string().trim().min(1);
const timezoneSchema = z.string().trim().min(1).max(64).optional();

// Whitelist of task IDs callable as "Run now" — prevents the wrapper
// from becoming an arbitrary task launcher.
const SCHEDULABLE_TASK_IDS = ["scrape-search"] as const;

export const listSchedules = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScheduleObject[]> => {
    const page = await schedules.list({ perPage: 100 });
    return page.data;
  }
);

export const createSchedule = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      task: z.string(),
      cron: cronPatternSchema,
      externalId: z.string().optional(),
      timezone: timezoneSchema,
      deduplicationKey: z.string().optional(),
    })
  )
  .handler(({ data }) =>
    schedules.create({
      ...data,
      deduplicationKey: data.deduplicationKey ?? crypto.randomUUID(),
    })
  );

export const updateSchedule    = /* schedules.update(id, …) */;
export const activateSchedule  = /* schedules.activate(id) */;
export const deactivateSchedule = /* schedules.deactivate(id) */;
export const deleteSchedule    = /* schedules.del(id) */;

export const runScheduleTaskNow = createServerFn({ method: "POST" })
  .inputValidator(z.object({ task: z.enum(SCHEDULABLE_TASK_IDS) }))
  .handler(({ data }) =>
    tasks.trigger(data.task, {}, {
      tags: [`task:${data.task}`, "trigger:manual"],
      idempotencyKey: `${data.task}-manual-${Date.now()}`,
      idempotencyKeyTTL: "1m",
    })
  );
```

To find a search's current schedule, the UI lists schedules and filters
by `externalId === search.id` (or via a `findScheduleByExternalId`
helper). Cron, timezone, and active state all come from `ScheduleObject`
— never from our DB.

---

## PR 3 — Search create

**Files**: `src/routes/searches/{index,new,$id}.tsx`,
`src/server/functions/searches.ts`, `src/components/search-form/*`.

UI mirrors the designed mobile screen:

- Rename headline ("A flat in North London"), tap to edit.
- INCLUDE / EXCLUDE outcode chips with postcodes.io validation.
- Price slider £1k–£5k.
- Bed (1 / 2 / 3 / 4+) and Bath (1+ / 2 / 3+) pill groups.
- AI floor-plan rules: toggle list (Separate kitchen, Both bedrooms fit a
  double, Dual-aspect living, Real storage) + "+ Add custom rule"
  textarea (free-text rule appended to the prompt).
- Commute target row: Google Places autocomplete → lat/lng, max minutes,
  mode picker.
- Portals to watch: Rightmove / Zoopla / OpenRent toggles.

**Cadence picker** writes to Trigger.dev, not the DB. Friendly labels →
cron strings:

| Label | Cron |
|---|---|
| Daily (default) | `0 7 * * *` |
| Every 12h | `0 7,19 * * *` |
| Every 6h | `0 */6 * * *` |
| Every 4h | `0 */4 * * *` |
| Every 2h | `0 */2 * * *` |
| Hourly | `0 * * * *` |
| Off | calls `deactivateSchedule(id)` |

Cost estimate label is computed from the picker value + (#outcodes ×
#portals × $portalCost).

Server functions:

- `createSearch` → INSERT row → `createSchedule({ task: "scrape-search",
  cron, externalId: search.id, timezone: "Europe/London" })`.
- `updateSearch` → UPDATE row → look up schedule by `externalId` →
  `updateSchedule({ id, cron })` if cron changed.
- `archiveSearch` → `deactivateSchedule(id)`.
- `deleteSearch` → `deleteSchedule(id)` then DELETE row.

---

## PR 4 — Scrape pipeline (Trigger.dev v4)

**Files**: `src/trigger/scrape-search.ts`, `src/trigger/scrape-portal.ts`,
`src/lib/cluster/normalise.ts`.

```ts
// src/trigger/scrape-portal.ts
import { queue, task } from "@trigger.dev/sdk";

export const scrapeQueue = queue({
  name: "scrape",
  concurrencyLimit: 5,         // bounded Zyte parallelism
});

export const scrapePortalTask = task({
  id: "scrape-portal",
  queue: scrapeQueue,
  onSuccess: async ({ output, ctx }) => {
    /* UPDATE scrape_runs SET status='success', cost_usd, listings_found */
  },
  onFailure: async ({ error, ctx }) => {
    /* UPDATE scrape_runs SET status='failure', error_message */
  },
  run: async ({ searchId, portal }: { searchId: string; portal: Portal }) => {
    // 1. INSERT scrape_runs row (status='running')
    // 2. Per outcode: Zyte fetch → parser → upsert listings
    //    (unique (search_id, portal, portal_listing_id))
    // 3. Return { costUsd, count }
  },
});
```

```ts
// src/trigger/scrape-search.ts
import { schedules } from "@trigger.dev/sdk";
import { scrapePortalTask } from "./scrape-portal";

export const scrapeSearchTask = schedules.task({
  id: "scrape-search",
  run: async (_payload, { ctx }) => {
    const searchId = ctx.externalId;
    if (!searchId) return;
    const search = await loadSearch(searchId);
    if (!search?.active) return;

    // v4: NO Promise.all(triggerAndWait...). Use batchTriggerAndWait.
    const result = await scrapePortalTask.batchTriggerAndWait(
      search.portals.map((portal) => ({ payload: { searchId, portal } })),
    );

    for (const run of result.runs) {
      if (!run.ok) {
        // failures already recorded by scrapePortalTask.onFailure
      }
    }
  },
});
```

**Address normaliser** lives in `src/lib/cluster/normalise.ts` (flat /
unit-number preserving per handoff quirk #8).

**Cleanup wiring**: extend `.github/workflows/pr-cleanup.yml` — on PR
close, call `listSchedules`, filter for `externalId` matching any search
in the PR's Neon branch, `deleteSchedule(id)` for each. Otherwise
orphan schedules fire forever against dead DBs.

---

## PR 5 — Clustering + photo caching

**Files**: `src/trigger/cluster.ts`, `src/trigger/cache-photos.ts`,
`src/lib/cluster/match.ts`.

- `scrapePortalTask.onSuccess` → `clusterTask.batchTrigger(newListingIds)`.
- `cluster` task: normalise address → find `property_clusters` by
  `normalisedAddress` → create if missing → set `listings.clusterId`.
- `cache-photos`: download portal photo URLs → R2
  (`clusters/{clusterId}/{position}.jpg`) → update
  `listing_photos.r2Key`. Skip already-cached.

All child triggers use v4 patterns (`batchTriggerAndWait` not
`Promise.all`, single-object lifecycle hooks).

---

## PR 6 — EPC + AI enrichment

**Files**: `src/trigger/enrich-epc.ts`, `src/trigger/enrich-ai.ts`,
`src/lib/ai/{config,prompt,client,budget}.ts`.

- `enrich-epc` — typed EPC client (already in `src/lib/api-clients/epc`)
  per cluster postcode → `enrichments.epc`. Skip if same `promptVersion`
  already exists.
- `enrich-ai` — `claude-haiku-4-5` with structured outputs (Zod-validated).
  Extracts features shown in design (Separate kitchen, Dual-aspect
  living, "Bed 2 fits double, not king") + "small print" issues. Writes
  `enrichments.features` + `promptVersion = "v1.0.0"`.
- **Budget cap** in `src/lib/ai/config.ts`:

  ```ts
  export const AI_BUDGET = {
    model: "claude-haiku-4-5",
    dailyUsd: 1.00,
  } as const;
  ```

  `src/lib/ai/budget.ts` checks `ai_runs.cost_usd` SUM for today before
  each call; once exceeded, short-circuits with `status="failure"`,
  `errorMessage="daily_budget_exceeded"`.
- Triggered from `clusterTask.onSuccess` for new clusters.

---

## PR 7 — Review screen

**Files**: `src/routes/index.tsx`, `src/server/functions/review.ts`,
`src/components/review/{Card,Actions,Header,Pills}.tsx`.

- `getNextReviewCard({ householdId })` returns the highest-priority
  cluster the current user hasn't swiped, scoped to the household's
  active searches. Excludes clusters where ANY household member already
  skipped (asymmetric-hides-from-disappointed-voter).
- UI matches the Review artboard: full-bleed hero photo with portal-cross
  badge, price + address, feature pills (filtered by `searches.aiRules`
  so they're display filters, not prompt scopes), commute / walk / EPC /
  fibre row, 5 action buttons (undo, skip, info → detail, **keep** big
  copper, shortlist star). Header `N LEFT TODAY` + avatar.
- `recordSwipe({ clusterId, searchId, outcome })` INSERTs on `swipes`
  with conflict update (undo + re-swipe works). Optimistic next-card
  paint via TanStack Query.

---

## PR 8 — Shortlist + Matches

**Files**: `src/routes/{shortlist,matches}.tsx`,
`src/server/functions/shortlist.ts`, `src/components/shortlist/*`.

- Tabs parameterised by `household.member_count` (table above).
- Mutual feed reads `v_mutual_matches`. "Plan a viewing" CTA = `mailto:`
  to the listed agent for the cheapest portal in the cluster.
- "Matches" badge in bottom nav: `v_mutual_matches.matched_at >
  user.last_seen_matches` for unread count. Tap to clear.

---

## PR 9 — Listing detail

**Files**: `src/routes/listings/$clusterId.tsx`,
`src/server/functions/listing-detail.ts`,
`src/components/listing-detail/*`.

Aggregates `listings` rows where `cluster_id = $clusterId`, sorted
cheapest-first. Sections from the design:

- Photo gallery (R2-cached URLs).
- Price + portal cross-listing diff (£+50 deltas).
- "What we see" — AI floorplan analysis from `enrichments.features`.
- "What's in the small print" — AI-extracted issues.
- Map with commute overlay (Google Maps Embed; lat/lng from
  `property_clusters`).
- "Public records": EPC (`enrichments.epc`), broadband (postcodes.io),
  crime (police-area data), flood risk (EA Flood API).
- Bottom CTA varies by swipe state + household size.

---

## PR 9.5 — Admin runs + schedules (basic; polish deferred to v1.1)

**Files**: `src/routes/admin/{index,runs,spend,schedules}.tsx`,
`src/components/admin/*`.

Desktop-only layout (matches 1440 px artboard).

- Sidebar: HOUSE (Review / Shortlist / Searches) + SYSTEM (Runs / Spend /
  Schedules / Settings).
- "Quiet morning, busy night." dashboard: 4 metric cards
  (`scrape_runs.cost` SUM last-30d with sparkline; listings ingested 24h
  with portal split; AI calls today + cost; dedupe cluster-size
  distribution).
- Recent-runs table: union of `scrape_runs` + `ai_runs`, filter pills
  (All / Scrape / Enrich / AI), color-coded result.
- **`/admin/schedules`** (scout-inspired): renders `listSchedules()` —
  cron, next run, active state, "Run now" button. Lets us see every
  Trigger.dev schedule and edit / pause / run without leaving the app.
- **No pause-all switch in v1** — explicit v1.1 defer.

---

## v1.1 explicit defers (don't build these now)

- Push notifications
- `/admin/runs` polish (filters, search, export)
- `/skipped` view
- Prompt-version re-run UI (we can still WRITE multiple prompt versions
  in v1; just no UI to trigger re-runs)
- Email-delivered invites via Resend

---

## Operational TODOs the handoff flagged separately

- Add Peareace's email to the Pulumi CF Access policy
  (`infra/cloudflare/src/index.ts`). Need her email.
- Run `t-stack provision` / `pulumi up` to sync the already-committed
  `accessAppAud` export.
- Replace `src/trigger/hello-world.ts` placeholder in PR 4.
