/**
 * Prompt + structured-output schema for listing enrichment.
 *
 * The wire-level contract is: the model receives a system instruction +
 * a USER message containing a JSON dump of the listing detail, and is
 * forced to call ONE tool — `extract_features` — with an argument
 * matching `FeaturesSchema`. The runtime parses the tool input through
 * Zod, so a model returning a malformed payload errors loudly instead
 * of silently storing bad JSON in `enrichments.features`.
 *
 * Why a tool call instead of a free-form JSON block? Tool calls are the
 * one path where Anthropic guarantees the model receives the JSON
 * Schema and validates against it. Free-form JSON works most of the
 * time but the failure mode (a leading "Here you go:" or a trailing
 * markdown fence) is annoying to handle defensively. Tools sidestep it.
 *
 * The schema mirrors the shape `enrichments.features` already declares
 * in `db/schema.ts` — `hasGarden`, `allowsPets`, etc. — plus the richer
 * floorplan/small-print fields the design surfaces in PR 9. The DB
 * column is `jsonb` so adding nested objects costs zero migrations.
 */

import { z } from "zod";
import type { ListingDetail } from "../parsers/types";

export const FeaturesSchema = z.object({
  // Yes/no/null tri-state features. `null` means "couldn't ground it in
  // the source text" — explicit unknown beats a confident false.
  hasGarden: z.boolean().nullable(),
  allowsPets: z.boolean().nullable(),
  hasParking: z.boolean().nullable(),
  hasWasher: z.boolean().nullable(),
  isFurnished: z.boolean().nullable(),

  // Categorical
  furnishedDetail: z
    .enum(["furnished", "unfurnished", "part_furnished"])
    .nullable(),
  broadband: z.string().nullable(), // e.g. "900 Mb FTTP"
  councilTaxBand: z.string().nullable(), // e.g. "C"

  // Floorplan readout (PR 9's listing-detail surfaces these).
  floorplan: z
    .object({
      layout: z.enum(["open_plan", "separate", "mixed"]).nullable(),
      rooms: z
        .array(
          z.object({
            name: z.string(), // "Kitchen", "Bed 1", "Living"
            sqm: z.number().nullable(),
            notes: z.string().nullable(),
          })
        )
        .default([]),
      giaSqm: z.number().nullable(), // gross internal area
    })
    .default({ layout: null, rooms: [], giaSqm: null }),

  // "Small print" — the lease/restrictions/bills the design surfaces.
  smallPrint: z
    .array(
      z.object({
        severity: z.enum(["ok", "caution", "problem"]),
        label: z.string(), // "Bills not included but boiler under 2 years"
        note: z.string().nullable(),
      })
    )
    .default([]),
});

export type Features = z.infer<typeof FeaturesSchema>;

export const EXTRACT_FEATURES_TOOL_NAME = "extract_features" as const;

/**
 * JSON Schema for the `extract_features` tool input. This is the wire
 * format Anthropic enforces — Zod is the runtime gate, but the JSON
 * Schema is what the model sees in the prompt.
 *
 * Hand-written rather than generated from Zod so we can keep tight
 * control over `description` strings (the model uses them as the only
 * grounding hints it has) and `additionalProperties: false` everywhere.
 */
