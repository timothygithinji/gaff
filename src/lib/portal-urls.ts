/**
 * Search-page URL builders for the three rental portals.
 *
 * Each function takes a normalised filter object (location ref + the
 * search row's bed/price/propertyType constraints + the user-picked
 * radius) and returns the full URL we hand to Zyte.
 *
 * Notes / quirks:
 *
 *   - Rightmove requires a numeric `locationIdentifier` (resolved upstream
 *     via `resolveRightmove` in `portal-locations.ts`). The plain outcode
 *     string does not work — Rightmove silently returns a "not found" page.
 *     Radius is sent as `radius=<miles>` (decimal); `0.0` means "this
 *     area only".
 *   - Zoopla has two routes and we use BOTH: the path route
 *     `/to-rent/property/london/<outcode>/` for London outcodes (the only
 *     route that honours `property_sub_type` — verified live), and the
 *     free-text `/search/?section=to-rent&q=...` route for everything else
 *     (cities, sublocalities, non-London outcodes) where we can't derive a
 *     region slug. The free-text route scopes any place server-side but
 *     silently ignores `property_sub_type`, so type filtering there falls
 *     to the read-time/scrape-time backstop. Radius is `radius=<miles>`
 *     (decimal); `0` means "this area only".
 *   - OpenRent uses `term=` and `area=<km integer>`; we pass the place's
 *     display name and convert the user's miles → km (rounded) at
 *     URL-build time, floored at OR's UI minimum of 2km. The older
 *     `within=` param is no longer honoured.
 *   - `propertyTypes` maps to portal-specific tokens (Rightmove: comma
 *     joined `propertyTypes`; Zoopla: repeated `property_sub_type`, with
 *     "house" expanded to its built-forms, and only on the path route;
 *     OpenRent: not supported in the URL — enforced by the backstop). The
 *     read-time/scrape-time backstop (`listingMatchesPropertyTypes`)
 *     guarantees correctness regardless of what each portal's URL honours.
 *   - Silent-win defaults: Rightmove gets `includeLetAgreed=false` and
 *     `letType=longTerm` baked in. Zoopla gets `include_let_agreed=false`.
 *     OpenRent's existing `isLive=true` is the equivalent — leave alone.
 *   - Bathrooms: Rightmove has no URL param — filtered parser-side in
 *     `scrape-portal.ts`. Zoopla takes `baths_min` / `baths_max`. OpenRent
 *     only honours `bathrooms_min`.
 *   - Furnished: Rightmove `furnishTypes=<value>`, Zoopla
 *     `furnished_state=<value>`, OpenRent `furnishedType=<1|2>`
 *     (integer code). Omit param when `null`.
 *   - Must-haves: Rightmove `mustHave=garden,parking` (comma list; pets
 *     falls to parser-side). Zoopla `feature=has_garden` repeated, plus
 *     `pets_allowed=true` as its own param. OpenRent `hasGarden=true`
 *     / `hasParking=true` / `acceptPets=true` each as its own param.
 *   - Exclusions: Rightmove `dontShow=student,retirement,houseShare`
 *     comma list. Zoopla uses explicit `is_shared_accommodation=false` /
 *     `is_student_accommodation=false` / `is_retirement_home=false` per
 *     enabled category. OpenRent only supports `acceptNonStudents=true`
 *     ("Accepts non-students"); it has no retirement-homes or house-share
 *     categories at all, so those exclusions are no-ops on OR (nothing to
 *     hide).
 */

// Search-filter furnished states (two-valued): the portals' search UIs
// only offer furnished/unfurnished as filters. Distinct from the
// three-valued parsed-listing `Furnished` in `parsers/types.ts`, which
// also models `part_furnished`. Local to this module.
type Furnished = "furnished" | "unfurnished";
export type MustHave = "garden" | "parking" | "pets";
export type Exclusion = "student" | "retirement" | "house_share";

/**
 * Shared filter params — every portal builder consumes some subset.
 * The location-specific bits (Zoopla `q`, OpenRent `term`, Rightmove
 * `locationIdentifier`) are passed via portal-specific params types
 * because their shapes diverge. `radiusMiles` is shared and required —
 * it lives on the search row, not the location.
 */
