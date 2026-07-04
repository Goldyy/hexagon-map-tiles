import { describe, expect, it } from "vitest";

import {
  hashSeed,
  mulberry32,
  pointInPolygon,
  scatterTrees,
  SCATTER_SPACING_METERS,
  TREE_CAP,
} from "./tree-scatter";

type Position = [number, number];
type Polygon = Position[][];

const square = (min: number, max: number): Polygon => [
  [
    [min, min],
    [max, min],
    [max, max],
    [min, max],
    [min, min],
  ],
];

describe("hashSeed / mulberry32", () => {
  it("is a stable FNV-1a 32-bit hash", () => {
    // FNV-1a offset basis for the empty string.
    expect(hashSeed("")).toBe(0x811c9dc5);
    // Deterministic and distinct across inputs, always an unsigned 32-bit int.
    expect(hashSeed("foobar")).toBe(hashSeed("foobar"));
    expect(hashSeed("foobar")).not.toBe(hashSeed("barfoo"));
    expect(hashSeed("a")).toBeGreaterThanOrEqual(0);
    expect(hashSeed("a")).toBeLessThanOrEqual(0xffffffff);
  });

  it("produces a deterministic [0,1) sequence from a seed", () => {
    const first = mulberry32(1234);
    const second = mulberry32(1234);
    const a = [first(), first(), first()];
    const b = [second(), second(), second()];
    expect(a).toEqual(b);
    for (const value of a) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("pointInPolygon", () => {
  it("respects the outer ring", () => {
    const polygon = square(-10, 10);
    expect(pointInPolygon([0, 0], polygon)).toBe(true);
    expect(pointInPolygon([20, 0], polygon)).toBe(false);
  });

  it("excludes points inside a hole", () => {
    const polygon: Polygon = [
      [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10],
        [-10, -10],
      ],
      [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
        [-3, -3],
      ],
    ];
    expect(pointInPolygon([0, 0], polygon)).toBe(false);
    expect(pointInPolygon([7, 7], polygon)).toBe(true);
  });
});

describe("scatterTrees", () => {
  const seedText = "52.520000,13.405000,500";

  it("is deterministic for identical input", () => {
    const input = { forests: [square(-50, 50)], mappedTrees: [] as Position[], seedText };
    const first = scatterTrees(input);
    const second = scatterTrees(input);
    expect(first.placements).toEqual(second.placements);
  });

  it("produces different placements for a different seedText", () => {
    const forests = [square(-50, 50)];
    const first = scatterTrees({ forests, mappedTrees: [], seedText });
    const second = scatterTrees({ forests, mappedTrees: [], seedText: "0.000000,0.000000,500" });
    expect(first.placements).not.toEqual(second.placements);
  });

  it("scatters a plausible density across a 100x100 m forest", () => {
    const forest = square(-50, 50);
    const { placements } = scatterTrees({ forests: [forest], mappedTrees: [], seedText });
    expect(placements.length).toBeGreaterThanOrEqual(40);
    expect(placements.length).toBeLessThanOrEqual(90);
    for (const placement of placements) {
      expect(pointInPolygon([placement.x, placement.z], forest)).toBe(true);
    }
  });

  it("never scatters a tree inside a forest hole", () => {
    const forest: Polygon = [
      [
        [-100, -100],
        [100, -100],
        [100, 100],
        [-100, 100],
        [-100, -100],
      ],
      [
        [-40, -40],
        [40, -40],
        [40, 40],
        [-40, 40],
        [-40, -40],
      ],
    ];
    const { placements } = scatterTrees({ forests: [forest], mappedTrees: [], seedText });
    expect(placements.length).toBeGreaterThan(0);
    const hole: Polygon = [
      [
        [-40, -40],
        [40, -40],
        [40, 40],
        [-40, 40],
        [-40, -40],
      ],
    ];
    for (const placement of placements) {
      expect(pointInPolygon([placement.x, placement.z], hole)).toBe(false);
    }
  });

  it("enforces the cap and counts the remainder", () => {
    const { placements, capped } = scatterTrees({
      forests: [square(-300, 300)],
      mappedTrees: [],
      seedText,
      cap: 10,
    });
    expect(placements.length).toBe(10);
    expect(capped).toBeGreaterThan(0);
  });

  it("places mapped trees before scattered trees", () => {
    const mappedTrees: Position[] = [
      [1, 2],
      [3, 4],
    ];
    const { placements, scattered } = scatterTrees({
      forests: [square(-50, 50)],
      mappedTrees,
      seedText,
    });
    expect(scattered).toBeGreaterThan(0);
    expect(placements.length).toBe(mappedTrees.length + scattered);
    expect([placements[0].x, placements[0].z]).toEqual([1, 2]);
    expect([placements[1].x, placements[1].z]).toEqual([3, 4]);
  });
});

describe("constants", () => {
  it("exposes the documented cap and spacing", () => {
    expect(TREE_CAP).toBe(2_000);
    expect(SCATTER_SPACING_METERS).toBe(12);
  });
});
