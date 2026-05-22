/**
 * Locks the `FeaturesSchema` contract — what the model returns through
 * the `extract_features` tool MUST parse cleanly, and what the model
 * is allowed to omit MUST get sensible defaults.
 *
 * We DO NOT call Anthropic. The "fake response" here is a JSON object
 * shaped like what a well-behaved model would put on
 * `ToolUseBlock.input`. Passing it through `FeaturesSchema.parse`
 * exercises every path the runtime takes after the SDK hands back the
 * tool call.
 */

import { describe, expect, it } from "vitest";
import { FeaturesSchema, buildUserMessage } from "./prompt";

describe("FeaturesSchema", () => {
  it("accepts a fully-populated payload from the model", () => {
    const wellBehaved = {
      hasGarden: true,
      allowsPets: false,
      hasParking: null,
      hasWasher: true,
      isFurnished: false,
      furnishedDetail: "unfurnished" as const,
      broadband: "900 Mb FTTP",
      councilTaxBand: "C",
      floorplan: {
        layout: "separate" as const,
        rooms: [
          { name: "Kitchen", sqm: 12.5, notes: "Galley" },
          { name: "Bed 1", sqm: 14, notes: "Fits a king" },
        ],
        giaSqm: 65,
      },
      smallPrint: [
        {
          severity: "caution" as const,
          label: "Bills excluded but boiler under 2 years",
          note: null,
        },
      ],
    };
    expect(() => FeaturesSchema.parse(wellBehaved)).not.toThrow();
  });

  it("fills in defaults when the model omits floorplan and smallPrint", () => {
    const minimal = {
      hasGarden: null,
      allowsPets: null,
      hasParking: null,
      hasWasher: null,
      isFurnished: null,
      furnishedDetail: null,
      broadband: null,
      councilTaxBand: null,
    };
    const parsed = FeaturesSchema.parse(minimal);
    expect(parsed.smallPrint).toEqual([]);
    expect(parsed.floorplan).toEqual({
      layout: null,
      rooms: [],
      giaSqm: null,
    });
  });

  it("rejects an invalid smallPrint severity", () => {
    const bad = {
      hasGarden: null,
      allowsPets: null,
      hasParking: null,
      hasWasher: null,
      isFurnished: null,
      furnishedDetail: null,
      broadband: null,
      councilTaxBand: null,
      smallPrint: [{ severity: "danger", label: "x", note: null }],
    };
    expect(() => FeaturesSchema.parse(bad)).toThrow();
  });
});

describe("buildUserMessage", () => {
  it("includes the floorplan URL only for Rightmove", () => {
    const base = {
      portal: "rightmove" as const,
      portalListingId: "1",
      url: "https://x",
      title: "Lovely flat",
      addressRaw: "1 Test St, London",
      photos: [],
      description: "A flat",
      keyFeatures: ["Garden", "Parking"],
      floorplanUrl: "https://media.rightmove.co.uk/floorplan.jpg",
    };
    const rightmove = buildUserMessage(base);
    expect(rightmove).toContain("floorplan.jpg");

    const zoopla = buildUserMessage({
      ...base,
      portal: "zoopla",
      floorplanUrl: "https://media.zoopla.co.uk/floorplan.jpg",
    });
    expect(zoopla).not.toContain("floorplan.jpg");
  });

  it("serialises keyFeatures even when description is missing", () => {
    const msg = buildUserMessage({
      portal: "openrent",
      portalListingId: "1",
      url: "https://x",
      title: "Flat",
      addressRaw: "1 Test St",
      photos: [],
      keyFeatures: ["Bills inc.", "Garden"],
    });
    expect(msg).toContain("Bills inc.");
    expect(msg).toContain("Garden");
  });
});
