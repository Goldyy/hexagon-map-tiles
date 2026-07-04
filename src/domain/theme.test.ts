import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, THEMES, themeById } from "./theme";

const COLOR_KEYS = ["base", "buildings", "roads", "water", "green", "paths", "rail", "trees"] as const;
const HEX = /^#[0-9a-f]{6}$/i;

describe("Theme catalogue", () => {
  it("exposes exactly sandstone, daylight, night in that order", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(["sandstone", "daylight", "night"]);
  });

  it("defaults to sandstone", () => {
    expect(DEFAULT_THEME.id).toBe("sandstone");
    expect(THEMES[0]).toBe(DEFAULT_THEME);
  });

  it("resolves unknown or nullish ids to sandstone", () => {
    expect(themeById("nope").id).toBe("sandstone");
    expect(themeById(null).id).toBe("sandstone");
    expect(themeById(undefined).id).toBe("sandstone");
  });

  it("resolves known ids to their theme", () => {
    expect(themeById("night").id).toBe("night");
    expect(themeById("daylight").id).toBe("daylight");
  });

  it("gives every theme all eight parseable hex colors", () => {
    for (const theme of THEMES) {
      for (const key of COLOR_KEYS) {
        expect(theme.colors[key]).toMatch(HEX);
      }
    }
  });

  it("gives every theme a preview environment", () => {
    for (const theme of THEMES) {
      expect(theme.environment.skyTop).toMatch(HEX);
      expect(theme.environment.skyBottom).toMatch(HEX);
      expect(theme.environment.fog).toMatch(HEX);
      expect(theme.environment.ambientIntensity).toBeGreaterThan(0);
      expect(theme.environment.directionalIntensity).toBeGreaterThan(0);
    }
  });
});
