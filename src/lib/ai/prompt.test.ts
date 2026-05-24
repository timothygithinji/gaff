/**
 * Locks the v2 `FeaturesSchema` contract — what the model returns
 * through the `extract_features` tool MUST parse cleanly, and what the
 * model is allowed to omit MUST get sensible defaults.
 *
 * We DO NOT call Anthropic. The "fake response" here is a JSON object
 * shaped like what a well-behaved model would put on
 * `ToolUseBlock.input`. Passing it through `FeaturesSchema.parse`
 * exercises every path the runtime takes after the SDK hands back the
 * tool call.
 */

import { describe, expect, it } from "vitest";
import {
  type ExtractContext,
  FeaturesSchema,
  buildUserMessage,
} from "./prompt";

const emptyContext: ExtractContext = {
  listing: {
    portal: "rightmove",
    title: "Lovely flat",
    addressRaw: "1 Test St, London",
    postcode: "SW11 1AA",
    priceMonthly: 2500,
    bedrooms: 2,
    bathrooms: 1,
    propertyType: "Flat",
    sizeSqFt: 720,
    councilTaxBand: "C",
    publishedAt: null,
    description: "A flat with a garden and washing machine.",
    keyFeatures: ["Garden", "Parking"],
    tags: ["Featured"],
    furnished: "unfurnished",
    deposit: 2884,
    minimumTermMonths: 12,
    letType: "Long term",
    billsIncluded: false,
    serviceChargeAnnual: null,
    groundRentAnnual: null,
    feesText: null,
    agentName: "Foxtons Battersea",
    epcRatingFromPortal: "C",
    floorplanUrl: "https://media.rightmove.co.uk/floorplan.jpg",
    nearestStations: [
      {
        name: "Clapham Junction",
        distanceMiles: 0.4,
        types: ["NATIONAL_RAIL"],
      },
    ],
    tenantPreferences: { petsAccepted: true },
  },
  enrichment: {
    epcCurrent: "C",
    epcPotential: "B",
    commuteMinutes: { Liverpool_Street: 22 },
    broadband: {
      technology: "FTTP",
      downloadMbps: 900,
      uploadMbps: 110,
      fttpAvailable: true,
    },
    crime: {
      month: "2026-03",
      total: 412,
      topCategories: [{ category: "anti-social-behaviour", count: 95 }],
    },
    amenities: { withinMeters: 800, counts: { cafe: 8, supermarket: 3 } },
    flood: { riskLevel: "very-low" },
  },
  portalSpread: [
    { portal: "rightmove", priceMonthly: 2500, deltaFromCheapest: 0 },
    { portal: "zoopla", priceMonthly: 2550, deltaFromCheapest: 50 },
  ],
};

describe("FeaturesSchema", () => {
  it("accepts a fully-populated payload from the model", () => {
    const wellBehaved = {
      summary:
        "A 2-bed flat near Clapham Junction, suited to couples or sharers.",
      highlights: [
        { label: "Walk to Clapham Junction", detail: "8-min walk · 0.4 mi" },
        { label: "FTTP available", detail: "900 Mbps download" },
        { label: "Pets allowed", detail: null },
      ],
      watchouts: [
        {
          severity: "caution" as const,
          label: "Deposit slightly above 5 weeks",
          detail: "£2,884 = 5.5 weeks' rent at £2,500/mo",
        },
      ],
    };
    expect(() => FeaturesSchema.parse(wellBehaved)).not.toThrow();
  });

  it("fills in default empty arrays when the model omits them", () => {
    const minimal = { summary: null };
    const parsed = FeaturesSchema.parse(minimal);
    expect(parsed.highlights).toEqual([]);
    expect(parsed.watchouts).toEqual([]);
    expect(parsed.summary).toBeNull();
  });

  it("rejects an invalid watchout severity", () => {
    const bad = {
      summary: null,
      watchouts: [{ severity: "danger", label: "x", detail: null }],
    };
    expect(() => FeaturesSchema.parse(bad)).toThrow();
  });

  it("rejects a non-string highlight label", () => {
    const bad = {
      summary: null,
      highlights: [{ label: 42, detail: null }],
    };
    expect(() => FeaturesSchema.parse(bad)).toThrow();
  });
});

describe("buildUserMessage", () => {
  it("serialises the listing section into the user payload", () => {
    const msg = buildUserMessage(emptyContext);
    expect(msg).toContain("Clapham Junction");
    expect(msg).toContain("FTTP");
    expect(msg).toContain('"agentName":"Foxtons Battersea"');
  });

  it("includes enrichment data so the model can ground watchouts", () => {
    const msg = buildUserMessage(emptyContext);
    expect(msg).toContain("downloadMbps");
    expect(msg).toContain("topCategories");
    expect(msg).toContain("commuteMinutes");
  });

  it("includes the portal spread so highlights can cite price deltas", () => {
    const msg = buildUserMessage(emptyContext);
    expect(msg).toContain("portalSpread");
    expect(msg).toContain("deltaFromCheapest");
  });
});
