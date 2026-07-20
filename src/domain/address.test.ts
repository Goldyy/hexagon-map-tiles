import { describe, expect, it } from "vitest";

import type { PartAddress, TilePart } from "../geometry/generate-tile";
import {
  findBuildingsAtCoordinate,
  findBuildingsByAddress,
  formatAddress,
  formatAddresses,
  parseAddressQuery,
} from "./address";

function part(name: string, addresses?: PartAddress[], footprint?: [number, number][][]): TilePart {
  return {
    name,
    geometry: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() },
    addresses,
    footprint,
  };
}

describe("formatAddress / formatAddresses", () => {
  it("joins street and house number, tolerating missing pieces", () => {
    expect(formatAddress({ street: "Rheinstraße", housenumber: "12" })).toBe("Rheinstraße 12");
    expect(formatAddress({ street: "Rheinstraße" })).toBe("Rheinstraße");
    expect(formatAddress({ housenumber: "12" })).toBe("12");
    expect(formatAddress(undefined)).toBeNull();
  });

  it("joins multiple addresses into one label", () => {
    expect(
      formatAddresses([
        { street: "Rheinstraße", housenumber: "12" },
        { street: "Rheinstraße", housenumber: "14" },
      ]),
    ).toBe("Rheinstraße 12 · Rheinstraße 14");
    expect(formatAddresses([])).toBeNull();
    expect(formatAddresses(undefined)).toBeNull();
  });
});

describe("parseAddressQuery", () => {
  it("splits street and house number, requiring both", () => {
    expect(parseAddressQuery("Rheinstraße 12")).toEqual({ street: "Rheinstraße", housenumber: "12" });
    expect(parseAddressQuery("Obere Wilhelmstraße 32a")).toEqual({
      street: "Obere Wilhelmstraße",
      housenumber: "32a",
    });
    expect(parseAddressQuery("Rheinstraße, 12")).toEqual({ street: "Rheinstraße", housenumber: "12" });
    expect(parseAddressQuery("Rheinstraße")).toBeNull();
    expect(parseAddressQuery("")).toBeNull();
  });
});

describe("findBuildingsByAddress", () => {
  const parts = [
    part("Building_way_1", [{ street: "Rheinstraße", housenumber: "12" }]),
    part("Building_way_1_2", [{ street: "Rheinstraße", housenumber: "12" }]),
    part("Building_way_2", [
      { street: "Rheinstraße", housenumber: "14" },
      { street: "Rheinstraße", housenumber: "16" },
    ]),
    part("Building_way_3", [{ street: "Obere Wilhelmstraße", housenumber: "32a" }]),
    part("Building_way_4"),
  ];

  it("finds every part of the addressed building, exactly", () => {
    const matches = findBuildingsByAddress(parts, "Rheinstraße 12");
    expect(matches.map((match) => match.name)).toEqual(["Building_way_1", "Building_way_1_2"]);
  });

  it("matches any of a building's several addresses", () => {
    expect(findBuildingsByAddress(parts, "Rheinstraße 16").map((match) => match.name)).toEqual(["Building_way_2"]);
  });

  it("matches case-insensitively and expands the Str. abbreviation", () => {
    expect(findBuildingsByAddress(parts, "rheinstr. 14").map((match) => match.name)).toEqual(["Building_way_2"]);
    expect(findBuildingsByAddress(parts, "OBERE WILHELMSTR 32 a").map((match) => match.name)).toEqual([
      "Building_way_3",
    ]);
  });

  it("returns nothing for unknown addresses or street-only queries", () => {
    expect(findBuildingsByAddress(parts, "Rheinstraße 99")).toEqual([]);
    expect(findBuildingsByAddress(parts, "Rheinstraße")).toEqual([]);
  });
});

describe("findBuildingsAtCoordinate", () => {
  it("returns the building whose footprint contains the geocoded point", () => {
    // ~111 m per 0.001° latitude at the equator; footprint is a 200 m square
    // around the tile center in projected meters.
    const center = { latitude: 0, longitude: 0 };
    const parts = [
      part("Building_way_1", undefined, [
        [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100],
          [-100, -100],
        ],
      ]),
      part("Building_way_2", undefined, [
        [
          [200, 200],
          [300, 200],
          [300, 300],
          [200, 300],
          [200, 200],
        ],
      ]),
    ];
    const inside = findBuildingsAtCoordinate(parts, center, { latitude: 0.0001, longitude: 0.0001 });
    expect(inside.map((match) => match.name)).toEqual(["Building_way_1"]);
    const outside = findBuildingsAtCoordinate(parts, center, { latitude: 0.01, longitude: 0.01 });
    expect(outside).toEqual([]);
  });
});
