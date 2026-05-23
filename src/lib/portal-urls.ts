/**
 * Search-page URL builders for the three rental portals.
 *
 * Each function takes a normalised filter object (one outcode + the
 * search row's bed/price/propertyType constraints) and returns the full
 * URL we hand to Zyte.
 *
 * Notes / quirks:
 *
 *   - Rightmove requires a numeric `locationIdentifier` (resolved upstream
 *     via `resolveRightmoveLocationIdentifier`). The plain outcode string
 *     does not work — Rightmove silently returns a "not found" page.
 *   - Zoopla's URL embeds the outcode as a path segment, lowercased.
 *   - OpenRent uses `term=` and resolves loosely; we keep the literal
 *     outcode string as-is.
 *   - `propertyTypes` maps to portal-specific tokens (Rightmove: comma
 *     joined; Zoopla: single `property_sub_type`; OpenRent: not supported
 *     in the URL — filtered downstream by the parser).
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
 *     comma list. Zoopla uses path selection (default `/property/` path
 *     already hides student-accommodation and retirement-homes which
 *     have their own paths) plus explicit `is_shared_accommodation=false`
 *     for house-share. OpenRent only supports `acceptStudents=false`;
 *     it has no retirement-homes or house-share categories at all, so
 *     those exclusions are no-ops on OR (nothing to hide).
 */

export type Furnished = "furnished" | "unfurnished";
export type MustHave = "garden" | "parking" | "pets";
export type Exclusion = "student" | "retirement" | "house_share";

export type PortalSearchParams = {
  outcode: string;
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
   * `resolveRightmoveLocationIdentifier` in `rightmove-location.ts`.
   */
  locationIdentifier: string;
  /**
   * Caller-derived cap on listing age (in days). Driven from cadence in
   * `scrape-portal.ts` — hourly → 1, 2/4/6h → 3, 12h/daily → 7.
   * Omitted from the URL when `undefined`.
   */
  maxDaysSinceAdded?: number;
};

export function rightmoveSearchUrl(params: RightmoveSearchUrlParams): string {
  const usp = new URLSearchParams();
  usp.set("locationIdentifier", params.locationIdentifier);
  usp.set("searchType", "RENT");
  usp.set("radius", "0.0");
  usp.set("sortType", "6"); // newest listings first
  usp.set("index", "0");
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

/**
 * Zoopla's to-rent search URL embeds the outcode as a path segment
 * under `/to-rent/<category>/london/<outcode>/`. We always use the
 * `property` category — student-accommodation and retirement-homes
 * have their own paths, so "exclude student/retirement" is implicit
 * via path selection (no URL param needed).
 *
 * Must-haves use the `feature=<key>` pattern, REPEATED (not comma-
 * joined) for multiple features. `pets_allowed=true` is its own
 * top-level param, not under `feature=`. House-share is filtered via
 * `is_shared_accommodation=false` (default behaviour already excludes
 * shared, but we set explicitly when the user toggles "hide").
 *
 * The "london" segment is hard-coded — until we add a city resolver,
 * Zoopla searches outside London will misroute.
 */
export function zooplaSearchUrl(params: PortalSearchParams): string {
  const outcode = params.outcode.toLowerCase();
  const usp = new URLSearchParams();
  usp.set("price_frequency", "per_month");
  usp.set("results_sort", "newest_listings");
  usp.set("search_source", "to-rent");
  usp.set("pn", "1");
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
  if (params.propertyTypes && params.propertyTypes.length > 0) {
    // Zoopla wants a single sub-type — first one wins.
    const firstType = params.propertyTypes[0]?.toLowerCase();
    if (firstType) {
      usp.set("property_sub_type", firstType);
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
  // Exclusions:
  //   - student / retirement: handled by the `/property/` path —
  //     they live under `/student-accommodation/` and `/retirement-
  //     homes/` respectively, so the default path already hides them.
  //   - house_share: shared accommodation is hidden by default, but
  //     we set explicitly when the user enables the toggle so the
  //     intent is visible in the URL and resilient if Zoopla's
  //     default changes.
  if (params.exclusions?.includes("house_share")) {
    usp.set("is_shared_accommodation", "false");
  }
  return `https://www.zoopla.co.uk/to-rent/property/london/${outcode}/?${usp.toString()}`;
}

// -----------------------------------------------------------------------------
// OpenRent
// -----------------------------------------------------------------------------

/**
 * OpenRent's search URL params (verified against a real OR URL with
 * the corresponding UI toggles enabled):
 *
 *   - Furnished: `furnishedType` is an INTEGER code, not a string:
 *     1 = Furnished, 2 = Unfurnished, 3 = Either (omit for "any").
 *   - Must-haves: `hasGarden=true`, `hasParking=true`,
 *     `acceptPets=true`. NB the param names differ from RM/ZP and
 *     OpenRent's own "acceptPets" is in the same group as the "accept
 *     X tenant" filters, not its own group.
 *   - Exclusions: only `student` has a URL handle
 *     (`acceptStudents=false`). OpenRent has no retirement-homes or
 *     house-share categories at all, so those exclusions are no-ops
 *     on OR — nothing to hide.
 *
 * `isLive=true` is OpenRent's equivalent of "exclude let-agreed".
 * `within=1` caps the radius around the term at 1 mile.
 *
 * OpenRent's own URL doesn't include `propertyType` — left out here
 * to keep the URL clean. Property-type filtering on OR is parser-side.
 */
export function openrentSearchUrl(params: PortalSearchParams): string {
  const usp = new URLSearchParams();
  usp.set("term", params.outcode);
  usp.set("within", "1");
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
    // `acceptStudents=false` hides listings marketed to students.
    // `retirement` and `house_share` no-op on OR — those categories
    // don't exist on the platform.
    usp.set("acceptStudents", "false");
  }
  return `https://www.openrent.co.uk/properties-to-rent/?${usp.toString()}`;
}
