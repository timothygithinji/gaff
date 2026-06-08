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
        "Concrete negatives a renter would change their decision over. Severity: `caution` = worth knowing, `problem` = likely dealbreaker. DEALBREAKERS (always surface when present): deposit > 5 weeks' rent (illegal under Tenant Fees Act 2019), agent fees charged (also illegal), break clause shorter than 6 months, EPC F or G (sub-standard energy efficiency), leasehold service charge > £2,000/yr. COMPOUND WATCHOUTS (only when BOTH sides are hard facts): 'EPC F + bills excluded' (real cost concern). DO NOT SURFACE: 'Bills not included' alone (default for ~95% of London rentals); 'Deposit equals one month's rent' or 'Deposit at legal cap' (one month is the legal MINIMUM, five weeks is the legal MAXIMUM — being at the floor or cap is tenant-friendly, not a caution); 'No pets allowed' / 'No DSS' / 'Families not accepted' (these are filters, not property defects); '6-month minimum term' / '12-month minimum term' (UK norm); 'EPC D' alone (borderline-average — only flag with another concrete cost concern, NOT with a data gap like 'bills status unclear'); 'No EPC rating provided' / 'No broadband data' (pending enrichment, not property defects); 'No washer mentioned' (agents routinely omit standard appliances); 'Deposit not stated' (the agent will provide it). Return an empty array if the listing has no concrete watchouts — better empty than padded.",
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
  - enrichment: third-party data we've already pulled (broadband from BT Wholesale, commute minutes + station walk/transit times from Google Routes, amenity counts from OpenStreetMap).
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

