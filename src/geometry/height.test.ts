import { describe, expect, it } from "vitest";

import { resolveBuildingHeight } from "./height";

describe("Building Height", () => {
  it("uses explicit metric height before floor count", () => {
    expect(resolveBuildingHeight({ height: "14.5", "building:levels": "8" })).toEqual({
      height: 14.5,
      minHeight: 0,
      source: "explicit",
    });
  });

  it("derives height and minimum height from levels", () => {
    expect(
      resolveBuildingHeight({ "building:levels": "4", "building:min_level": "1" }),
    ).toEqual({ height: 12, minHeight: 3, source: "levels" });
  });

  it("converts explicit feet to meters", () => {
    expect(resolveBuildingHeight({ height: "30 ft", min_height: "3 ft" })).toEqual({
      height: 9.144,
      minHeight: 0.9144,
      source: "explicit",
    });
  });
});