export const EXTRACT_FEATURES_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "hasGarden",
    "allowsPets",
    "hasParking",
    "hasWasher",
    "isFurnished",
    "furnishedDetail",
    "broadband",
    "councilTaxBand",
    "floorplan",
    "smallPrint",
  ],
  properties: {
    hasGarden: {
      type: ["boolean", "null"],
      description:
        "True if the listing mentions a garden, yard, or outdoor space the tenant has exclusive use of. Null if not mentioned.",
    },
    allowsPets: {
      type: ["boolean", "null"],
      description:
        "True if pets are explicitly allowed, false if explicitly disallowed, null if not mentioned.",
    },
    hasParking: {
      type: ["boolean", "null"],
      description:
        "True if off-street/allocated parking is included with the listing. Null if not mentioned.",
    },
    hasWasher: {
      type: ["boolean", "null"],
      description:
        "True if a washing machine is included in the property. Null if not mentioned.",
    },
    isFurnished: {
      type: ["boolean", "null"],
      description:
        "True if furniture is included, false if explicitly unfurnished, null if not mentioned.",
    },
    furnishedDetail: {
      type: ["string", "null"],
      enum: ["furnished", "unfurnished", "part_furnished", null],
      description:
        "More precise furnishing state when the listing distinguishes part-furnished from fully furnished.",
    },
    broadband: {
      type: ["string", "null"],
      description:
        "Verbatim broadband description if mentioned (e.g. '900 Mb FTTP', 'Virgin Media available'). Null otherwise.",
    },
    councilTaxBand: {
      type: ["string", "null"],
      description:
        "UK council tax band letter A-H if mentioned. Null otherwise.",
    },
    floorplan: {
      type: "object",
      additionalProperties: false,
      required: ["layout", "rooms", "giaSqm"],
      properties: {
        layout: {
          type: ["string", "null"],
          enum: ["open_plan", "separate", "mixed", null],
          description:
            "Overall kitchen/living layout. open_plan = combined K/L/D; separate = walled off; mixed = e.g. kitchen-diner but separate living.",
        },
        rooms: {
          type: "array",
          description:
            "Each named room with optional area in square metres. Only include rooms explicitly described.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "sqm", "notes"],
            properties: {
              name: {
                type: "string",
                description: "Room label, e.g. 'Kitchen', 'Bed 1', 'Living'.",
              },
              sqm: {
                type: ["number", "null"],
                description:
                  "Floor area in square metres if given. Convert feet/inches if the listing uses imperial.",
              },
              notes: {
                type: ["string", "null"],
                description:
                  "Short qualitative notes from the listing (e.g. 'fits a king', 'dual-aspect'). Null if none.",
              },
            },
          },
        },
        giaSqm: {
          type: ["number", "null"],
          description:
            "Gross internal area in square metres if the floorplan reports it. Null otherwise.",
        },
      },
    },
    smallPrint: {
      type: "array",
      description:
        "Lease / bills / restriction items worth flagging. Each item has a severity (ok = positive note, caution = worth knowing, problem = a likely dealbreaker) plus a short human label.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "label", "note"],
        properties: {
          severity: {
            type: "string",
            enum: ["ok", "caution", "problem"],
          },
          label: {
            type: "string",
            description:
              "Short human label, e.g. 'Bills not included but boiler under 2 years'.",
          },
          note: {
            type: ["string", "null"],
            description:
              "Optional longer explanation. Null when the label is self-explanatory.",
          },
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You extract structured features from UK rental listings. Read the JSON the user provides and call the extract_features tool exactly once with a payload describing the property.

Rules:
- Ground every field in the provided text. If the listing does not mention something, return null (or [] for arrays).
- Never invent figures. If a room area isn't stated, leave sqm null.
- Be conservative on smallPrint: only flag items that would genuinely change a renter's decision.
- For UK rental small print, common 'problem' items include: bills excluded with old boiler, no washer, deposit > 5 weeks rent, short tenancy break, agent fees mentioned (illegal post-2019).
- Return ONLY the tool call. No commentary, no surrounding prose.`;

/**
 * Build the USER message payload. We keep this deterministic and
 * compact: only the fields the model needs to ground its extraction,
 * shaped as JSON so the model can parse them unambiguously.
 *
 * For Rightmove specifically we include the floorplan image URL — the
 * model can't OCR it today, but having the URL in context is harmless
 * and forward-compatible with a vision-enabled prompt revision.
 */
export function buildUserMessage(detail: ListingDetail): string {
  const payload = {
    title: detail.title,
    addressRaw: detail.addressRaw,
    priceMonthly: detail.priceMonthly ?? null,
    description: detail.description ?? null,
    keyFeatures: detail.keyFeatures ?? [],
    floorplanUrl:
      detail.portal === "rightmove" ? (detail.floorplanUrl ?? null) : null,
  };
  return `Extract the structured features for this listing:\n\n${JSON.stringify(payload, null, 2)}`;
}
