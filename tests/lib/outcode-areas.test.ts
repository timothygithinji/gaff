import { describe, expect, it } from "vitest";
import { OUTCODE_AREAS, outcodeAreaName } from "../../src/lib/outcode-areas";

describe("outcodeAreaName", () => {
  it("labels well-known London outcodes", () => {
    expect(outcodeAreaName("NW3")).toBe("Hampstead");
    expect(outcodeAreaName("N9")).toBe("Edmonton");
    expect(outcodeAreaName("SW9")).toBe("Brixton");
    expect(outcodeAreaName("N1")).toBe("Islington");
    expect(outcodeAreaName("E8")).toBe("Hackney");
  });

  it("labels geographic letter-suffixed central outcodes", () => {
    expect(outcodeAreaName("WC2E")).toBe("Covent Garden");
    expect(outcodeAreaName("EC2Y")).toBe("Barbican");
    expect(outcodeAreaName("W1D")).toBe("Soho");
    expect(outcodeAreaName("N1C")).toBe("King's Cross");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(outcodeAreaName(" nw3 ")).toBe("Hampstead");
  });

  it("returns null for outcodes outside the London postal areas", () => {
    expect(outcodeAreaName("IG8")).toBeNull();
    expect(outcodeAreaName("BR1")).toBeNull();
    expect(outcodeAreaName("M1")).toBeNull();
  });

  it("has no non-geographic codes in the map", () => {
    for (const oc of ["N1P", "N81", "NW26", "EC1P", "W1A", "SW95"]) {
      expect(OUTCODE_AREAS[oc], oc).toBeUndefined();
    }
  });
});
