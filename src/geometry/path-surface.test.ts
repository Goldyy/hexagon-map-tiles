import { describe, expect, it } from "vitest";

import { resolvePathWidth } from "./path-surface";

describe("Path Width", () => {
  it("uses explicit width before class fallback", () => {
    expect(resolvePathWidth({ highway: "footway", width: "3" })).toEqual({
      width: 3,
      source: "explicit",
    });
  });

  it("uses deterministic class fallback widths", () => {
    const expected = {
      footway: 2,
      cycleway: 2.5,
      path: 1.5,
      steps: 2,
    };

    for (const [highway, width] of Object.entries(expected)) {
      expect(resolvePathWidth({ highway })).toEqual({ width, source: "fallback" });
    }
  });

  it("defaults unknown path classes to 2 meters", () => {
    expect(resolvePathWidth({ highway: "track" })).toEqual({ width: 2, source: "fallback" });
  });

  it("converts explicit feet and inches to meters", () => {
    expect(resolvePathWidth({ highway: "footway", width: "6'6\"" })).toEqual({
      width: 1.9812,
      source: "explicit",
    });
  });
});
