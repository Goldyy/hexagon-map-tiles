import { describe, expect, it } from "vitest";

import { resolveWaterWidth } from "./water-surface";

describe("Waterway Width", () => {
  it("uses explicit mapped width before class estimate", () => {
    expect(resolveWaterWidth({ waterway: "stream", width: "4.5" })).toEqual({
      width: 4.5,
      source: "explicit",
    });
  });

  it("uses deterministic class estimates", () => {
    expect(resolveWaterWidth({ waterway: "river" })).toEqual({ width: 8, source: "fallback" });
    expect(resolveWaterWidth({ waterway: "canal" })).toEqual({ width: 6, source: "fallback" });
    expect(resolveWaterWidth({ waterway: "stream" })).toEqual({ width: 2, source: "fallback" });
  });
});
