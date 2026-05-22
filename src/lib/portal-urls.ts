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
 */

export type PortalSearchParams = {
  outcode: string;
  minBedrooms?: number | null;
  maxBedrooms?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  /**
   * Property type tokens as stored on `searches.propertyTypes`. Treated
   * portal-by-portal — Rightmove understands "flat", "house", "bungalow";
   * Zoopla wants a single value so we pick the first.
   */
  propertyTypes?: string[];
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
};

export function rightmoveSearchUrl(params: RightmoveSearchUrlParams): string {
  const usp = new URLSearchParams();
  usp.set("locationIdentifier", params.locationIdentifier);
  usp.set("searchType", "RENT");
  usp.set("radius", "0.0");
  usp.set("sortType", "6"); // newest listings first
  usp.set("index", "0");
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
  if (params.propertyTypes && params.propertyTypes.length > 0) {
    // Zoopla wants a single sub-type — first one wins.
    const firstType = params.propertyTypes[0]?.toLowerCase();
    if (firstType) {
      usp.set("property_sub_type", firstType);
    }
  }
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
  return `https://www.openrent.co.uk/properties-to-rent/?${usp.toString()}`;
}
