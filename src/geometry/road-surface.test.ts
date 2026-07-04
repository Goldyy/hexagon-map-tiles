import { describe, expect, it } from "vitest";

import { resolveRoadWidth } from "./road-surface";

describe("Road Surface width", () => {
  it("uses explicit width before lane count and class fallback", () => {
    expect(resolveRoadWidth({ highway: "primary", width: "8.5", lanes: "4" })).toEqual({
      width: 8.5,
      source: "explicit",
    });
  });

  it("derives width from lane count", () => {
    expect(resolveRoadWidth({ highway: "secondary", lanes: "3" })).toEqual({
      width: 9.75,
      source: "lanes",
    });
  });

  it("uses deterministic class fallback widths", () => {
    const expected = {
      motorway: 12,
      trunk: 10,
      primary: 9,
      secondary: 8,
      tertiary: 7,
      residential: 6,
      unclassified: 6,
      living_street: 5,
      service: 4,
      pedestrian: 4,
    };

    for (const [highway, width] of Object.entries(expected)) {
      expect(resolveRoadWidth({ highway })).toEqual({ width, source: "fallback" });
    }
  });

  it("converts explicit feet and inches to meters", () => {
    expect(resolveRoadWidth({ highway: "residential", width: "16'3\"" })).toEqual({
      width: 4.953,
      source: "explicit",
    });
  });
});