export type PortalSearchParams = {
  /**
   * User-picked search radius in miles. Sent to Rightmove + Zoopla
   * as-is (decimal); converted to a km integer for OpenRent.
   * `0` means "this area only" — strict to the resolved location.
   */
  radiusMiles: number;
  minBedrooms?: number | null;
  maxBedrooms?: number | null;
  minBathrooms?: number | null;
  maxBathrooms?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  /**
   * Property type tokens as stored on `searches.propertyTypes`. Treated
   * portal-by-portal — Rightmove understands "flat", "house", "bungalow";
   * Zoopla wants a single value so we pick the first.
   */
  propertyTypes?: string[];
  /** `null` / undefined = no filter; otherwise lowercased portal-side. */
  furnished?: Furnished | null;
  /** Subset of {garden, parking, pets}; empty array = no must-have filter. */
  mustHaves?: MustHave[];
  /**
   * Listing categories to hide. Per-portal:
   *   - Rightmove: `dontShow=studentLet,retirement,houseShare`
   *   - Zoopla: `include_student_accommodation=false` etc per category
   *   - OpenRent: not URL-supported — parser-side filter
   */
  exclusions?: Exclusion[];
};

/**
 * Rightmove's `dontShow` vocab. The student-let token is just
 * `student` (NOT `studentLet` — that one returns an empty page on the
 * rental search). Tokens cross-checked against a live Rightmove URL
 * with the corresponding UI checkbox toggled.
 */
const RM_EXCLUSION_MAP: Record<Exclusion, string> = {
  student: "student",
  retirement: "retirement",
  house_share: "houseShare",
};

// -----------------------------------------------------------------------------
// Rightmove
// -----------------------------------------------------------------------------

export type RightmoveSearchUrlParams = Omit<PortalSearchParams, "outcode"> & {
  /**
   * Rightmove `locationIdentifier`, already resolved to its full form
   * (e.g. `OUTCODE^1668` for N11). Resolve via
   * `resolveRightmove` in `src/lib/portal-locations.ts`.
   */
  locationIdentifier: string;
  /**
   * Caller-derived cap on listing age (in days). Driven from cadence in
   * `scrape-portal.ts` — hourly → 1, 2/4/6h → 3, 12h/daily → 7.
   * Omitted from the URL when `undefined`.
   */
  maxDaysSinceAdded?: number;
  /**
   * Pagination offset. Rightmove pages by `index` as a 0-based offset
   * stepping by {@link RIGHTMOVE_RESULTS_PER_PAGE} (24). Defaults to 0
   * (first page). The scrape loop walks index 0, 24, 48 … up to
   * {@link RIGHTMOVE_MAX_PAGES}.
   */
  index?: number;
};

/** Rightmove returns 24 cards per `index` step. */
export const RIGHTMOVE_RESULTS_PER_PAGE = 24;
/** Rightmove caps search depth at 42 pages (~1,008 results). */
export const RIGHTMOVE_MAX_PAGES = 42;

