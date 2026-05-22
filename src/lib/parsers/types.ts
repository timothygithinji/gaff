/**
 * Shared types for portal HTML parsers.
 *
 * The parsers are pure `(html) => result` functions — they consume a raw
 * HTML string and return strictly-typed output, leaving missing optional
 * fields as `undefined` rather than `null` or empty string. They throw
 * only when the root data structure for a page (e.g. `__NEXT_DATA__`,
 * `__PAGE_MODEL`, or RSC flight chunks) cannot be located — that is a
 * "page-shape changed" signal worth surfacing loudly.
 */

export type Portal = "rightmove" | "zoopla" | "openrent";

export type Furnished = "furnished" | "unfurnished" | "part_furnished";

export interface NearestStation {
  name: string;
  distanceMiles?: number;
  types?: string[];
}

export interface ListingSummary {
  portal: Portal;
  portalListingId: string;
  url: string;
  title: string;
  addressRaw: string;
  postcode?: string;
  bedrooms?: number;
  bathrooms?: number;
  priceMonthly?: number;
  propertyType?: string;
  lat?: number;
  lng?: number;
}

export interface ListingDetail extends ListingSummary {
  description?: string;
  availableFrom?: string;
  furnished?: Furnished;
  deposit?: number;
  photos: string[];
  floorplanUrl?: string;
  agentName?: string;
  agentPhone?: string;
  keyFeatures?: string[];
  epcRating?: string;
  nearestStations?: NearestStation[];
}
