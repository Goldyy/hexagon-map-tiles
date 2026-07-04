import { describe, expect, it } from "vitest";

import { resolveGreenKind } from "./green-surface";

describe("Green Surface kind", () => {
  it("classifies leisure=park as park", () => {
    expect(resolveGreenKind({ leisure: "park" })).toBe("park");
  });

  it("classifies grassy landuse values as grass", () => {
    for (const landuse of ["grass", "meadow", "village_green", "recreation_ground"]) {
      expect(resolveGreenKind({ landuse })).toBe("grass");
    }
  });

  it("classifies wooded features as forest", () => {
    expect(resolveGreenKind({ landuse: "forest" })).toBe("forest");
    expect(resolveGreenKind({ natural: "wood" })).toBe("forest");
  });

  it("classifies scrubby natural features as scrub", () => {
    expect(resolveGreenKind({ natural: "scrub" })).toBe("scrub");
    expect(resolveGreenKind({ natural: "grassland" })).toBe("scrub");
  });

  it("returns null for non-green features", () => {
    expect(resolveGreenKind({ building: "yes" })).toBeNull();
  });
});
