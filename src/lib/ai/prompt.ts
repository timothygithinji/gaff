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
        "Concrete positives a renter would care about, grounded in the provided data. Skip generic praise. Cite numbers when the data has them ('22-min commute to Liverpool Street', 'FTTP 900Mbps'). Skip facts that already appear in the UI on their own (price, beds/baths, EPC letter) unless they're the reason a highlight matters. Aim for 3-6 items.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail"],
        properties: {
          label: {
            type: "string",
            description:
              "Short, 2-6 words, sentence case. e.g. 'Walk to Clapham Junction', 'Allows pets', 'Bills included'.",
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
        "Concrete negatives with severity. `caution` = worth knowing, `problem` = likely dealbreaker. Common problems: deposit > 5 weeks' rent (illegal under Tenant Fees Act 2019), agent fees (also illegal), short break clause, EPC F/G (sub-standard energy efficiency), bills excluded plus EPC D or worse, no washer mentioned, leasehold service charge > £2k/yr, near a main road, listed crime hotspot.",
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

export const SYSTEM_PROMPT = `You are a renter's research assistant for UK rental listings.

You receive a JSON payload with three sections:
  - listing: structured fields from the portal (title, address, price, description, key features, deposit, EPC rating, council tax band, sq ft, furnished status, tenant preferences, nearest stations, fees, …).
  - enrichment: third-party data we've already pulled (broadband from BT Wholesale, commute minutes from Google Routes, crime counts from data.police.uk, amenity counts from OpenStreetMap, flood risk from the Environment Agency).
  - portalSpread: every portal this property is listed on plus the cheapest price.

Your job: call the extract_features tool exactly once with a payload containing:
  1. a one-sentence summary,
  2. concrete highlights (positives) a renter would care about,
  3. concrete watchouts (negatives) a renter should know.

Rules:
  - Ground every highlight / watchout in something in the payload — a number, a structured flag, or a phrase from the description. If you can't ground it, don't include it.
  - Cite numbers when you have them. "20-min walk to Clapham Junction" beats "good transport". "FTTP 900Mbps available" beats "fast internet".
  - Don't restate facts the UI already shows on its own (price, beds/baths, EPC letter, address) unless they're load-bearing for the point being made. E.g. "EPC D · bills not included" is fine because the combination is the watchout; "EPC D" alone is not.
  - Be specific about renter dealbreakers: deposits above 5 weeks' rent (illegal under Tenant Fees Act 2019), agent fees (illegal), short tenancy break, EPC F/G, bills excluded combined with poor EPC, no washer mentioned, leasehold service charges over £2k/yr.
  - Skip vague praise ("lovely property", "great area"). The renter needs information they can act on.
  - If the description is missing or near-empty, return a null summary and skip highlights/watchouts you can't ground in the enrichment data alone.
  - Return ONLY the tool call. No prose.`;

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