TRANSPORT — the single most common hallucination, follow exactly:
  - Station walk/transit times come ONLY from \`enrichment.stationRoutes\` (real Google-routed minutes). To say "X-min walk to <station>", read \`walkMinutes\` for that station from \`enrichment.stationRoutes\`; for "X min to central London" / a named destination, read \`enrichment.commuteMinutes\`.
  - NEVER derive a walk time from \`listing.nearestStations\` (that's straight-line distance in miles, not minutes) and NEVER repeat a time from the listing description or marketing copy ("moments from the tube", "2-min walk") — those are unverified and routinely wrong.
  - If \`enrichment.stationRoutes\` is null/empty, do NOT state any walk time to a station. You may still name the nearest station from \`listing.nearestStations\` WITHOUT a time, but only if it's genuinely decision-changing — usually it isn't, so prefer to skip.
  - Never pair a distance in miles with a time you didn't get from routing (e.g. "5-min walk… 0.6 miles away" is self-contradictory and forbidden).

Real dealbreakers (always surface when actually present):
  - Deposit above 5 weeks' rent (illegal under the Tenant Fees Act 2019) — severity "problem". DO NOT compute this yourself. Use \`listing.legalDepositCap.depositOverCap\` — if it's \`true\` surface the watchout (cite \`listing.deposit\` and \`legalDepositCap.fiveWeeksRent\` in the detail); if it's \`false\` or \`null\` do NOT surface a deposit-cap watchout under any phrasing.
  - Agent fees charged (also illegal) — severity "problem".
  - Break clause shorter than 6 months — severity "caution".
  - EPC F or G — severity "problem" (sub-standard energy efficiency, often paired with electric heating).
  - Leasehold service charge > £2,000/yr — severity "caution".
  - Compound: EPC F + bills excluded — severity "problem".
  - listing.floodDisclosure.floodedInLastFiveYears === true — severity "problem" (landlord-disclosed historic flooding).
  - listing.materialInfo.heating contains "electric" AND listing.billsIncluded !== true — severity "caution" (electric-only heating is typically 2–3× gas-central cost for a renter paying their own bills).
  - listing.listedBuilding === true — severity "caution" (statutory restrictions on alterations, satellite dishes, external aerials).

Output discipline:
  - 2–5 highlights, 0–4 watchouts. Better empty than padded — an empty highlights[] is a fine answer for an unremarkable property.
  - Return ONLY the tool call. No prose.
  - If the description is missing or near-empty, return a null summary and skip items you can't ground in the enrichment data alone.

WORKED EXAMPLES — the input is abbreviated to the load-bearing fields; the arrow shows the exact extract_features payload you would return. Study what each one OMITS as much as what it surfaces.

Example 1 — well-connected, grounded positives, nothing to flag:
  listing: { priceMonthly: 1850, bedrooms: 1, furnished: "furnished", legalDepositCap: { fiveWeeksRent: 2135, depositOverCap: false } }
  enrichment: { stationRoutes: [{ name: "Clapham Junction", walkMinutes: 7, transitMinutes: null }], commuteMinutes: { "Liverpool Street": 24 }, broadband: { technology: "FTTP", downloadMbps: 900, fttpAvailable: true } }
  → {
      "summary": "A well-connected one-bed minutes from Clapham Junction, suited to a commuter who wants fast rail and full-fibre.",
      "highlights": [
        { "label": "Walk to Clapham Junction · 7 min", "detail": "Routed 7-min walk; 24 min on to Liverpool Street." },
        { "label": "FTTP 900Mbps available", "detail": "Full-fibre to the premises." }
      ],
      "watchouts": []
    }
  Why: the deposit is AT the legal cap (depositOverCap false) and the flat is furnished — neither is a concern, so neither is surfaced. The walk time is cited from stationRoutes, never computed.

Example 2 — real dealbreakers, surfaced as problems:
  listing: { priceMonthly: 1600, deposit: 2400, billsIncluded: false, legalDepositCap: { fiveWeeksRent: 1846, depositOverCap: true }, materialInfo: { heating: "electric storage heaters" } }
  enrichment: { epcCurrent: "F" }
  → {
      "summary": "A cheaper flat undercut by a deposit over the legal cap and costly electric heating.",
      "highlights": [],
      "watchouts": [
        { "severity": "problem", "label": "Deposit above legal cap", "detail": "£2,400 exceeds the 5-week cap of £1,846 (Tenant Fees Act 2019)." },
        { "severity": "problem", "label": "EPC F + bills excluded", "detail": "Sub-standard efficiency with electric storage heating and tenant-paid bills means high running costs." }
      ]
    }
  Why: depositOverCap is true, so the deposit watchout is mandatory and cites the pre-computed fiveWeeksRent — the model never does the arithmetic itself.

Example 3 — sparse listing, pending enrichment: ground nothing you don't have:
  listing: { description: null, keyFeatures: [] }
  enrichment: { epcCurrent: null, stationRoutes: null, broadband: null, amenities: null }
  → { "summary": null, "highlights": [], "watchouts": [] }
  Why: "No EPC data" / "No broadband data" / "Bills status unclear" are gaps in OUR pipeline, not flaws of the property — surface nothing. A null summary is correct when there's no description to ground one.

Example 4 — the transport trap: no routed time means no stated time:
  listing: { description: "Moments from the tube — a 2-minute walk!", nearestStations: [{ name: "Tooting Bec", distanceMiles: 0.4, types: ["TUBE"] }] }
  enrichment: { stationRoutes: null, commuteMinutes: null }
  → {
      "summary": "A flat near Tooting Bec, though transport times couldn't be verified.",
      "highlights": [],
      "watchouts": []
    }
  Why: stationRoutes is null, so state NO walk time. The "2-minute walk" is marketing copy and 0.4 miles is straight-line distance (not minutes) — both are forbidden sources. Naming the station with a time would be a hallucination.

Example 5 — softer cautions, each on a single hard fact:
  listing: { billsIncluded: false, listedBuilding: true, materialInfo: { heating: "electric" } }
  → {
      "summary": "A characterful flat in a listed building, with electric heating to budget for.",
      "highlights": [],
      "watchouts": [
        { "severity": "caution", "label": "Electric-only heating", "detail": "No gas central heating; running costs are typically 2–3× gas when you pay your own bills." },
        { "severity": "caution", "label": "Listed building", "detail": "Statutory limits on alterations, external aerials and satellite dishes." }
      ]
    }

Example 6 — below-median rent + genuinely useful amenities; resist padding:
  listing: { postcode: "SW9 7AB", priceMonthly: 1500, bedrooms: 2, furnished: "unfurnished", letType: "long term" }
  enrichment: { amenities: { withinMeters: 800, counts: { "supermarket": 4, "gym": 2, "park": 1 } }, stationRoutes: [{ name: "Brixton", walkMinutes: 11, transitMinutes: null }] }
  portalSpread: [{ portal: "rightmove", priceMonthly: 1500, deltaFromCheapest: 0 }, { portal: "openrent", priceMonthly: 1575, deltaFromCheapest: 75 }]
  → {
      "summary": "A two-bed near Brixton with strong local amenities, suited to sharers who want to walk to the tube and the shops.",
      "highlights": [
        { "label": "Walk to Brixton · 11 min", "detail": "Routed 11-min walk to the Victoria line." },
        { "label": "4 supermarkets within 800m", "detail": "Plus two gyms and a park on the doorstep." }
      ],
      "watchouts": []
    }
  Why: "long term", "unfurnished", and the £75 portal delta are not decision-changing on their own, so they are omitted. Amenity counts are surfaced only because they clear the relevance bar (unusually well-served).`;

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

export type AmenitiesInput = {
  withinMeters: number;
  counts: Record<string, number>;
};

/**
 * Real Google-Routes walk/transit times to the nearest stations, the
 * SAME data the UI shows. This is the ONLY trustworthy source of station
 * times — `listing.nearestStations` carries only the portal's
 * straight-line distance, and listing copy ("2 min to the tube") is
 * marketing. The model must cite times from here, never compute its own.
 */
export type StationRouteInput = {
  name: string;
  walkMinutes: number | null;
  transitMinutes: number | null;
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
     * Landlord's personal flood disclosure (Rightmove). Surface this
     * when `floodedInLastFiveYears` is true.
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
    /**
     * Real routed walk/transit times to nearby stations (Google Routes —
     * same data the UI plots). The ONLY source the model may cite station
     * times from. Null when station routing hasn't completed yet.
     */
    stationRoutes: StationRouteInput[] | null;
    broadband: EnrichmentInput | null;
    amenities: AmenitiesInput | null;
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
