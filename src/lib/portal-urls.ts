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
 *   - Furnished: Rightmove `furnishTypes`, Zoopla `furnished_state`,
 *     OpenRent `furnishing` (capitalised value). Omit param when `null`.
 *   - Must-haves: Rightmove `mustHave` is a comma list of {garden,parking};
 *     pets is not URL-supported and falls to parser-side filtering.
 *     Zoopla has no URL equivalents — all three are parser-side.
 *     OpenRent takes `garden=true` / `parking=true` / `pets=true` each.
 */

export type Furnished = "furnished" | "unfurnished";
export type MustHave = "garden" | "parking" | "pets";

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
  return `https://www.rightmove.co.uk/property-to-rent/find.html?${usp.toString()}`;
}

// -----------------------------------------------------------------------------
// Zoopla
// -----------------------------------------------------------------------------

/**
 * Zoopla's to-rent search URL embeds the outcode as a path segment
 * under `/to-rent/property/london/<outcode>/`. The "london" segment is
 * Zoopla's way of disambiguating outcodes across the country — for now
 * we hardcode it; PR 9.5 + onwards can revisit when we widen geo.
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
  // Zoopla has no URL params for garden / parking / pets — must-haves
  // are applied parser-side in `scrape-portal.ts`.
  return `https://www.zoopla.co.uk/to-rent/property/london/${outcode}/?${usp.toString()}`;
}

// -----------------------------------------------------------------------------
// OpenRent
// -----------------------------------------------------------------------------

/**
 * OpenRent's search URL doesn't take property type — the filter is
 * applied client-side via JS we don't run. We pass the constraint along
 * anyway via `prices_*` / `bedrooms_*` and rely on the parser to drop
 * non-matching results downstream.
 *
 * `isLive=true` is OpenRent's equivalent of "exclude let-agreed" — kept
 * on by default.
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
  if (params.propertyTypes && params.propertyTypes.length > 0) {
    // OpenRent's docs are silent; smoke didn't error so we try one value
    // (first wins). Worst case the OR parser drops anything mis-typed.
    const firstType = params.propertyTypes[0]?.toLowerCase();
    if (firstType) {
      usp.set("propertyType", firstType);
    }
  }
  if (params.furnished) {
    // OpenRent expects capitalised values.
    const v = params.furnished === "furnished" ? "Furnished" : "Unfurnished";
    usp.set("furnishing", v);
  }
  if (params.mustHaves) {
    for (const mh of params.mustHaves) {
      usp.set(mh, "true");
    }
  }
  return `https://www.openrent.co.uk/properties-to-rent/?${usp.toString()}`;
}