export function rightmoveSearchUrl(params: RightmoveSearchUrlParams): string {
  const usp = new URLSearchParams();
  usp.set("locationIdentifier", params.locationIdentifier);
  usp.set("searchType", "RENT");
  usp.set("radius", params.radiusMiles.toFixed(2));
  usp.set("sortType", "6"); // newest listings first
  usp.set("index", String(params.index ?? 0));
  // Silent-win defaults — every Gaff search wants long-term lets only
  // and never wants already-let-agreed properties clogging the queue.
  usp.set("includeLetAgreed", "false");
  usp.set("letType", "longTerm");
  if (typeof params.minPrice === "number") {
    usp.set("minPrice", String(params.minPrice));
  }
  if (typeof params.maxPrice === "number") {
    usp.set("maxPrice", String(params.maxPrice));
  }
  if (typeof params.minBedrooms === "number") {
    usp.set("minBedrooms", String(params.minBedrooms));
  }
  if (typeof params.maxBedrooms === "number") {
    usp.set("maxBedrooms", String(params.maxBedrooms));
  }
  if (params.propertyTypes && params.propertyTypes.length > 0) {
    usp.set(
      "propertyTypes",
      params.propertyTypes.map((t) => t.toLowerCase()).join(",")
    );
  }
  if (params.furnished) {
    usp.set("furnishTypes", params.furnished);
  }
  if (params.mustHaves && params.mustHaves.length > 0) {
    // RM `mustHave` is a comma list; `pets` is not URL-supported and
    // gets filtered downstream in `scrape-portal.ts`.
    const supported = params.mustHaves.filter(
      (m) => m === "garden" || m === "parking"
    );
    if (supported.length > 0) {
      usp.set("mustHave", supported.join(","));
    }
  }
  if (typeof params.maxDaysSinceAdded === "number") {
    usp.set("maxDaysSinceAdded", String(params.maxDaysSinceAdded));
  }
  if (params.exclusions && params.exclusions.length > 0) {
    usp.set(
      "dontShow",
      params.exclusions.map((e) => RM_EXCLUSION_MAP[e]).join(",")
    );
  }
  return `https://www.rightmove.co.uk/property-to-rent/find.html?${usp.toString()}`;
}

// -----------------------------------------------------------------------------
// Zoopla
// -----------------------------------------------------------------------------

export type ZooplaSearchUrlParams = PortalSearchParams & {
  /**
   * Free-text query passed to Zoopla's `/search/` route, resolved
   * server-side. We pass Google's `formattedAddress` so the place
   * is unambiguous ("Camden Town, London NW1, UK" vs bare "Camden"
   * which Zoopla bounces to a disambiguation page).
   */
  q: string;
  /**
   * Pagination — Zoopla pages by `pn` (1-based). Defaults to 1. The
   * scrape loop walks pn 1, 2, 3 … up to {@link ZOOPLA_MAX_PAGES}.
   */
  pn?: number;
  /**
   * Listing-age cap, Zoopla's `added` enum. Map from cadence days via
   * {@link zooplaAddedFromDays}. Omitted from the URL when `undefined`
   * ("Anytime"). Zoopla has no numeric day param — only this enum.
   */
  added?: ZooplaAdded;
};

/**
 * Map each form-level property-type token (`searches.propertyTypes`) to
 * Zoopla's `property_sub_type` vocabulary. Zoopla has no umbrella "house"
 * token — it's decomposed into the individual built-forms below (verified
 * live: requesting these returns houses only, zero flats). The param is
 * REPEATABLE; we `append` one per token.
 *
 * NB: "flat" is deliberately NOT mapped. Verified live, the only valid
 * Zoopla flat token (`flats`) is catastrophically restrictive — it
 * returned 1 of 21 flats on a page — and every other candidate (`flat`,
 * `apartment`, `purpose_built_flat`, …) is silently ignored (returns the
 * full unfiltered set). So a flat-only search gets BETTER coverage by
 * omitting `property_sub_type` and letting the backstop drop non-flats
 * from the full set. "other" is likewise unmapped. Any selected type
 * that isn't here makes {@link zooplaSubTypes} omit the filter entirely.
 */
const ZOOPLA_SUBTYPE_MAP: Record<string, string[]> = {
  house: [
    "detached",
    "semi_detached",
    "terraced",
    "end_terrace",
    "town_house",
    "mews",
    "cottage",
  ],
  bungalow: ["bungalow"],
};

/**
 * Expand the search's form-level property types into Zoopla sub-type
 * tokens. Returns `null` (→ omit the filter, fetch everything, let the
 * backstop drop mismatches) when there's nothing to filter or any selected
 * type is unmappable ("flat"/"other") — sending a partial filter would
 * silently drop the unmappable type at the portal, which the backstop
 * can't undo. So the filter is applied ONLY for pure house/bungalow
 * combinations, where Zoopla's tokens are reliable.
 */
