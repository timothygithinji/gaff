/**
 * Prompt + structured-output schema for listing enrichment (v2).
 *
 * v1 asked the model to extract booleans (hasGarden, hasParking, etc.) and a
 * fake "floorplan" readout from listing copy. Those fields either duplicated
 * structured data we already had (council tax band is a column; furnishing
 * comes off the parser; broadband comes from BT Wholesale; pets/families
 * come off `tenant_preferences`) or required vision (floorplan rooms can't
 * be inferred from a text description).
 *
 * v2 inverts the deal: we feed the model EVERYTHING we already know about
 * the listing — structured fields, enrichment results, portal spread — and
 * ask it for the one thing those fields can't tell us:
 *
 *   - `summary`: a single plain-English sentence describing the property
 *     in the context of who'd want to live there.
 *   - `highlights[]`: up to 6 concrete positives a renter would care about,
 *     grounded in the data. "20-min walk to Clapham Junction · FTTP 900Mbps"
 *     beats "great location and fast internet" every time.
 *   - `watchouts[]`: up to 6 concrete cautions / dealbreakers with severity,
 *     grounded in the same data. "Deposit £3,200 = 7 weeks' rent (legal cap
 *     5)" beats "high deposit".
 *
 * The model is told NOT to repeat facts that already appear elsewhere in the
 * UI (price, beds, EPC letter) unless they're load-bearing for the highlight
 * / watchout being made.
 */

import { z } from "zod";

export const FeaturesSchema = z.object({
  /**
   * One sentence describing the property + who it'd suit. Returned by
   * the model verbatim — the UI surfaces it as the card sub-headline.
   */
  summary: z.string().nullable(),

  /**
   * Up to six positives. Each one is grounded in the provided data; the
   * model is told to skip anything it can't anchor in a concrete number,
   * structured flag, or phrase from the description.
   */
  highlights: z
    .array(
      z.object({
        label: z.string(),
        detail: z.string().nullable(),
      })
    )
    .default([]),

  /**
   * Up to six negatives with severity. `caution` = worth knowing,
   * `problem` = likely dealbreaker. Same grounding rule as highlights.
   *
   * `severity` is `.catch("caution")`: Haiku occasionally returns a
   * value outside the enum (e.g. "warning"), and without this the whole
   * `FeaturesSchema.parse` threw — discarding the summary, highlights,
   * and every valid watchout for that listing, leaving "What stands out"
   * blank. Every consumer treats non-`"problem"` as caution, so coercing
   * an unknown value to the milder tone degrades safely.
   */
  watchouts: z
    .array(
      z.object({
        severity: z.enum(["caution", "problem"]).catch("caution"),
        label: z.string(),
        detail: z.string().nullable(),
      })
    )
    .default([]),
});

export type Features = z.infer<typeof FeaturesSchema>;
export type HighlightItem = Features["highlights"][number];
export type WatchoutItem = Features["watchouts"][number];

export const EXTRACT_FEATURES_TOOL_NAME = "extract_features" as const;

/**
 * JSON Schema for the `extract_features` tool input. Hand-written so we
 * can pin tight `description` strings (the model uses them as grounding
 * hints) and `additionalProperties: false` everywhere.
 */
