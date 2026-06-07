# Portal search URL params — verified reference

Empirically verified 2026-06-07 by driving each portal's live filter UI
(agent-browser for Rightmove + OpenRent; Zyte for Zoopla, whose UI is
Cloudflare-walled to automated browsers — which is also why the prod
scraper uses Zyte). Pairs with the builders in `src/lib/portal-urls.ts`.

Legend: ✅ we send it and it's correct · ⚠️ gap/quirk · ➖ portal supports
it but we deliberately don't use it.

---

## Rightmove — `find.html?...` (single route)

Property type is the URL param **`propertyTypes`**, comma-joined, lowercase.

- UI pills (the granular set): `detached`, `semi-detached`, `terraced`,
  `flat`, `bungalow`, `land`, `park-home`, `private-halls` (Student Halls).
- ✅ **`house` is a valid meta-token** even though it's not a UI pill —
  the results heading echoes it ("…, house, at least 2 beds, …") and it
  filters correctly. So our `propertyTypes=house` works as-is.

| Param | Values | Status |
|---|---|---|
| `locationIdentifier` | `OUTCODE^1859` etc. (resolved via typeahead) | ✅ |
| `searchType` | `RENT` | ✅ |
| `propertyTypes` | comma list incl. `house` meta-token | ✅ |
| `minPrice`/`maxPrice` | PCM | ✅ |
| `minBedrooms`/`maxBedrooms` | 1–10 | ✅ |
| `radius` | miles (`0.0` = this area only) | ✅ |
| `furnishTypes` | `furnished`, `partFurnished`, `unfurnished` | ✅ (we send 2 of 3) |
| `mustHave` | `garden`, `parking` (comma) | ✅ |
| `dontShow` | `student`, `retirement`, `houseShare` (comma) | ✅ |
| `maxDaysSinceAdded` | 1/3/7/14… | ✅ |
| `sortType` | `6` = newest | ✅ |
| `includeLetAgreed` / `letType` | `false` / `longTerm` | ✅ (silent-win defaults) |
| min/max baths | UI has it; param not captured | ➖ enforced read-side (bath counts too sparse to send) |

**Verdict: builder is correct. No change needed.**

---

## OpenRent — `/properties-to-rent/<outcode>[/<type>]?...`

Property type is a **PATH SEGMENT**, not a query param. Selecting a type
in the UI rewrites the path:

- `propertyType` form field → `1`=Houses, `2`=Flats, `3`=Rooms, ``=Any
- Emitted URL: `/properties-to-rent/nw3/houses?term=Nw3&prices_min=…`
  (i.e. `/houses`, `/flats`, `/rooms`).

⚠️ We omit property type entirely and rely on the read-time/scrape-time
backstop. Adopting the `/houses` path would filter at source, but that
route renders listings as a `PROPERTYIDS=[…]` JS array (different markup),
so it needs a `parseOpenrentPropertyIds`-style parser path. Single-valued,
so a multi-type search (house+flat) can't use it → fall back to no-path +
backstop.

| Param | Values | Status |
|---|---|---|
| `term` | free-text location | ✅ |
| `area` + `searchType` | int + `km`\|`minutes` | ✅ (`km`; `minutes` = commute-radius, unused ➖) |
| `prices_min`/`prices_max` | 0–9000, `-1`=any (per-week scale via `priceperweek`) | ✅ |
| `bedrooms_min`/`bedrooms_max` | `-1`=any, `0`=Studio, 1–8 | ✅ |
| `bathrooms_min`/`bathrooms_max` | 1–8 | ✅ (we send min only) |
| `furnishedType` | `0`=either, `1`=furnished, `2`=unfurnished | ✅ |
| **property type** | path `/houses`·`/flats`·`/rooms` | ⚠️ omitted (backstop covers) |
| `isLive` | `true` (excl. let-agreed) | ✅ |
| `hasGarden`/`hasParking`/`acceptPets` | bool | ✅ |
| `acceptNonStudents` | bool — ⚠️ UI form field is `AcceptNonStudents` (capital A); confirm casing | ✅ (sent lowercase, believed honoured) |
| `acceptStudents`, `acceptFamilies`, `rentCoveredByDSSorPreferred` | bool | ➖ |
| `includeBills`, `hasFireplace`, `videoTour` | bool | ➖ |
| `availableBefore`, `minTenancy`, `excludeEnquired` | — | ➖ |
| `sortType` | `0`=distance, `1`=price asc, `2`=price desc | ➖ |

---

## Zoopla — two routes

**The free-text `/search/?q=…` route silently ignores `property_sub_type`.**
Only the **path route `/to-rent/property/london/<outcode>/`** honours it.
Our builder uses the path route for the 8 London postal-area letters
(E/EC/N/NW/SE/SW/W/WC — a wrong region slug returns 0) and falls back to
`/search/?q=` (+ backstop) elsewhere.

`property_sub_type` is **repeatable** (one per built-form). There is no
`house` umbrella token. Verified house set (returns houses, zero flats):
`detached`, `semi_detached`, `terraced`, `end_terrace`, `town_house`,
`mews`, `cottage`; plus `bungalow`; plus `flats`.

⚠️ Quirks found live: `property_sub_type=flats` is oddly **restrictive**
(returned ~1 result where the unfiltered page had 25) — a coverage caveat
for *flat* searches (houses unaffected). `property_sub_type=maisonette`
is **ignored** (returns the full unfiltered set) — not a valid standalone
token, don't add it.

| Param | Values | Status |
|---|---|---|
| route | path `/to-rent/property/london/<outcode>/` vs `/search/?q=` | ✅ (London → path) |
| `property_sub_type` | repeated built-forms (above); **path route only** | ✅ |
| `price_min`/`price_max` | PCM (`price_frequency=per_month`) | ✅ |
| `beds_min`/`beds_max` | int | ✅ |
| `baths_min`/`baths_max` | int | ✅ (we send via filters) |
| `radius` | miles | ✅ |
| `furnished_state` | `furnished`/`unfurnished` | ✅ |
| `feature` | `has_garden`, `has_parking_garage` (repeated) | ✅ |
| `pets_allowed` | `true` | ✅ |
| `is_shared_accommodation` / `is_student_accommodation` / `is_retirement_home` | `false` | ✅ |
| `added` | `24_hours`/`3_days`/`7_days`/`14_days` | ✅ |
| `include_let_agreed` | `false` | ✅ |

---

## Correctness vs coverage

Correctness (never show the wrong type) is guaranteed for **all** portals
by the read-time + scrape-time backstop (`listingMatchesPropertyTypes`),
independent of what each URL honours. The URL params are about **coverage
+ efficiency** (don't waste page-depth on listings the backstop will drop).

Open opportunities:
1. **OpenRent `/houses` path** — filter at source (needs the PROPERTYIDS
   parser path; single-type only).
2. **Zoopla `flats` restrictiveness** — flat searches may under-fetch;
   investigate the correct flat token(s) if flat coverage matters.
3. **OpenRent `acceptNonStudents` casing** — confirm `AcceptNonStudents`.
