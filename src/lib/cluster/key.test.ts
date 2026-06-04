/**
 * Unit tests for the cross-portal cluster key.
 *
 * The cases below are taken from REAL Rightmove / Zoopla / OpenRent
 * addresses observed in prod for the same physical properties — the whole
 * point is that the three portals' formats collapse to one street key.
 */

import { describe, expect, it } from "vitest";
import {
  addressOutcode,
  isDegenerateStreetKey,
  priceCorroborates,
  streetKey,
} from "./key";

describe("streetKey", () => {
  it("collapses the same road across all three portal formats", () => {
    const rm = streetKey("Linden Way, London, N14");
    const zoopla = streetKey("Linden Way, London N14");
    const openrent = streetKey("2 Bed Flat, Linden Way, N14");
    expect(rm).toBe("linden way|");
    expect(zoopla).toBe("linden way|");
    expect(openrent).toBe("linden way|");
  });

  it("does not let a bed-count prefix leak in as a house number", () => {
    // Regression: "2 Bed Flat" must not yield unit "2".
    expect(streetKey("2 Bed Flat, Howeth Court, N11")).toBe("howeth court|");
    expect(streetKey("Howeth Court, London, N11")).toBe("howeth court|");
  });

  it("keeps a real leading house number (in base and unit, consistently)", () => {
    expect(streetKey("13 Cannon Hill N14")).toBe("13 cannon hill|13");
    expect(streetKey("13 Cannon Hill, N14")).toBe("13 cannon hill|13");
  });

  it("keeps distinct flats in the same building apart, house number retained", () => {
    expect(streetKey("Flat 1, 22 Elm Street, NW3 1AA")).toBe(
      "22 elm street|flat1"
    );
    expect(streetKey("Flat 2, 22 Elm Street, NW3 1AA")).toBe(
      "22 elm street|flat2"
    );
  });

  it("strips a marketing tail after ' - '", () => {
    expect(
      streetKey("Brownlow Road, London, N11 - SEE 3D VIRTUAL TOUR ONLINE")
    ).toBe("brownlow road|");
    expect(streetKey("Brownlow Road, London N11")).toBe("brownlow road|");
  });

  it("uses the building name when there is no street-type word", () => {
    expect(streetKey("Heritage House, London N14")).toBe("heritage house|");
    expect(streetKey("2 Bed Flat, Heritage House, N14")).toBe("heritage house|");
  });

  it("does NOT collapse different roads that share an area word", () => {
    // The token heuristic's old bug: "Southgate" linked these. Street key
    // must keep them distinct.
    expect(streetKey("De Bohun Avenue, Southgate N14")).not.toBe(
      streetKey("Orchid Road, Southgate, N14")
    );
  });
});

describe("isDegenerateStreetKey", () => {
  it("flags parser-junk single-word bases", () => {
    expect(isDegenerateStreetKey(streetKey("House, London N11"))).toBe(true);
    expect(isDegenerateStreetKey("flat|")).toBe(true);
    expect(isDegenerateStreetKey("|")).toBe(true);
  });

  it("accepts a real multi-word road", () => {
    expect(isDegenerateStreetKey("linden way|")).toBe(false);
    expect(isDegenerateStreetKey("cannon hill|13")).toBe(false);
  });
});

describe("addressOutcode", () => {
  it("prefers the postcode column", () => {
    expect(addressOutcode("N14 5AB", "Linden Way, London")).toBe("n14");
  });

  it("falls back to sniffing the raw address", () => {
    expect(addressOutcode(null, "2 Bed Flat, Linden Way, N14")).toBe("n14");
    expect(addressOutcode("", "Linden Way, London N14")).toBe("n14");
  });

  it("returns empty when there is no outcode anywhere", () => {
    expect(addressOutcode(null, "Linden Way, London")).toBe("");
  });
});

describe("priceCorroborates", () => {
  it("matches identical and near rents", () => {
    expect(priceCorroborates(2100, 2100)).toBe(true);
    expect(priceCorroborates(1800, 1850)).toBe(true); // £50 ≤ £75 floor
  });

  it("rejects rents that are far apart", () => {
    expect(priceCorroborates(1895, 2195)).toBe(false);
  });

  it("never corroborates on a null price", () => {
    expect(priceCorroborates(null, 2000)).toBe(false);
    expect(priceCorroborates(2000, null)).toBe(false);
  });
});