function zooplaSubTypes(types: string[] | undefined): string[] | null {
  if (!types || types.length === 0) {
    return null;
  }
  const out: string[] = [];
  for (const t of types) {
    const mapped = ZOOPLA_SUBTYPE_MAP[t.toLowerCase()];
    if (!mapped) {
      return null;
    }
    out.push(...mapped);
  }
  return out;
}

/**
 * The eight London postal-area letter groups. An outcode whose area
 * letters are one of these resolves under Zoopla's `/to-rent/property/
 * london/<outcode>/` PATH route — the only route that honours
 * `property_sub_type` (the free-text `/search/?q=` route silently ignores
 * it). Verified live for E/EC/N/NW/SE/SW/W/WC. Outer Greater-London codes
 * (EN, HA, BR, …) are deliberately excluded: their Zoopla region slug
 * isn't `london`, and a wrong path returns zero results.
 */
const LONDON_OUTCODE_AREAS = new Set([
  "E",
  "EC",
  "N",
  "NW",
  "SE",
  "SW",
  "W",
  "WC",
]);
const OUTCODE_HEAD_RE = /^([A-Z]{1,2})[0-9][A-Z0-9]?$/;

/**
 * If the Zoopla `q` is (or starts with) a London outcode, return the bare
 * uppercased outcode so the caller can build the path route; otherwise
 * `null`. Handles both the per-outcode area refs (`q = "NW3"`) and the
 * postal_code free-text ref (`q = "NW3, London, UK"`). A locality name
 * ("Camden Town, …") yields `null` → free-text route + backstop.
 */
function londonOutcode(q: string): string | null {
  const head = (q.split(",")[0] ?? "").trim().toUpperCase();
  const m = head.match(OUTCODE_HEAD_RE);
  if (!m?.[1]) {
    return null;
  }
  return LONDON_OUTCODE_AREAS.has(m[1]) ? head : null;
}

/** Zoopla returns 25 cards per page. */
export const ZOOPLA_RESULTS_PER_PAGE = 25;
/** Zoopla caps search depth at 40 pages (~1,000 results). */
export const ZOOPLA_MAX_PAGES = 40;

/** Accepted values of Zoopla's `added` recency filter (rentals). */
export type ZooplaAdded = "24_hours" | "3_days" | "7_days" | "14_days";

/**
 * Map a cadence "max days since added" to the nearest Zoopla `added`
 * enum that is >= the window, so the recency filter never hides a
 * listing the window should include. 1 → 24_hours, 2-3 → 3_days,
 * 4-7 → 7_days, 8-14 → 14_days, larger/undefined → undefined (Anytime,
 * used by backfill).
 */
export function zooplaAddedFromDays(days: number | undefined): ZooplaAdded | undefined {
  if (days == null) {
    return undefined;
  }
  if (days <= 1) {
    return "24_hours";
  }
  if (days <= 3) {
    return "3_days";
  }
  if (days <= 7) {
    return "7_days";
  }
  if (days <= 14) {
    return "14_days";
  }
  return undefined;
}

