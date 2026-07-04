import { describe, expect, it } from "vitest";

import { parseOsmColor, resolveBuildingColors } from "./building-color";

describe("parseOsmColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseOsmColor("#ff0000")).toEqual([1, 0, 0]);
  });

  it("parses CSS named colours from three's Color.NAMES table", () => {
    expect(parseOsmColor("red")).toEqual([1, 0, 0]);
  });

  it("parses 3-digit hex", () => {
    expect(parseOsmColor("#f00")).toEqual([1, 0, 0]);
  });

  it("returns null for an unrecognised string", () => {
    expect(parseOsmColor("notacolor")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseOsmColor(undefined)).toBeNull();
  });
});

describe("resolveBuildingColors", () => {
  it("resolves wall from building:colour and roof from roof:colour", () => {
    const colors = resolveBuildingColors({
      "building:colour": "#336699",
      "roof:colour": "white",
    });
    expect(colors.wall).not.toBeNull();
    expect(colors.roof).toEqual([1, 1, 1]);
  });

  it("returns null wall and roof when the tags are absent", () => {
    expect(resolveBuildingColors({})).toEqual({ wall: null, roof: null });
  });

  it("treats an invalid tag as absent", () => {
    expect(resolveBuildingColors({ "building:colour": "notacolor" })).toEqual({
      wall: null,
      roof: null,
    });
  });
});
