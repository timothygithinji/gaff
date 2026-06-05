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

  // ---- parser expansion PR (portal data we were leaving on the floor) ----

  /**
   * Whether the portal-reported lat/lng is the exact pin or a fudged
   * area centroid. Rightmove only — `location.pinType === "ACCURATE_POINT"`
   * vs `"ESTIMATE"`. `undefined` when the portal didn't say.
   *
   * Read at enrichment time to gate radius-based queries (flood,
   * amenities) — when the coords aren't trustworthy we shouldn't claim
   * a 1mi area stat is meaningful.
   */
  coordsAccurate?: boolean;

  /**
   * Rightmove's structured Material Information block — statutory UK
   * disclosure. Values are free-text labels the portal renders directly
   * ("Gas central heating", "Off street", "Mains supply", …). Use these
   * instead of asking the AI to infer the same facts from the prose.
   */
  materialInfo?: {
    heating?: string;
    parking?: string;
    garden?: string;
    electricity?: string;
    water?: string;
    sewerage?: string;
    accessibility?: string;
  };

  /**
   * Landlord-disclosed historic flooding info (Rightmove
   * `features.risks.*`) — the agent's personal answers to RM's
   * statutory questions for THIS property.
   */
  floodDisclosure?: {
    floodedInLastFiveYears?: boolean;
    floodDefences?: boolean;
    floodSources?: string[];
  };

  /**
   * True when the property is in a listed building. Rightmove
   * `features.obligations.listed`. Has real implications (no satellite
   * dishes, restricted alterations).
   */
  listedBuilding?: boolean;

  /**
   * Portal-reported view counter (e.g. "527 views"). OpenRent only.
   * Useful as a popularity signal for the digest.
   */
  viewCount?: number;

  /**
   * Rightmove's internal property reference (from `text.disclaimer`,
   * e.g. "Property reference 31242395"). Stable across portal-listing-id
   * churn — useful for cluster dedupe when an agent re-uploads.
   */
  internalRef?: string;

  /**
   * Agent brochure PDF URL. Rightmove `brochures[0].url`; Zoopla
   * `additionalLinks[]` filtered to brochure types.
   */
  brochureUrl?: string;

  /**
   * Agent's branch description (HTML). Rightmove
   * `customer.customerDescription.descriptionHTML`. UI should sanitize
   * before rendering.
   */
  agentDescriptionHtml?: string;

  /** Agent's logo URL. Rightmove `customer.logoPath`. */
  agentLogoUrl?: string;

  /**
   * Industry affiliations (ARLA / NAEA / Property Mark badges).
   * Rightmove `industryAffiliations[].name`.
   */
  agentAffiliations?: string[];

  /**
   * True when council tax is exempt (e.g. all-bills-included HMOs).
   * Rightmove `livingCosts.councilTaxExempt`.
   */
  councilTaxExempt?: boolean;

  /**
   * Provenance for the sqft figure. Zoopla `ingested.sizeSource` — e.g.
   * "structured_data" (portal-confirmed) vs landlord-typed. Lets the UI
   * tag the size chip with a confidence cue.
   */
  sizeSource?: string;

  /**
   * Zoopla's free-text administration fees / Client Money Protection
   * disclosure. `feesText` already covers the Rightmove equivalent.
   */
  administrationFeesText?: string;

  /**
   * Multiple-size variants of the floorplan image. Rightmove
   * `floorplans[0].resizedFloorplanUrls`. Order unspecified; UI picks
   * the largest for the zoom view.
   */
  floorplanResizedUrls?: string[];

  /**
   * Rightmove's structured highlight ribbon at the top of the listing
   * (`infoReelItems`). Each item is a small card — type, title, and the
   * two text lines the portal renders. Useful both for swipe-card meta
   * badges and to backfill `publishedAt` when `listingHistory` doesn't
   * carry an "Added on" reason.
   */
  infoReelItems?: Array<{
    type?: string;
    title?: string;
    primaryText?: string;
    secondaryText?: string;
    tooltipText?: string;
  }>;

  /**
   * Portal-reported "last updated" / "last renewed" date (ISO 8601).
   * OpenRent only. Distinct from `publishedAt` — when a landlord renews
   * an old listing, this resets while `publishedAt` stays put.
   */
  lastUpdatedAt?: string;
}
