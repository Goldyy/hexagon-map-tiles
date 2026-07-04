import { describe, expect, it } from "vitest";

import { resolvePreviewCameraRange } from "./camera";

describe("Digital Tile Asset preview camera", () => {
  it("resolves the 5 cm Road Surface separation at maximum orbit distance", () => {
    const span = 2_000;
    const { near, far } = resolvePreviewCameraRange(span);
    const farthestSurfaceDistance = span * (3 + 1 / Math.sqrt(3));
    const depthResolution =
      (farthestSurfaceDistance ** 2 * (far - near)) /
      (far * near * 2 ** 24);

    expect(depthResolution).toBeLessThan(0.05);
  });
});
