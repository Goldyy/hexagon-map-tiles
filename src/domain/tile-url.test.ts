import { describe, expect, it } from "vitest";

import { parseTileUrl, serializeTileUrl } from "./tile-url";

describe("Tile share URL", () => {
  it("parses a v1 URL as sandstone with color params as overrides", () => {
    const config = parseTileUrl("?lat=52.52&lon=13.405&span=500&buildings=%23112233");
    expect(config).not.toBeNull();
    expect(config!.themeId).toBe("sandstone");
    expect(config!.center).toEqual({ latitude: 52.52, longitude: 13.405 });
    expect(config!.span).toBe(500);
    expect(config!.overrides.buildings).toBe("#112233");
    expect(config!.overrides.base).toBeUndefined();
    expect(config!.layers).toEqual({ green: true, pathsRail: true, trees: true });
    expect(config!.useOsmColors).toBe(false);
  });

  it("round-trips stably", () => {
    const input = "?lat=52.52&lon=13.405&span=500&buildings=%23112233";
    const once = serializeTileUrl(parseTileUrl(input)!);
    const twice = serializeTileUrl(parseTileUrl(once)!);
    expect(twice).toBe(once);
  });

  it("parses a layers CSV as only the listed layers enabled", () => {
    const config = parseTileUrl("?lat=52.52&lon=13.405&span=500&layers=trees");
    expect(config!.layers).toEqual({ green: false, pathsRail: false, trees: true });
  });

  it("omits the layers param when all layers are enabled", () => {
    const serialized = serializeTileUrl({
      center: { latitude: 52.52, longitude: 13.405 },
      span: 500,
      themeId: "sandstone",
      overrides: {},
      layers: { green: true, pathsRail: true, trees: true },
      useOsmColors: false,
    });
    expect(serialized).not.toContain("layers=");
    expect(serialized).not.toContain("theme=");
    expect(serialized).not.toContain("osmcolors=");
  });

  it("round-trips a night theme with osm colors", () => {
    const input = "?lat=48.137154&lon=11.576124&span=750&theme=night&osmcolors=1";
    const config = parseTileUrl(input)!;
    expect(config.themeId).toBe("night");
    expect(config.useOsmColors).toBe(true);
    const once = serializeTileUrl(config);
    expect(once).toContain("theme=night");
    expect(once).toContain("osmcolors=1");
    expect(serializeTileUrl(parseTileUrl(once)!)).toBe(once);
  });

  it("writes color overrides only when they differ from the theme value", () => {
    const serialized = serializeTileUrl({
      center: { latitude: 52.52, longitude: 13.405 },
      span: 500,
      themeId: "sandstone",
      overrides: { base: "#d8c7a5", buildings: "#112233" },
      layers: { green: true, pathsRail: true, trees: true },
      useOsmColors: false,
    });
    expect(serialized).not.toContain("base=");
    expect(serialized).toContain("buildings=%23112233");
  });

  it("returns null for an invalid latitude", () => {
    expect(parseTileUrl("?lat=abc&lon=13.405&span=500")).toBeNull();
  });

  it("returns null for an out-of-range span", () => {
    expect(parseTileUrl("?lat=52.52&lon=13.405&span=50")).toBeNull();
  });

  it("returns null for a non-numeric span", () => {
    expect(parseTileUrl("?lat=52.52&lon=13.405&span=abc")).toBeNull();
  });
});
