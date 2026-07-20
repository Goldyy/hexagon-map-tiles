import { describe, expect, it } from "vitest";

import { CLEARANCE_MM, mapWidthMm, printSize, TRAY_WALL_MM, totalWidthMm } from "./print-size";

describe("print size at fixed 1:2000 fidelity", () => {
  it("grows the printed map with the Tile Span", () => {
    // Corner-to-corner width is 2·span/√3 meters → ·0.5 mm/m.
    expect(mapWidthMm(250)).toBeCloseTo(144.34, 2);
    expect(mapWidthMm(500)).toBeCloseTo(288.68, 2);
    expect(totalWidthMm(250)).toBeCloseTo(144.34 + 2 * (CLEARANCE_MM + TRAY_WALL_MM), 2);
  });

  it("reports the bed-fit tier for the total width", () => {
    expect(printSize(100).fit).toBe("any"); // ~70 mm
    expect(printSize(250).fit).toBe("any"); // ~157 mm
    expect(printSize(400).fit).toBe("standard"); // ~243 mm
    expect(printSize(550).fit).toBe("large"); // ~330 mm
    expect(printSize(700).fit).toBe("too-large"); // ~417 mm
    expect(printSize(250).ratio).toBe(2000);
  });
});