export const EXTRACT_FEATURES_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "highlights", "watchouts"],
  properties: {
    summary: {
      type: ["string", "null"],
      description:
        "A single sentence (<= 25 words) describing the property and the kind of renter it'd suit. Plain English, no marketing copy, no superlatives. Null only if the description is too sparse to summarise.",
    },
    highlights: {
      type: "array",
      maxItems: 6,
      description:
        "Concrete positives a renter would CHANGE THEIR DECISION over. Each highlight must clear the relevance bar: a renter comparing 50 listings would pick THIS one (or rule it out) on the strength of this point. If the property is just average on this dimension, omit it. Cite numbers when the data has them ('22-min commute to Liverpool Street', 'FTTP 900Mbps available', '£250 below median for the outcode'). Aim for 2–5 items; return an empty array if the listing is unremarkable. DO NOT SURFACE: 'Furnished' / 'Unfurnished' (the spec strip already shows this); 'Available immediately' or 'Available now' (every listed property is); 'Bills included' alone unless paired with a £/month value; 'No agent fees' (charging them is illegal under the Tenant Fees Act 2019 — absence is the legal baseline, not a positive); 'EPC A/B/C' alone (average-or-better isn't a standout); 'Gas central heating' / 'Double glazing' / 'Wood flooring' (standard UK fittings); restating the bedroom or bath count.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail"],
        properties: {
          label: {
            type: "string",
            description:
              "Short, 2-6 words, sentence case. Decision-changing. Good: 'Walk to Clapham Junction · 6 min', 'FTTP 900Mbps available', 'Below-median rent for SW9'. Avoid: 'Furnished', 'Modern kitchen', 'Available immediately'.",
          },
          detail: {
            type: ["string", "null"],
            description:
              "One short sentence explaining the highlight with concrete grounding. Null if the label is self-explanatory.",
          },
        },
      },
    },
    watchouts: {
      type: "array",
      maxItems: 6,
      description:
        "Concrete negatives a renter would change their decision over. Severity: `caution` = worth knowing, `problem` = likely dealbreaker. DEALBREAKERS (always surface when present): deposit > 5 weeks' rent (illegal under Tenant Fees Act 2019), agent fees charged (also illegal), break clause shorter than 6 months, EPC F or G (sub-standard energy efficiency), leasehold service charge > £2,000/yr, area crime materially above the borough average. COMPOUND WATCHOUTS (only when BOTH sides are hard facts): 'EPC F + bills excluded' (real cost concern). DO NOT SURFACE: 'Bills not included' alone (default for ~95% of London rentals); 'Deposit equals one month's rent' or 'Deposit at legal cap' (one month is the legal MINIMUM, five weeks is the legal MAXIMUM — being at the floor or cap is tenant-friendly, not a caution); 'No pets allowed' / 'No DSS' / 'Families not accepted' (these are filters, not property defects); '6-month minimum term' / '12-month minimum term' (UK norm); 'EPC D' alone (borderline-average — only flag with another concrete cost concern, NOT with a data gap like 'bills status unclear'); 'No EPC rating provided' / 'No broadband data' (pending enrichment, not property defects); 'No washer mentioned' (agents routinely omit standard appliances); 'Deposit not stated' (the agent will provide it). Return an empty array if the listing has no concrete watchouts — better empty than padded.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "label", "detail"],
        properties: {
          severity: {
            type: "string",
            enum: ["caution", "problem"],
          },
          label: {
            type: "string",
            description:
              "Short, 2-6 words, sentence case. e.g. 'Deposit above legal cap', 'No washer mentioned'.",
          },
          detail: {
            type: ["string", "null"],
            description:
              "One short sentence with concrete grounding (numbers, quotes from description, structured field values). Null if the label is self-explanatory.",
          },
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You are a renter's research assistant for UK rental listings. The output you produce drives a "What stands out" section that a renter comparing 50 listings reads in 3 seconds.

You receive a JSON payload with three sections:
  - listing: structured fields from the portal (title, address, price, description, key features, deposit, EPC rating, council tax band, sq ft, furnished status, tenant preferences, nearest stations, fees, …).
  - enrichment: third-party data we've already pulled (broadband from BT Wholesale, commute minutes from Google Routes, crime counts from data.police.uk, amenity counts from OpenStreetMap, flood risk from the Environment Agency).
  - portalSpread: every portal this property is listed on plus the cheapest price.

Your job: call the extract_features tool exactly once with a payload containing:
  1. a one-sentence summary,
  2. concrete highlights (positives) a renter would change their decision over,
  3. concrete watchouts (negatives) a renter would change their decision over.

THE RELEVANCE BAR — apply to every highlight and watchout before emitting it:
  - Would a renter comparing 50 listings PICK this one (or rule it out) on the strength of this point? If "no", drop it.
  - Is the property UNUSUAL on this dimension relative to a typical London / UK rental? If "average", drop it.
  - Is this restating a field the listing card already shows (beds, baths, price, furnishing, EPC letter)? If yes, drop it unless the combination IS the point.
  - Is this restating a filter the user already applied (pets, garden, parking)? If yes, drop it — by definition every result has it.
  - Is this the legal floor / cap presented as a concern? Deposit = one month's rent is the legal MINIMUM and tenant-friendly; only ABOVE 5 weeks' rent is illegal. Don't invert direction.
  - Is this a data gap rather than a property defect? "No EPC provided" / "No broadband data" / "Bills status unclear" mean OUR pipeline hasn't loaded the data; they're not flaws of the property. Surface NOTHING for these.
  - Is this compounding two non-facts? "EPC D with bills status unclear" pairs a borderline-average rating with a data gap — that's speculation × speculation. Skip.

Grounding:
  - Anchor every item in a number, a structured flag, or a phrase from the description. If you can't ground it, don't emit it.
  - Cite numbers when you have them. "20-min walk to Clapham Junction" beats "good transport". "FTTP 900Mbps available" beats "fast internet". "£250 below median for the outcode" beats "competitively priced".

Real dealbreakers (always surface when actually present):
  - Deposit above 5 weeks' rent (illegal under the Tenant Fees Act 2019) — severity "problem". DO NOT compute this yourself. Use \`listing.legalDepositCap.depositOverCap\` — if it's \`true\` surface the watchout (cite \`listing.deposit\` and \`legalDepositCap.fiveWeeksRent\` in the detail); if it's \`false\` or \`null\` do NOT surface a deposit-cap watchout under any phrasing.
  - Agent fees charged (also illegal) — severity "problem".
  - Break clause shorter than 6 months — severity "caution".
  - EPC F or G — severity "problem" (sub-standard energy efficiency, often paired with electric heating).
  - Leasehold service charge > £2,000/yr — severity "caution".
  - Compound: EPC F + bills excluded — severity "problem".
  - Crime materially above the borough average — severity "caution" (only when the data backs it).
  - listing.floodDisclosure.floodedInLastFiveYears === true — severity "problem" (landlord-disclosed historic flooding overrides area-level "very-low" tiles).
  - listing.materialInfo.heating contains "electric" AND listing.billsIncluded !== true — severity "caution" (electric-only heating is typically 2–3× gas-central cost for a renter paying their own bills).
  - listing.listedBuilding === true — severity "caution" (statutory restrictions on alterations, satellite dishes, external aerials).

Output discipline:
  - 2–5 highlights, 0–4 watchouts. Better empty than padded — an empty highlights[] is a fine answer for an unremarkable property.
  - Return ONLY the tool call. No prose.
  - If the description is missing or near-empty, return a null summary and skip items you can't ground in the enrichment data alone.`;

/**
 * Compact shape of everything we feed the model. Owned by the AI module
 * so the trigger-task plumbing in `enrich-ai.ts` doesn't grow its own
 * private payload definition.
 */
export type EnrichmentInput = {
  technology: "FTTP" | "FTTC" | "ADSL" | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  fttpAvailable: boolean;
};

export type CrimeInput = {
  month: string;
  total: number;
  topCategories: Array<{ category: string; count: number }>;
};

export type AmenitiesInput = {
  withinMeters: number;
  counts: Record<string, number>;
};

export type FloodInput = {
  riskLevel: "very-low" | "low" | "medium" | "high" | "unknown";
};

export type PortalSpreadRow = {
  portal: string;
  priceMonthly: number | null;
  deltaFromCheapest: number | null;
};

// AI-prompt-context shapes: this layer uses `| null` throughout (the
// model sees explicit nulls, not absent keys), so these deliberately
// diverge from the `?:`/undefined-convention shapes of the same concept
// in `parsers/types.ts`. The `Prompt` prefix keeps the two distinct.
export type PromptTenantPreferences = {
  studentsAccepted?: boolean | null;
  familiesAccepted?: boolean | null;
  petsAccepted?: boolean | null;
  smokersAccepted?: boolean | null;
  dssAccepted?: boolean | null;
};

export type PromptNearestStation = {
  name: string;
  distanceMiles: number | null;
  types: string[];
};

export type ExtractContext = {
  listing: {
    portal: string;
    title: string;
    addressRaw: string;
    postcode: string | null;
    priceMonthly: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    propertyType: string | null;
    sizeSqFt: number | null;
    councilTaxBand: string | null;
    publishedAt: string | null;
    description: string | null;
    keyFeatures: string[];
    tags: string[];
    furnished: "furnished" | "unfurnished" | "part_furnished" | null;
    deposit: number | null;
    minimumTermMonths: number | null;
    letType: string | null;
    billsIncluded: boolean | null;
    serviceChargeAnnual: number | null;
    groundRentAnnual: number | null;
    feesText: string | null;
    agentName: string | null;
    epcRatingFromPortal: string | null;
    floorplanUrl: string | null;
    nearestStations: PromptNearestStation[];
    tenantPreferences: PromptTenantPreferences | null;
    /**
     * Rightmove's structured Material Information (UK statutory
     * disclosure). When the property has electric-only heating or
     * non-mains water/sewerage, the model can ground a cost-of-living
     * watchout on it. Null when the portal didn't expose it (Zoopla /
     * OpenRent).
     */
    materialInfo: {
      heating: string | null;
      parking: string | null;
      garden: string | null;
      electricity: string | null;
      water: string | null;
      sewerage: string | null;
      accessibility: string | null;
    } | null;
    /**
     * Landlord's personal flood disclosure (Rightmove). Distinct from
     * the area-level EA tile in `enrichment.flood` — surface this when
     * `floodedInLastFiveYears` is true, even if the area tile reads
     * "very-low".
     */
    floodDisclosure: {
      floodedInLastFiveYears: boolean | null;
      floodDefences: boolean | null;
      floodSources: string[];
    } | null;
    /** True when the building is listed (statutory alteration restrictions). */
    listedBuilding: boolean | null;
    /** True when council tax is exempt (rare — typically all-bills HMOs). */
    councilTaxExempt: boolean | null;
    /** Agent's ARLA/NAEA/PropertyMark affiliations, when published. */
    agentAffiliations: string[];
    /**
     * Pre-computed deposit-vs-Tenant-Fees-Act check. Haiku has been
     * observed inverting the arithmetic (dividing deposit by monthly
     * rent and calling the ratio "weeks") — feeding the result avoids
     * making the model do the math at all. `fiveWeeksRent` is rounded up
     * so pence-over-cap rounding doesn't trip a false flag.
     */
    legalDepositCap: {
      fiveWeeksRent: number | null;
      depositOverCap: boolean | null;
    } | null;
  };
  enrichment: {
    epcCurrent: string | null;
    epcPotential: string | null;
    commuteMinutes: Record<string, number> | null;
    broadband: EnrichmentInput | null;
    crime: CrimeInput | null;
    amenities: AmenitiesInput | null;
    flood: FloodInput | null;
  };
  portalSpread: PortalSpreadRow[];
};

/**
 * Build the USER message payload. We pass the FULL context as JSON. The
 * system prompt explains the shape; we keep the user payload as a single
 * `Extract for this property:` line followed by the JSON dump so the
 * model parses it unambiguously.
 *
 * Compactly stringified (no indent) — the model handles dense JSON fine
 * and the saved tokens add up over a fleet of listings.
 */
export function buildUserMessage(ctx: ExtractContext): string {
  return `Extract highlights and watchouts for this property:\n\n${JSON.stringify(ctx)}`;
}
