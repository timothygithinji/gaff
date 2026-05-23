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

/**
 * Tenant-acceptance flags. All optional — `undefined` means the portal
 * didn't say (treat as "unknown", not "no"). OpenRent surfaces these
 * directly via labelled fields; Rightmove/Zoopla mostly leave them to
 * the description + AI enrichment.
 */
export interface TenantPreferences {
  studentsAccepted?: boolean;
  familiesAccepted?: boolean;
  petsAccepted?: boolean;
  smokersAccepted?: boolean;
  dssAccepted?: boolean;
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

  // ---- gap-fill fields (PR: parser expansion) -----------------------------

  /** Floor area in square feet. Rightmove `sizings` / Zoopla `floorArea`. */
  sizeSqFt?: number;
  /** Council tax band letter (A–H typically). Rightmove `livingCosts.councilTaxBand`. */
  councilTaxBand?: string;
  /** When the listing was first published on the portal. ISO 8601 string. */
  publishedAt?: string;
  /** Minimum tenancy length in months. */
  minimumTermMonths?: number;
  /** Free-text let type — "Long term", "Short term", "Holiday", etc. */
  letType?: string;
  /** Service charge per year, in GBP. */
  serviceChargeAnnual?: number;
  /** Ground rent per year, in GBP. */
  groundRentAnnual?: number;
  /** Embedded video URLs (Zoopla `embeddedContent.videos`). */
  videos?: string[];
  /** First virtual-tour URL when available. */
  virtualTourUrl?: string;
  /** Agent's parent company (Rightmove `customer.companyName`). */
  agentCompany?: string;
  /** Absolute URL to the agent's branch page on the portal. */
  agentBranchUrl?: string;
  /** Tenancy fees / disclosures text — required by UK letting rules. */
  feesText?: string;
  /** Free-form badge labels — "Just added", "New build", etc. */
  tags?: string[];
  /** Closed-set tenant-acceptance booleans (see TenantPreferences). */
  tenantPreferences?: TenantPreferences;
  /** True when the listed rent includes all bills. */
  billsIncluded?: boolean;
}
