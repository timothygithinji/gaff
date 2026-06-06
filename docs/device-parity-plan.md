# Device-parity refactor plan — review & listing-detail

**Goal:** every feature shares one primitive layer that owns each visual *concept* and its *data* once; per-device files only arrange those primitives. Kill the drift where mobile and desktop silently show different content.

**Decisions taken (2026-06-06):**
- Scope: plan both *review* and *listing-detail*; build later.
- Drift resolution: **converge to the richest version** — content divergences are bugs. Both devices show the same data set, laid out differently.
- **Action set (resolved):** unified to **Keep · Skip · Undo + Details** on both devices. "Skip" replaces desktop's "Veto" verb. Orientation differs per device only (vertical desktop, horizontal mobile).
- **Map (resolved):** **upgrade mobile to the interactive JS map** — single interactive map primitive on both devices. No longer an exception; accept the extra mobile JS/Maps cost + touch-gesture testing.
- These were locked from product judgement, not re-checked against Paper.

### Grilling-session decisions (2026-06-06) — supersede earlier defaults where they conflict
Findings that reframed the plan: the app is **SSR (TanStack Start on a Cloudflare Worker)**, so `lg:hidden` dual-tree is the SSR-*safe* pattern and `useIsMobile` single-tree would flash desktop→mobile on phones. Both trees mount (`lg:hidden` = `display:none`, effects still run). The 4-vs-2 stat drift originated in the **shaping layer**, not the components. `feature-pills.tsx` is **dead code** carrying a richer 3-state severity model the live UI discarded. Both devices already derive from the same server type `ReviewCard`, so data-side converge is mechanical.

1. **Render model:** keep the **dual-tree CSS shell** (SSR-safe), but **lazy-gate heavy widgets** so the hidden copy doesn't init.
2. **Gate mechanism:** a reusable **`<MountWhenVisible>`** wrapper (IntersectionObserver — `display:none` never intersects; mounts when CSS flips at `lg`). Reuse for the interactive map and Embla.
3. **Primitive shape:** **one primitive, `variant` prop branches arrangement only**; content/data shaping lives once. Layout passes `variant` literally (no `useIsMobile` inside primitives → stays SSR-safe).
4. **Shaping layer:** **colocated pure shapers per primitive** (`toStatCells`/`toPills`/`toPortalRows`), exported for tests; **both** layouts call the same one. Retires `index.tsx`'s `buildStats`/`buildHero`/`buildPortals` and the mobile inline shaping. This is the real anti-drift move.
5. **StatRow canonical set:** **Transport · EPC · Council tax · Size** on both. (Drift the audit missed: desktop's lead cell was Transport/station-walk, mobile's was Commute/targets — Commute is dropped.)
6. **FeaturePills:** restore **3-state severity** (positive/caution/problem), **cap 6 both**, standardize on Hugeicons (Tick + Alert). **Delete dead `feature-pills.tsx`**.
7. **PortalList:** mobile = compact avatar **stack that taps to expand** the same delta+link rows desktop shows (disclosure owned by the primitive).
8. **Primitive location:** `src/components/ui/patterns/`.
9. **Pilot order:** **Foundations → listing-detail → review** (de-risk the daily-driver swipe loop by doing it last).
10. **Verification:** **`renderToStaticMarkup` contract tests** (per the existing `costs.test.tsx` convention) + manual Paper/visual check at mobile/tablet/desktop + `bun run build`. No new test infra.
11. **Migration:** **per-screen clean cutover** — each PR builds its primitives, rewires the screen, deletes the old components in the same PR. `SectionCard` imports updated in the foundations PR. No long-lived shims/flags.

---

## 1. Root cause

Three competing device paradigms coexist, so there is no single place a concept lives:

| Paradigm | Where | Device chosen by |
|---|---|---|
| (a) one component, `layout`/`bare` prop | `search-form.tsx` (`isDesktop = layout === "desktop"`, `SectionCard bare={!isDesktop}`) | prop branch |
| (b) separate `desktop-*.tsx` + inline mobile render fns | review (`desktop-review.tsx` + `renderMobileHero` in `index.tsx`), listing-detail (`desktop-listing-detail.tsx` + mobile JSX in `$clusterId.tsx`) | different files |
| (c) dual-tree CSS hiding at the route | every route: `<DesktopX>` + `<div className="…lg:hidden">` | `lg:hidden` / `hidden lg:flex` |

Consequences:
1. **Dual-tree rendering** — both trees are live, CSS hides one. Double maintenance; the seam where drift breeds.
2. **Content drift, not just styling** — the two trees say different things (see §4).
3. **~70% bespoke Tailwind** — concepts (stat row, feature pill, portal row, price block, section card) are reimplemented per device instead of shared. `ui/` has only generic primitives; only `sidebar.tsx` is device-aware.
4. **No shared page shell** — `mx-auto … max-w-md … sm:max-w-2xl … lg:hidden` is copy-pasted across 8+ routes.

