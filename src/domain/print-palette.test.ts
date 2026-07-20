import { describe, expect, it } from "vitest";

import type { TileColors } from "../export/export-glb";
import { FRAME_COLOR, reducePalette } from "./print-palette";

const colors: TileColors = {
  base: "#d8c7a5",
  buildings: "#b3a389",
  roads: "#777267",
  water: "#4f8796",
  green: "#9fae7e",
  paths: "#cfc3a4",
  rail: "#8f8577",
  trees: "#6f8f5a",
};

function distinctModelColors(palette: { colors: TileColors; frame: string }): Set<string> {
  return new Set(Object.values(palette.colors));
}

describe("reducePalette", () => {
  it("passes everything through untouched for 'all'", () => {
    const palette = reducePalette(colors, "all");
    expect(palette.colors).toEqual(colors);
    expect(palette.frame).toBe(FRAME_COLOR);
  });

  it("folds the model palette to exactly the requested number of colors", () => {
    for (const slots of [3, 4, 5, 6] as const) {
      expect(distinctModelColors(reducePalette(colors, slots)).size).toBe(slots);
    }
  });

  it("never uses the tray brown inside the model — the tray is a separate print", () => {
    for (const slots of [3, 4, 5, 6, "filament", "all"] as const) {
      const palette = reducePalette(colors, slots);
      expect(distinctModelColors(palette).has(FRAME_COLOR)).toBe(false);
      expect(palette.frame).toBe(FRAME_COLOR);
    }
  });

  it("groups layers semantically at budget 3: grounds, linework, greens", () => {
    const palette = reducePalette(colors, 3);
    // Sand tones share the base color…
    expect(palette.colors.buildings).toBe(colors.base);
    expect(palette.colors.paths).toBe(colors.base);
    // …linework shares the road gray…
    expect(palette.colors.rail).toBe(colors.roads);
    // …and nature shares the green.
    expect(palette.colors.trees).toBe(colors.green);
    expect(palette.colors.water).toBe(colors.green);
  });

  it("maps the fixed filament kit: white plate/linework, red buildings, green nature, blue water", () => {
    const palette = reducePalette(colors, "filament");
    for (const key of ["base", "roads", "paths", "rail"] as const) {
      expect(palette.colors[key]).toBe("#ffffff");
    }
    // Buildings get their own tone, distinct from the white plate.
    expect(palette.colors.buildings).toBe("#c2311f");
    expect(palette.colors.green).toBe(palette.colors.trees);
    expect(palette.colors.green).not.toBe("#ffffff");
    expect(palette.colors.water).not.toBe(palette.colors.green);
    expect(palette.frame).toBe(FRAME_COLOR);
    // Exactly the four kit colors in the model (the brown tray comes on top).
    expect(new Set(Object.values(palette.colors)).size).toBe(4);
  });

  it("keeps buildings on their own color from budget 4 up", () => {
    for (const slots of [4, 5, 6] as const) {
      const palette = reducePalette(colors, slots);
      expect(palette.colors.buildings).toBe(colors.buildings);
      expect(Object.entries(palette.colors).filter(([, value]) => value === colors.buildings)).toHaveLength(1);
    }
  });
});