/**
 * Zoopla's free-text search route accepts any human-readable place
 * via `q=`. Confirmed equivalent to the legacy path-based URL for
 * postcodes (`/london/nw3/`) and correctly scopes for cities and
 * sublocalities. Bbox / lat-lng params are silently ignored, but
 * `radius=0` IS honoured and pins results to the resolved `q` area
 * with no surrounding buffer (matches the "this area only" toggle in
 * Zoopla's UI).
 *
 * Must-haves use the `feature=<key>` pattern, REPEATED (not comma-
 * joined). `pets_allowed=true` is its own top-level param. House-share
 * exclusion is `is_shared_accommodation=false` (default already
 * hides; we set explicitly so the intent is visible).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat sequence of conditional `usp.set(...)` calls mapping each search param to Zoopla's query string — the branches are independent and splitting would just scatter the URL contract.
export function zooplaSearchUrl(params: ZooplaSearchUrlParams): string {
  const usp = new URLSearchParams();
  usp.set("radius", params.radiusMiles.toFixed(2));
  usp.set("price_frequency", "per_month");
  usp.set("results_sort", "newest_listings");
  usp.set("search_source", "to-rent");
  usp.set("pn", String(params.pn ?? 1));
  if (params.added) {
    usp.set("added", params.added);
  }
  // Silent-win default — never surface already-let-agreed listings.
  usp.set("include_let_agreed", "false");
  if (typeof params.minPrice === "number") {
    usp.set("price_min", String(params.minPrice));
  }
  if (typeof params.maxPrice === "number") {
    usp.set("price_max", String(params.maxPrice));
  }
  if (typeof params.minBedrooms === "number") {
    usp.set("beds_min", String(params.minBedrooms));
  }
  if (typeof params.maxBedrooms === "number") {
    usp.set("beds_max", String(params.maxBedrooms));
  }
  if (typeof params.minBathrooms === "number") {
    usp.set("baths_min", String(params.minBathrooms));
  }
  if (typeof params.maxBathrooms === "number") {
    usp.set("baths_max", String(params.maxBathrooms));
  }
  // `property_sub_type` is REPEATABLE and only honoured on the path route
  // below; we still append it on the free-text route (harmless, ignored)
  // and rely on the read-time/scrape-time backstop there. `house` has no
  // single Zoopla token — it expands to several built-forms.
  const subTypes = zooplaSubTypes(params.propertyTypes);
  if (subTypes) {
    for (const st of subTypes) {
      usp.append("property_sub_type", st);
    }
  }
  if (params.furnished) {
    usp.set("furnished_state", params.furnished);
  }
  if (params.mustHaves) {
    for (const mh of params.mustHaves) {
      if (mh === "garden") {
        usp.append("feature", "has_garden");
      } else if (mh === "parking") {
        usp.append("feature", "has_parking_garage");
      } else if (mh === "pets") {
        usp.set("pets_allowed", "true");
      }
    }
  }
  // Exclusions — explicit `is_*=false` params, verified live against a
  // real Zoopla URL. Each defaults to hidden, but we set it explicitly so
  // the intent is visible and resilient to Zoopla's defaults changing.
  if (params.exclusions?.includes("house_share")) {
    usp.set("is_shared_accommodation", "false");
  }
  if (params.exclusions?.includes("student")) {
    usp.set("is_student_accommodation", "false");
  }
  if (params.exclusions?.includes("retirement")) {
    usp.set("is_retirement_home", "false");
  }
  // Route choice: Zoopla only honours `property_sub_type` on the path
  // route `/to-rent/property/london/<outcode>/`. Use it when `q` resolves
  // to a London outcode; otherwise fall back to the free-text `/search/`
  // route (which scopes arbitrary localities server-side but ignores the
  // type filter — the backstop covers that case).
  const outcode = londonOutcode(params.q);
  if (outcode) {
    usp.set("q", outcode);
    return `https://www.zoopla.co.uk/to-rent/property/london/${outcode.toLowerCase()}/?${usp.toString()}`;
  }
  usp.set("section", "to-rent");
  usp.set("category", "residential");
  usp.set("q", params.q);
  return `https://www.zoopla.co.uk/search/?${usp.toString()}`;
}

// -----------------------------------------------------------------------------
// OpenRent
// -----------------------------------------------------------------------------

/**
 * OpenRent's search URL params.
 *
 * IMPORTANT: OpenRent applies ALL of these filters CLIENT-SIDE in JS, so
 * they only take effect when the page is fetched with a real browser
 * (`browserHtml: true` in `scrape-portal.ts`). A raw HTTP fetch returns
 * the unfiltered default result set and silently ignores every param
 * below — that's the OpenRent leak `audit-filter-leaks.ts` was written
 * for. Don't "optimise" OR back to a plain HTTP fetch.
 *
 *   - Furnished: `furnishedType` is an INTEGER code, not a string:
 *     1 = Furnished, 2 = Unfurnished, 3 = Either (omit for "any").
 *   - Must-haves: `hasGarden=true`, `hasParking=true`,
 *     `acceptPets=true`. NB the param names differ from RM/ZP and
 *     OpenRent's own "acceptPets" is in the same group as the "accept
 *     X tenant" filters, not its own group.
 *   - Exclusions: only `student` has a URL handle — `acceptNonStudents=true`
 *     ("Accepts non-students"), which hides student-only lets. (The
 *     inverse `acceptStudents=false` is NOT honoured.) OpenRent has no
 *     retirement-homes or house-share categories at all, so those
 *     exclusions are no-ops on OR — nothing to hide.
 *
 * `isLive=true` is OpenRent's equivalent of "exclude let-agreed".
 * `area=<km integer>` caps the radius around the term. We accept the
 * user's pick in miles (matches the RM/ZP unit), convert to km and
 * round to an integer because OR only honours whole-km values, then
 * floor at 2 — OR's UI minimum, which OR will silently widen to
 * anyway. The older `within=` param is no longer honoured.
 *
 * OpenRent's own URL doesn't include `propertyType` — left out here
 * to keep the URL clean. Property-type filtering on OR is parser-side.
 */