What is already healthy (keep): single 1024px boundary (`use-mobile.ts` ↔ Tailwind `lg:`); tablet deliberately folded into mobile (`max-w-md` → `sm:max-w-2xl`); `SectionCard`'s `bare` prop is already the right pattern, just trapped inside search-form.

---

## 2. Target architecture — three layers

```
Layer 3  Page shell        <PageShell variant="mobile"|"desktop">   (kills the copy-pasted wrapper)
Layer 2  Per-device layout DesktopReview / MobileReview             (arrangement only: rail vs column)
Layer 1  Shared primitives StatRow, FeaturePills, PortalList, …     (owns concept + data; device-agnostic)
```

Rule: **Layer 1 owns *what* is shown; Layer 2 owns *where*.** A primitive may take a density/`variant` prop for arrangement (mirroring `SectionCard`'s `bare`), but never a different *data set* per device.

### Convention to standardise on
Collapse (a)/(b)/(c) onto **one**: keep separate `Desktop*`/`Mobile*` layout components (Layer 2) selected by the route's `lg:hidden`/`hidden lg:flex` shell (paradigm c — this is the **SSR-safe** choice; see grilling decisions). Those layout components may **only** compose Layer-1 primitives + shell — no bespoke concept markup. Each layout is statically one device, so it passes `variant` to primitives **literally** (no `useIsMobile` inside primitives). Heavy widgets in the hidden tree are wrapped in `MountWhenVisible` so they don't init. Paradigm (a)'s prop-branching is reserved for *primitives* (the `bare`/`variant` knob), not whole screens. One rule for every future feature: "new concept → primitive + pure shaper in `ui/patterns/`; new screen → thin Desktop/Mobile layout that composes primitives."

---

## 3. Primitive inventory (Layer 1) — to extract into `src/components/ui/patterns/`

Each row = one concept currently duplicated. "Converge to" states the richest behaviour both devices adopt.

| Primitive | Replaces (desktop / mobile) | Proposed API | Converge to |
|---|---|---|---|
| `SectionCard` (promote) | `search-form.tsx:545` `SectionCard`/`Section` | `{ title, titleRight?, subtitle?, variant: "card"\|"bare" }` | Move out of search-form; listing-detail's `Costs`/`CostsCard`, `PropertyFacts`/`PropertyFactsCard` pairs collapse to one with `variant`. |
| `StatRow` + `toStatCells(card)` | `NumbersCard` (`desktop-review.tsx:831`) / `CardStats` (`review-card.tsx:291`) | `{ stats, variant }` + pure shaper exported for tests | **Transport · EPC · Council tax · Size** on both (Commute dropped); tone + sub-label everywhere. `variant` flips desktop dynamic-grid vs mobile flex-row only. |
| `FeaturePills` + `toPills(features)` | `WhatStandsOutCard` (`desktop-review.tsx:763`) / `CardTags` (`review-card.tsx:247`); **delete dead `feature-pills.tsx`** | `{ items: {label,severity}[], max=6, variant }` | **3-state severity** (positive/caution/problem, restored from `watchouts[].severity`), **cap 6 both**, Hugeicons Tick+Alert glyphs. Listing-detail `Highlights`+`SmallPrint`/`AiCard` fold here too. |
| `PortalList` + `toPortalRows(card)` | `PortalsPanel`/`PortalRow` (`desktop-review.tsx:923`) / `CardPortals` (`review-card.tsx:350`) | `{ portals, headline, variant }` | Same delta+link rows both. Mobile `variant="stack"` = compact avatars that **tap to expand** the full rows; desktop `variant="list"` shows them inline. |
| `MountWhenVisible` | — (new) | `{ children }` | IntersectionObserver wrapper; the CSS-hidden tree's copy never mounts its children (interactive map, Embla) until it becomes visible at the `lg` flip. |
| `PriceBlock` | desktop `LeadHeader`/PriceCard (`desktop-review.tsx:448`; `desktop-listing-detail.tsx:1181`) / mobile inline headline (`review-card.tsx:223`; `$clusterId.tsx:372`) | `{ priceMonthly, title, subtitle, size }` | Single type scale + format; `size` controls 40px vs 18px. |
| `DecisionActions` | `ActionStack` (`desktop-review.tsx:995`, Keep / [Veto · Details], vertical) / `ActionButtons` (`action-buttons.tsx:31`, Undo · Skip · Keep, horizontal) | `{ actions: ("keep"\|"skip"\|"undo"\|"details")[], orientation, pendingAction, partnerInitial }` | **Resolved: Keep · Skip · Undo + Details on both** ("Skip" replaces "Veto"). Orientation per device only. One source for labels, partner-waiting copy, pending spinners, hotkey hints. |
| `EmptyState` | desktop dashed in-rail box (`desktop-review.tsx:307`) / mobile centered card (`index.tsx:1419`) | `{ eyebrow, title?, body?, action?, variant }` | One copy structure + button style; `variant` controls dashed-inline vs centered-card. |
| `HeroPhoto` | `HeroPhoto` (`desktop-review.tsx:485`, Embla + lightbox + arrow hotkeys) / mobile carousel (`review-card.tsx:165`, no lightbox) | `{ photos, enableLightbox, enableHotkeys }` | Shared Embla wrapper; mobile gains the lightbox, desktop keeps hotkeys (gated by `useIsMobile`, already correct). |
| `PageShell` | the copy-pasted `mx-auto … max-w-md … sm:max-w-2xl … lg:hidden` wrapper (8+ routes) | `{ variant: "mobile"\|"desktop", children }` | One component; mobile variant owns max-width + bottom-nav padding + safe-area. |

Listing-detail map concept (`WhereItSits` static iframe vs `MapCommuteCard` interactive JS map, `desktop-listing-detail.tsx:602`): **resolved — mobile upgrades to the interactive JS map.** One `MapCommute` primitive on both devices; the static iframe is retired. Accept the extra mobile Maps JS cost + touch-gesture testing.

---

## 4. Drift reconciliation (converge to richest) — concrete decisions

| # | Concept | Desktop today | Mobile today | Converged target | Source refs |
|---|---|---|---|---|---|
| 1 | Stats | Transport, EPC, Council tax, Size + tone + sub | Commute, EPC (no tone) | **Transport · EPC · Council tax · Size** both (Commute dropped), tone + sub both | `desktop-review.tsx:831` / `review-card.tsx:291` |
| 2 | Decision actions | Keep / Veto / Details (vertical) | Undo / Skip / Keep (horizontal) | **Resolved: Keep · Skip · Undo + Details everywhere** ("Skip" replaces "Veto"); orientation per device. | `desktop-review.tsx:995` / `action-buttons.tsx:31` |
| 3 | Feature pills | 6-slot grid, 2-state warn | max 3, 2-state warn | **3-state severity** restored, cap 6 both, Hugeicons glyph; delete dead `feature-pills.tsx` | `desktop-review.tsx:763` / `review-card.tsx:247` |
| 4 | Portals | rows, price deltas, links | avatar stack, no deltas/links | same delta+link rows both; mobile stack **taps to expand** to them | `desktop-review.tsx:923` / `review-card.tsx:350` |
| 5 | Empty/no-match | dashed in-rail | centered card, different copy | one copy + button style, `variant` for placement | `desktop-review.tsx:307` / `index.tsx:1419` |
| 6 | Listing costs / facts | bordered `*Card` | bare section | one `SectionCard variant` | `costs.tsx`, `property-facts.tsx` |
| 7 | Highlights+watchouts | combined `AiCard` 2-col grid | separate `Highlights`+`SmallPrint` | one `FeaturePills` | `desktop-listing-detail.tsx:366` / `highlights.tsx`,`small-print.tsx` |
| 8 | Price/title block | `ListingTitle`/PriceCard 40px | inline header 18/28px | `PriceBlock size` | `desktop-listing-detail.tsx:305,1181` / `$clusterId.tsx:372` |
| 9 | Floorplan/docs | `MediaCard` zoomable + brochure | `FloorplanAnalysis` simple link | richest = zoomable + brochure both | `desktop-listing-detail.tsx:909` / `floorplan-analysis.tsx` |
| 10 | Map/commute | `MapCommuteCard` interactive JS map | `WhereItSits` static iframe | interactive on both (mobile upgrades) | `desktop-listing-detail.tsx:602` / `where-it-sits.tsx` |

All decisions are locked — every row is now a mechanical converge-to-richest with no open product calls.

---

## 5. Build sequence (when greenlit)

Order is **Foundations → listing-detail → review** (review last to de-risk the daily-driver swipe loop). Each PR is a **clean cutover**: build the primitives it needs, rewire the screen, delete the old components in the same PR. No long-lived shims/flags.

1. ~~**Foundations:** create `src/components/ui/patterns/`; add `MountWhenVisible` + `PageShell`; move `SectionCard`/`Section` out of search-form and update search-form's imports in this PR (no re-export shim). Land + verify search-form unchanged.~~ **DONE (2026-06-06):** `patterns/{section-card,mount-when-visible,page-shell}.tsx` created; `SectionCard`/`Section` now take `variant: "card"|"bare"`; search-form rewired (one computed `sectionVariant`, no local defs); `@` alias added to `vitest.config.ts`; `tests/components/section-card.test.tsx` added. typecheck + lint + 356 tests + `bun run build` all green. Not yet committed.
2. **Shared primitives + shapers:** build the primitives both screens need — each to the converged spec with its pure shaper + `renderToStaticMarkup` contract test. **DONE so far (2026-06-06):** `SectionCard`; `FeaturePills`+`FeatureList`+`toPills` (3-state severity restored, dead `feature-pills.tsx` deleted); `PriceBlock`+`formatPrice`; `EmptyState`. **Deferred to their cutover step** (so the shaper validates against the consuming feature's real data): `PortalList`+`toPortalRows` and `MapCommute` → built in step 3 (listing-detail); `StatRow`+`toStatCells` → built in step 4 (review-only concept).
3. **Listing-detail cutover:** rebuild `DesktopListingDetail` + the mobile JSX in `$clusterId.tsx` as thin Layer-2 compositions; build the shared interactive `MapCommute` primitive (wrapped in `MountWhenVisible`) and retire the static iframe; collapse `Costs`/`CostsCard`, `PropertyFacts`/`PropertyFactsCard` via `SectionCard variant`. Delete old sub-components. Verify.
   - **DONE (2026-06-06):** mobile portals (`49a7f838`), mobile highlights/watchouts → `FeatureList` (`8a8a51ae`), mobile price → `PriceBlock` (`c2f132b9`), desktop `AiCard` → `FeatureList` grid (`22760e8c`), desktop price + portals → `PriceBlock`/`PortalList` rail (`bea55348`). Portals, features and price are now shared across both devices.
   - **Still to do:** Costs/PropertyFacts → `SectionCard` (low value — they already share `CostsBody`/`PropertyFactsBody`; needs `SectionCard` to gain eyebrow heading + radius options, and a contextual-radius decision — recommend deferring); the interactive `MapCommute` upgrade (the one real feature change — biggest piece, needs touch-gesture + Paper verification).
   - **Findings that revise the plan** (need a call before the desktop conversion): listing-detail sections use an **11px eyebrow** (`SectionLabel`), not `SectionCard`'s 17px title; desktop cards are **`rounded-2xl`** vs `SectionCard`'s `rounded-lg`; desktop `AiCard` is a **2-col grid** vs `FeatureList`'s single column. So "collapse via `SectionCard variant`" needs `SectionCard` to gain an `eyebrow` heading + radius option, and a decision on whether desktop features converge to single-column (visual change) or `FeatureList` gains a 2-col variant. These are visual-fidelity calls best verified against Paper.
4. **Review cutover (hardest, last):** build the review-specific primitives (`HeroPhoto`, `DecisionActions`); rebuild `DesktopReview` + a new `MobileReview` (replacing `renderMobileHero`/`review-card`/`action-buttons`); retire `index.tsx`'s `buildStats`/`buildHero`/`buildPortals` in favour of the shapers. Preserve `useHotkey`/Embla/pointer-drag and the `useIsMobile` hotkey gating. Resolve actions (#2) + pills (#3) here. Delete dead `feature-pills.tsx`.
5. **Sweep (optional):** apply `PageShell` to the remaining routes (shortlist, searches, compare, search/new); migrate `desktop-shortlist`/`pipeline-mobile` onto the convention.

Each step is independently shippable; the only data-semantic changes are the deliberate converge-to-richest ones in §4.

---

## 6. Verification & risks

- **Contract tests:** one `renderToStaticMarkup` test per primitive (per `costs.test.tsx`), asserting the converged behaviour + pure shapers (`toStatCells` → 4 stats both variants; `toPills` → problem-severity tint; `toPortalRows` → deltas present). No `@testing-library`/jsdom.
- **Verify visually:** compare each rebuilt screen to the Paper "Gaff" artboards at mobile / tablet (768) / desktop widths. The radius/divider system (review-card 2px, cards 6–8px; bone-vs-line dividers) must be preserved — it was only recently corrected.
- **Build gate:** always `bun run build` (prod Worker bundle) before deploy; it's not in CI.
- **Risks:** (1) review screen is hotkey/gesture/swipe heavy — `useHotkey`, Embla, pointer drag must survive the re-wire; keep the `useIsMobile` hotkey gating. (2) Converging actions (#2) changes mobile behaviour — mobile gains Details, and the verb flips Veto→Skip; check copy in the household/blind-veto flow. (3) Mobile map upgrade (#10) adds Maps JS weight + touch-gesture handling — needs the `GOOGLE_MAPS_SERVER_KEY`/referrer setup already in place, explicit pinch/drag testing, and the `MountWhenVisible` gate so the hidden desktop/mobile copy doesn't double-init. (4) SSR: keep the `lg:hidden` dual-tree (SSR-safe); do **not** switch to `useIsMobile` single-tree (would flash desktop→mobile on phones). We remove *duplicate concept code*, not the shell split, so SSR/CSS behaviour is unchanged.
