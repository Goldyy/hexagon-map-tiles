import { describe, expect, it } from "vitest";

import { resolveRailWidth } from "./rail-surface";

describe("Rail Width", () => {
  it("uses explicit width before class fallback", () => {
    expect(resolveRailWidth({ railway: "rail", width: "5" })).toEqual({
      width: 5,
      source: "explicit",
    });
  });

  it("uses deterministic class fallback widths", () => {
    const expected = {
      rail: 4,
      tram: 3,
      light_rail: 3.5,
    };

    for (const [railway, width] of Object.entries(expected)) {
      expect(resolveRailWidth({ railway })).toEqual({ width, source: "fallback" });
    }
  });

  it("defaults unknown rail classes to 3.5 meters", () => {
    expect(resolveRailWidth({ railway: "subway" })).toEqual({ width: 3.5, source: "fallback" });
  });
});