export type OpenrentSearchUrlParams = PortalSearchParams & {
  /** Free-text `term=` value, e.g. "NW3" or "Camden Town". */
  term: string;
};

/** Miles per kilometre. Used to convert the user's miles pick → OR's km. */
const KM_PER_MILE = 1.609344;

/**
 * Convert the user's miles radius to a km integer suitable for
 * OpenRent's `area=` param. Floored at 2 (OR's UI minimum — anything
 * below silently widens to 2 server-side, so we make the URL honest).
 */
function milesToOpenrentAreaKm(miles: number): number {
  const km = Math.round(miles * KM_PER_MILE);
  return Math.max(2, km);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat sequence of conditional `usp.set(...)` calls mapping each search param to OpenRent's query string — the branches are independent and splitting would just scatter the URL contract.
export function openrentSearchUrl(params: OpenrentSearchUrlParams): string {
  const usp = new URLSearchParams();
  usp.set("term", params.term);
  usp.set("area", String(milesToOpenrentAreaKm(params.radiusMiles)));
  usp.set("isLive", "true");
  if (typeof params.minPrice === "number") {
    usp.set("prices_min", String(params.minPrice));
  }
  if (typeof params.maxPrice === "number") {
    usp.set("prices_max", String(params.maxPrice));
  }
  if (typeof params.minBedrooms === "number") {
    usp.set("bedrooms_min", String(params.minBedrooms));
  }
  if (typeof params.maxBedrooms === "number") {
    usp.set("bedrooms_max", String(params.maxBedrooms));
  }
  // OpenRent only honours bathrooms_min (no max equivalent).
  if (typeof params.minBathrooms === "number") {
    usp.set("bathrooms_min", String(params.minBathrooms));
  }
  if (params.furnished) {
    // Numeric code: 1 = Furnished, 2 = Unfurnished.
    usp.set("furnishedType", params.furnished === "furnished" ? "1" : "2");
  }
  if (params.mustHaves) {
    for (const mh of params.mustHaves) {
      if (mh === "garden") {
        usp.set("hasGarden", "true");
      } else if (mh === "parking") {
        usp.set("hasParking", "true");
      } else if (mh === "pets") {
        usp.set("acceptPets", "true");
      }
    }
  }
  if (params.exclusions?.includes("student")) {
    // `acceptNonStudents=true` ("Accepts non-students") hides student-only
    // lets — verified live to actually filter under the browser tier,
    // unlike the `acceptStudents=false` we used to send (no-op). `retirement`
    // is genuinely not a category on OR. `house_share` IS a category (OR
    // returns `Room in a Shared Flat` / `Room in a Shared House` listings) but
    // has no URL switch — see `filterByExclusions` in
    // `src/trigger/scrape-portal.ts` for the post-scrape drop and
    // `listingPassesExclusions` in `src/server/functions/review.ts` for the
    // read-time backstop.
    usp.set("acceptNonStudents", "true");
  }
  return `https://www.openrent.co.uk/properties-to-rent/?${usp.toString()}`;
}
