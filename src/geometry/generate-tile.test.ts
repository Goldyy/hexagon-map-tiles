import { describe, expect, it } from "vitest";

import {
  generateTile,
  type SourceBuilding,
  type SourceGreen,
  type SourcePath,
  type SourceRoad,
  type SourceWater,
} from "./generate-tile";

function topSurfaceCovers(
  geometry: { indices: Uint32Array; positions: Float32Array },
  point: { x: number; z: number },
  top: number,
): boolean {
  const { indices, positions } = geometry;
  return Array.from({ length: indices.length / 3 }, (_, triangle) => {
    const vertices = [0, 1, 2].map((offset) => {
      const positionIndex = indices[triangle * 3 + offset] * 3;
      return {
        x: positions[positionIndex],
        y: positions[positionIndex + 1],
        z: positions[positionIndex + 2],
      };
    });
    if (!vertices.every(({ y }) => Math.abs(y - top) < 0.001)) return false;
    const [a, b, c] = vertices;
    const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    const first =
      ((b.z - c.z) * (point.x - c.x) + (c.x - b.x) * (point.z - c.z)) / denominator;
    const second =
      ((c.z - a.z) * (point.x - c.x) + (a.x - c.x) * (point.z - c.z)) / denominator;
    const third = 1 - first - second;
    return first >= 0 && second >= 0 && third >= 0;
  }).some(Boolean);
}

describe("Digital Tile Asset generation", () => {
  it("returns empty enrichment layers when sources are empty", () => {
    const tile = generateTile(
      { center: { latitude: 52.52, longitude: 13.405 }, span: 500 },
      { buildings: [], roads: [], water: [], green: [], paths: [], rail: [], trees: [] },
    );
    expect(tile.greenSurfaces.indices.length).toBe(0);
    expect(tile.pathSurfaces.indices.length).toBe(0);
    expect(tile.railSurfaces.indices.length).toBe(0);
    expect(tile.trees.indices.length).toBe(0);
    expect(tile.treeMetrics).toEqual({ mapped: 0, scattered: 0, capped: 0, triangles: 0 });
  });

  it("creates a Tile Base and fallback-height Building Massing", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [
          {
            id: "building/1",
            tags: { building: "yes" },
            polygons: [
              [
                [
                  [-0.0001, -0.0001],
                  [0.0001, -0.0001],
                  [0.0001, 0.0001],
                  [-0.0001, 0.0001],
                  [-0.0001, -0.0001],
                ],
              ],
            ],
          },
        ],
        roads: [],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(result.base.positions.length).toBeGreaterThan(0);
    expect(result.buildings.positions.length).toBeGreaterThan(0);
    expect(result.metrics).toMatchObject({ fallback: 1, generated: 1, skipped: 0 });
  });

  it("places a mapped tree on the same side of the Tile as a building at the same coordinate", () => {
    // Alignment guard: a building and a mapped tree at the *same* northerly
    // coordinate must render on the same side of the tile. The documented
    // invariant maps north to world -Z, so both must land at negative z. A sign
    // mismatch means the tree layer is mirrored across the north-south axis.
    const north = 0.002; // ~222 m north of the equator-centred tile
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [
          {
            id: "building/1",
            tags: { building: "yes" },
            polygons: [[[[-0.0001, north - 0.0001], [0.0001, north - 0.0001], [0.0001, north + 0.0001], [-0.0001, north + 0.0001], [-0.0001, north - 0.0001]]]],
          },
        ],
        roads: [],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [{ id: "tree/1", position: [0.0005, north] }],
      },
    );

    const meanZ = (positions: Float32Array): number => {
      let sum = 0;
      let count = 0;
      for (let index = 2; index < positions.length; index += 3) {
        sum += positions[index];
        count += 1;
      }
      return sum / count;
    };

    const buildingZ = meanZ(result.buildings.positions);
    const treeZ = meanZ(result.trees.positions);
    expect(result.trees.positions.length).toBeGreaterThan(0);
    // Same side of the tile: the building sits at negative z (north = -Z), and
    // the tree at the same coordinate must too.
    expect(buildingZ).toBeLessThan(0);
    expect(treeZ).toBeLessThan(0);
    // And they must be close, not mirrored ~445 m apart.
    expect(Math.abs(treeZ - buildingZ)).toBeLessThan(10);
  });

  it("emits a per-vertex Building rise attribute that grows toward the Tile edge", () => {
    const empty = { roads: [], water: [], green: [], paths: [], rail: [], trees: [] };
    const box = (lon: number): SourceBuilding["polygons"] => [
      [
        [
          [lon - 0.00005, -0.00005],
          [lon + 0.00005, -0.00005],
          [lon + 0.00005, 0.00005],
          [lon - 0.00005, 0.00005],
          [lon - 0.00005, -0.00005],
        ],
      ],
    ];

    const centerTile = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [{ id: "b/center", tags: { building: "yes", height: "10" }, polygons: box(0) }], ...empty },
    );
    const edgeTile = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [{ id: "b/edge", tags: { building: "yes", height: "10" }, polygons: box(0.002) }], ...empty },
    );

    expect(centerTile.buildings.rise).toBeDefined();
    const centerRise = centerTile.buildings.rise!;
    const edgeRise = edgeTile.buildings.rise!;
    expect(centerRise.length).toBe(centerTile.buildings.positions.length / 3);
    expect(Array.from(centerRise).every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(Array.from(edgeRise).every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(edgeRise[0]).toBeGreaterThan(centerRise[0]);
  });

  it("keeps ground slabs and trees within their height envelopes", () => {
    // Regression guard for the "phantom strip over a roof" class of defect: a
    // mis-extruded slab or a stretched tree (e.g. a degenerate trunk) would rise
    // above these envelopes and could visually cross Building Massing.
    const tile = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [
          { id: "road/1", tags: { highway: "residential", width: "8" }, lines: [[[-0.002, 0], [0.002, 0]]], polygons: [] },
        ],
        water: [
          { id: "water/1", tags: { natural: "water" }, lines: [], polygons: [[[[0.0005, 0.0005], [0.0009, 0.0005], [0.0009, 0.0009], [0.0005, 0.0009], [0.0005, 0.0005]]]] },
        ],
        green: [
          { id: "green/1", tags: { natural: "wood" }, polygons: [[[[-0.0009, -0.0009], [-0.0002, -0.0009], [-0.0002, -0.0002], [-0.0009, -0.0002], [-0.0009, -0.0009]]]] },
        ],
        paths: [
          { id: "path/1", tags: { highway: "footway" }, lines: [[[-0.002, 0.0005], [0.002, 0.0005]]], polygons: [] },
        ],
        rail: [
          { id: "rail/1", tags: { railway: "tram" }, lines: [[[-0.002, -0.0005], [0.002, -0.0005]]] },
        ],
        trees: [{ id: "tree/1", position: [0.0003, -0.0003] }],
      },
    );

    const maxY = (positions: Float32Array): number => {
      let max = -Infinity;
      for (let index = 1; index < positions.length; index += 3) {
        if (positions[index] > max) max = positions[index];
      }
      return max;
    };

    const slabTop = 0.05 + 1e-6;
    expect(maxY(tile.roadSurfaces.positions)).toBeLessThanOrEqual(slabTop);
    expect(maxY(tile.pathSurfaces.positions)).toBeLessThanOrEqual(slabTop);
    expect(maxY(tile.railSurfaces.positions)).toBeLessThanOrEqual(slabTop);
    expect(maxY(tile.waterSurfaces.positions)).toBeLessThanOrEqual(slabTop);
    expect(maxY(tile.greenSurfaces.positions)).toBeLessThanOrEqual(slabTop);
    // Tree template tops out at 6.8 m (trunk 2.2, canopy centre 4.4 + radius 2.4);
    // scatter scale is capped at 1.2, plus the 0.05 slab lift.
    expect(tile.trees.positions.length).toBeGreaterThan(0);
    expect(maxY(tile.trees.positions)).toBeLessThanOrEqual(6.8 * 1.2 + 0.05 + 1e-6);
  });

  it("never scatters trees onto a Water Surface overlapping the forest", () => {
    // A forest band whose eastern half is covered by a mapped water area: the
    // scatter must honour the ground-surface subtraction chain and keep every
    // tree west of the waterline. (0.0009° ≈ 100 m at the equator.)
    const tile = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [
          {
            id: "water/1",
            tags: { natural: "water" },
            lines: [],
            polygons: [[[[0, -0.0012], [0.0012, -0.0012], [0.0012, 0.0001], [0, 0.0001], [0, -0.0012]]]],
          },
        ],
        green: [
          {
            id: "green/1",
            tags: { natural: "wood" },
            polygons: [[[[-0.0009, -0.0009], [0.0009, -0.0009], [0.0009, -0.0002], [-0.0009, -0.0002], [-0.0009, -0.0009]]]],
          },
        ],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    // The dry western half still grows trees…
    expect(tile.treeMetrics.scattered).toBeGreaterThan(0);
    // …but no tree vertex reaches into the water east of x = 0. The widest a
    // kept tree can lean over the waterline is one canopy radius (2.4 m at the
    // 1.2 scale cap), so 3 m is a safe ceiling; pre-fix, scattered trees stood
    // tens of metres inside the Water Surface.
    let maxX = -Infinity;
    for (let index = 0; index < tile.trees.positions.length; index += 3) {
      if (tile.trees.positions[index] > maxX) maxX = tile.trees.positions[index];
    }
    expect(maxX).toBeLessThan(3);
  });

  it("drops mapped natural=tree points that fall inside a Water Surface", () => {
    // Two surveyed trees: one on dry land west of the waterline, one standing
    // inside a mapped water area to the east. Only the dry tree may survive.
    const tile = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [
          {
            id: "water/1",
            tags: { natural: "water" },
            lines: [],
            polygons: [[[[0.0002, -0.0006], [0.0012, -0.0006], [0.0012, 0.0006], [0.0002, 0.0006], [0.0002, -0.0006]]]],
          },
        ],
        green: [],
        paths: [],
        rail: [],
        trees: [
          { id: "tree/dry", position: [-0.0006, 0] },
          { id: "tree/wet", position: [0.0007, 0] },
        ],
      },
    );

    // Exactly the dry tree is kept; the one in the water is dropped.
    expect(tile.treeMetrics.mapped).toBe(1);
    expect(tile.treeMetrics.scattered).toBe(0);
    // And no tree geometry reaches east of the waterline (x ≈ 22 m). One canopy
    // radius of lean (2.4 m at the 1.2 scale cap) off the dry tree at x ≈ -66 m
    // stays comfortably negative.
    let maxX = -Infinity;
    for (let index = 0; index < tile.trees.positions.length; index += 3) {
      if (tile.trees.positions[index] > maxX) maxX = tile.trees.positions[index];
    }
    expect(maxX).toBeLessThan(0);
  });

  it("drops mapped trees standing on a street or inside a building", () => {
    // Three surveyed trees: one on open ground, one on a road corridor, one on a
    // building footprint. Only the open-ground tree may survive — trees must not
    // intersect streets or Building Massing.
    const tile = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [
          {
            id: "building/1",
            tags: { building: "yes" },
            polygons: [[[[0.0004, 0.0004], [0.0010, 0.0004], [0.0010, 0.0010], [0.0004, 0.0010], [0.0004, 0.0004]]]],
          },
        ],
        roads: [
          { id: "road/1", tags: { highway: "primary", width: "12" }, lines: [[[-0.0012, -0.0006], [0.0012, -0.0006]]], polygons: [] },
        ],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [
          { id: "tree/open", position: [-0.0008, 0.0006] },
          { id: "tree/road", position: [0, -0.0006] },
          { id: "tree/building", position: [0.0007, 0.0007] },
        ],
      },
    );

    // Only the open-ground tree is kept.
    expect(tile.treeMetrics.mapped).toBe(1);
    expect(tile.treeMetrics.scattered).toBe(0);
    expect(tile.trees.positions.length).toBeGreaterThan(0);
  });

  it("clips Building Massing to the Tile Boundary", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 100 },
      {
        buildings: [
          {
            id: "building/crossing",
            tags: { building: "yes", height: "12" },
            polygons: [
              [[[-0.002, -0.002], [0.002, -0.002], [0.002, 0.002], [-0.002, 0.002], [-0.002, -0.002]]],
            ],
          },
        ],
        roads: [],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    const positions = Array.from(result.buildings.positions);
    const radius = 100 / Math.sqrt(3);
    for (let index = 0; index < positions.length; index += 3) {
      const x = Math.abs(positions[index]);
      const z = Math.abs(positions[index + 2]);
      expect(x).toBeLessThanOrEqual(radius + 0.01);
      expect(z).toBeLessThanOrEqual(50.01);
      expect(Math.sqrt(3) * x + z).toBeLessThanOrEqual(100.01);
    }
  });

  it("preserves courtyard holes while clipping Building Massing", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [
          {
            id: "building/courtyard",
            tags: { building: "yes", height: "10" },
            polygons: [[
              [[-0.0002, -0.0002], [0.0002, -0.0002], [0.0002, 0.0002], [-0.0002, 0.0002], [-0.0002, -0.0002]],
              [[-0.00005, -0.00005], [-0.00005, 0.00005], [0.00005, 0.00005], [0.00005, -0.00005], [-0.00005, -0.00005]],
            ]],
          },
        ],
        roads: [],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );
    const { indices, positions } = result.buildings;
    const originIsCovered = Array.from({ length: indices.length / 3 }, (_, triangle) => {
      const vertices = [0, 1, 2].map((offset) => {
        const positionIndex = indices[triangle * 3 + offset] * 3;
        return {
          x: positions[positionIndex],
          y: positions[positionIndex + 1],
          z: positions[positionIndex + 2],
        };
      });
      if (!vertices.every(({ y }) => Math.abs(y - 10) < 0.001)) return false;
      const [a, b, c] = vertices;
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const first = ((b.z - c.z) * -c.x + (c.x - b.x) * -c.z) / denominator;
      const second = ((c.z - a.z) * -c.x + (a.x - c.x) * -c.z) / denominator;
      const third = 1 - first - second;
      return first >= 0 && second >= 0 && third >= 0;
    }).some(Boolean);

    expect(originIsCovered).toBe(false);
  });

  it("aligns Tile Base vertices with the flat-top Tile Boundary", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 600 },
      { buildings: [], roads: [], water: [], green: [], paths: [], rail: [], trees: [] },
    );
    const radius = 600 / Math.sqrt(3);
    const positions = Array.from(result.base.positions);
    const hasEastVertex = positions.some((x, index) => {
      if (index % 3 !== 0) return false;
      const y = positions[index + 1];
      const z = positions[index + 2];
      return Math.abs(x - radius) < 0.01 && Math.abs(y) < 0.01 && Math.abs(z) < 0.01;
    });

    expect(hasEastVertex).toBe(true);
  });

  it("creates clipped Road Surface geometry from a highway centerline", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [
          {
            id: "way/road-1",
            tags: { highway: "residential", width: "8" },
            lines: [[[-0.01, 0], [0.01, 0]]],
            polygons: [],
          },
        ],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(result.roadSurfaces.positions.length).toBeGreaterThan(0);
    expect(result.roadMetrics).toMatchObject({
      explicit: 1,
      generated: 1,
      skipped: 0,
    });
  });

  it("gives Road Surfaces rounded caps and a 5 cm closed overlay", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [
          {
            id: "way/road-cap",
            tags: { highway: "service", width: "8" },
            lines: [[[0, 0], [0.0001, 0]]],
            polygons: [],
          },
        ],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );
    const positions = Array.from(result.roadSurfaces.positions);
    const xs = positions.filter((_, index) => index % 3 === 0);
    const ys = positions.filter((_, index) => index % 3 === 1);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-4.01);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-3.9);
    expect(Math.max(...xs)).toBeGreaterThan(15);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(0.05, 5);
  });

  it("fills the center of intersecting Road Surfaces", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [
          {
            id: "way/east-west",
            tags: { highway: "residential", width: "8" },
            polygons: [],
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
          {
            id: "way/north-south",
            tags: { highway: "residential", width: "8" },
            polygons: [],
            lines: [[[0, -0.001], [0, 0.001]]],
          },
        ],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );
    const { indices, positions } = result.roadSurfaces;
    const centerIsCovered = Array.from({ length: indices.length / 3 }, (_, triangle) => {
      const vertices = [0, 1, 2].map((offset) => {
        const positionIndex = indices[triangle * 3 + offset] * 3;
        return {
          x: positions[positionIndex],
          y: positions[positionIndex + 1],
          z: positions[positionIndex + 2],
        };
      });
      if (!vertices.every(({ y }) => Math.abs(y - 0.05) < 0.001)) return false;
      const [a, b, c] = vertices;
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const first = ((b.z - c.z) * -c.x + (c.x - b.x) * -c.z) / denominator;
      const second = ((c.z - a.z) * -c.x + (a.x - c.x) * -c.z) / denominator;
      const third = 1 - first - second;
      return first >= 0 && second >= 0 && third >= 0;
    }).some(Boolean);

    expect(centerIsCovered).toBe(true);
  });

  it("generates intersecting Road Surfaces without an output-ring failure", () => {
    const metersPerDegree = 111_319.49079327358;
    let state = 2;
    const random = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const toLonLat = ([x, y]: [number, number]): [number, number] => [
      x / metersPerDegree,
      y / metersPerDegree,
    ];
    const roads = Array.from({ length: 80 }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const crossAngle = angle + Math.PI + (random() - 0.5) * 0.8;
      const bend = (random() - 0.5) * 280;
      return {
        id: `road/${index}`,
        tags: { highway: index % 5 === 0 ? "primary" : "residential" },
        polygons: [],
        lines: [[
          toLonLat([Math.cos(angle) * 260, Math.sin(angle) * 260]),
          toLonLat([
            Math.cos(angle + Math.PI / 2) * bend,
            Math.sin(angle + Math.PI / 2) * bend,
          ]),
          toLonLat([Math.cos(crossAngle) * 260, Math.sin(crossAngle) * 260]),
        ]],
      };
    });

    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 300 },
      { buildings: [], roads, water: [], green: [], paths: [], rail: [], trees: [] },
    );

    expect(result.roadSurfaces.positions.length).toBeGreaterThan(0);
    expect(result.roadMetrics.generated).toBe(80);
  });

  it("joins adjacent Mainz source ways into one continuous Road Surface", () => {
    const result = generateTile(
      { center: { latitude: 49.999521, longitude: 8.273625 }, span: 800 },
      {
        buildings: [],
        roads: [
          {
            id: "way/1291329577",
            tags: { covered: "yes", highway: "service", service: "driveway" },
            polygons: [],
            lines: [[[8.2688817, 49.9992616], [8.2687279, 49.9993389]]],
          },
          {
            id: "way/1291329578",
            tags: { highway: "service", service: "driveway" },
            polygons: [],
            lines: [[
              [8.2689582, 49.999223],
              [8.2689301, 49.9992372],
              [8.2689168, 49.9992439],
              [8.2688817, 49.9992616],
            ]],
          },
        ],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(result.roadSurfaces.positions.length).toBeGreaterThan(0);
    expect(result.roadMetrics).toMatchObject({ generated: 2, skipped: 0 });
  });

  it("skips a degenerate Road Surface without invalidating valid roads", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [
          {
            id: "way/degenerate",
            tags: { highway: "service" },
            polygons: [],
            lines: [[[0, 0]]],
          },
          {
            id: "way/valid",
            tags: { highway: "residential" },
            polygons: [],
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(result.roadSurfaces.positions.length).toBeGreaterThan(0);
    expect(result.roadMetrics).toMatchObject({ generated: 1, skipped: 1 });
  });

  it("creates a closed Water Surface from a mapped inland water area", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [
          {
            id: "way/lake",
            tags: { natural: "water", water: "lake" },
            lines: [],
            polygons: [[[
              [-0.0002, -0.0002],
              [0.0002, -0.0002],
              [0.0002, 0.0002],
              [-0.0002, 0.0002],
              [-0.0002, -0.0002],
            ]]],
          },
        ],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );
    const ys = Array.from(result.waterSurfaces.positions).filter((_, index) => index % 3 === 1);

    expect(result.waterSurfaces.positions.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(0.05, 5);
    expect(result.waterMetrics).toMatchObject({ mapped: 1, generated: 1, skipped: 0 });
    expect(result.waterMetrics.triangles).toBe(result.waterSurfaces.indices.length / 3);
  });

  it("buffers a waterway centerline using resolved Waterway Width", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [
          {
            id: "way/stream",
            tags: { waterway: "stream" },
            polygons: [],
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );
    const positions = Array.from(result.waterSurfaces.positions);
    const zs = positions.filter((_, index) => index % 3 === 2);

    expect(result.waterSurfaces.positions.length).toBeGreaterThan(0);
    expect(Math.min(...zs)).toBeLessThanOrEqual(-0.9);
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(0.9);
    expect(result.waterMetrics).toMatchObject({ fallback: 1, generated: 1, skipped: 0 });
  });

  it("subtracts Road Surfaces from overlapping Water Surfaces", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [
          {
            id: "way/bridge",
            tags: { highway: "residential", width: "8" },
            polygons: [],
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        water: [
          {
            id: "way/lake",
            tags: { natural: "water" },
            lines: [],
            polygons: [[[
              [-0.0002, -0.0002],
              [0.0002, -0.0002],
              [0.0002, 0.0002],
              [-0.0002, 0.0002],
              [-0.0002, -0.0002],
            ]]],
          },
        ],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(topSurfaceCovers(result.waterSurfaces, { x: 0, z: 0 }, 0.05)).toBe(false);
    expect(topSurfaceCovers(result.waterSurfaces, { x: 0, z: 10 }, 0.05)).toBe(true);
  });

  it("preserves islands inside mapped Water Surfaces", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [
          {
            id: "relation/lake-island",
            tags: { natural: "water" },
            lines: [],
            polygons: [[
              [[-0.0002, -0.0002], [0.0002, -0.0002], [0.0002, 0.0002], [-0.0002, 0.0002], [-0.0002, -0.0002]],
              [[-0.00005, -0.00005], [-0.00005, 0.00005], [0.00005, 0.00005], [0.00005, -0.00005], [-0.00005, -0.00005]],
            ]],
          },
        ],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(topSurfaceCovers(result.waterSurfaces, { x: 0, z: 0 }, 0.05)).toBe(false);
    expect(topSurfaceCovers(result.waterSurfaces, { x: 0, z: 10 }, 0.05)).toBe(true);
  });

  it("skips a degenerate Water Surface without invalidating valid water", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [
          {
            id: "way/degenerate-water",
            tags: { waterway: "stream" },
            polygons: [],
            lines: [[[0, 0]]],
          },
          {
            id: "way/valid-water",
            tags: { waterway: "stream" },
            polygons: [],
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(result.waterSurfaces.positions.length).toBeGreaterThan(0);
    expect(result.waterMetrics).toMatchObject({ generated: 1, skipped: 1 });
  });

  it("clips Water Surfaces to the Tile Boundary", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 100 },
      {
        buildings: [],
        roads: [],
        water: [
          {
            id: "way/large-lake",
            tags: { natural: "water" },
            lines: [],
            polygons: [[[[-0.002, -0.002], [0.002, -0.002], [0.002, 0.002], [-0.002, 0.002], [-0.002, -0.002]]]],
          },
        ],
        green: [],
        paths: [],
        rail: [],
        trees: [],
      },
    );
    const positions = Array.from(result.waterSurfaces.positions);
    const radius = 100 / Math.sqrt(3);
    for (let index = 0; index < positions.length; index += 3) {
      const x = Math.abs(positions[index]);
      const z = Math.abs(positions[index + 2]);
      expect(x).toBeLessThanOrEqual(radius + 0.01);
      expect(z).toBeLessThanOrEqual(50.01);
      expect(Math.sqrt(3) * x + z).toBeLessThanOrEqual(100.01);
    }
  });

  it("creates a Green Surface from a mapped park polygon", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [],
        green: [
          {
            id: "way/park",
            tags: { leisure: "park" },
            polygons: [[[
              [-0.0004, -0.0004],
              [0.0004, -0.0004],
              [0.0004, 0.0004],
              [-0.0004, 0.0004],
              [-0.0004, -0.0004],
            ]]],
          },
        ],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(result.greenSurfaces.indices.length).toBeGreaterThan(0);
    expect(topSurfaceCovers(result.greenSurfaces, { x: 0, z: 0 }, 0.05)).toBe(true);
    expect(result.greenMetrics).toMatchObject({
      mapped: 1,
      generated: 1,
      skipped: 0,
      explicit: 0,
      fallback: 0,
    });
    expect(result.greenMetrics.triangles).toBe(result.greenSurfaces.indices.length / 3);
  });

  it("subtracts higher-priority Road Surfaces from overlapping Green Surfaces", () => {
    const green: SourceGreen[] = [
      {
        id: "way/park",
        tags: { leisure: "park" },
        polygons: [[[
          [-0.0004, -0.0004],
          [0.0004, -0.0004],
          [0.0004, 0.0004],
          [-0.0004, 0.0004],
          [-0.0004, -0.0004],
        ]]],
      },
    ];
    const road: SourceRoad = {
      id: "way/road",
      tags: { highway: "residential", width: "8" },
      polygons: [],
      lines: [[[-0.001, 0], [0.001, 0]]],
    };

    const withoutRoad = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [], roads: [], water: [], green, paths: [], rail: [], trees: [] },
    );
    const withRoad = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [], roads: [road], water: [], green, paths: [], rail: [], trees: [] },
    );

    // The road strip is carved out of the green top face.
    expect(topSurfaceCovers(withRoad.greenSurfaces, { x: 0, z: 0 }, 0.05)).toBe(false);
    // Green still exists clear of the road corridor.
    expect(topSurfaceCovers(withRoad.greenSurfaces, { x: 0, z: 20 }, 0.05)).toBe(true);
    // The road splits the intact green quad into two disjoint slabs, so the
    // carved green produces a different (here larger) triangle count than the
    // intact no-road case — proof the subtraction actually reshaped it.
    expect(withRoad.greenMetrics.triangles).not.toBe(withoutRoad.greenMetrics.triangles);
    expect(withRoad.greenMetrics.triangles).toBeGreaterThan(withoutRoad.greenMetrics.triangles);
    // The higher-priority layers are untouched by green processing.
    expect(withRoad.roadMetrics).toMatchObject({ generated: 1, skipped: 0 });
    expect(withRoad.waterMetrics).toEqual(withoutRoad.waterMetrics);
  });

  it("skips Green Surface generation when the green layer is disabled", () => {
    const result = generateTile(
      {
        center: { latitude: 0, longitude: 0 },
        span: 500,
        layers: { green: false, pathsRail: true, trees: true },
      },
      {
        buildings: [],
        roads: [],
        water: [],
        green: [
          {
            id: "way/park",
            tags: { leisure: "park" },
            polygons: [[[
              [-0.0004, -0.0004],
              [0.0004, -0.0004],
              [0.0004, 0.0004],
              [-0.0004, 0.0004],
              [-0.0004, -0.0004],
            ]]],
          },
        ],
        paths: [],
        rail: [],
        trees: [],
      },
    );

    expect(result.greenSurfaces.indices.length).toBe(0);
    expect(result.greenMetrics).toEqual({
      mapped: 0,
      explicit: 0,
      fallback: 0,
      generated: 0,
      skipped: 0,
      triangles: 0,
    });
  });

  it("subtracts higher-priority Water Surfaces from overlapping Green Surfaces", () => {
    const green: SourceGreen[] = [
      {
        id: "way/park",
        tags: { leisure: "park" },
        polygons: [[[
          [-0.0004, -0.0004],
          [0.0004, -0.0004],
          [0.0004, 0.0004],
          [-0.0004, 0.0004],
          [-0.0004, -0.0004],
        ]]],
      },
    ];
    // A diagonal water polygon covering the z < x half of the green quad, so the
    // green is carved back to a single upper-left triangle (fewer triangles than
    // the intact quad).
    const water: SourceWater[] = [
      {
        id: "way/lake",
        tags: { natural: "water" },
        lines: [],
        polygons: [[[
          [-0.0004, -0.0004],
          [0.0004, -0.0004],
          [0.0004, 0.0004],
          [-0.0004, -0.0004],
        ]]],
      },
    ];

    const withoutWater = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [], roads: [], water: [], green, paths: [], rail: [], trees: [] },
    );
    const withWater = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [], roads: [], water, green, paths: [], rail: [], trees: [] },
    );

    // Both layers materialize.
    expect(withWater.waterSurfaces.indices.length).toBeGreaterThan(0);
    expect(withWater.greenSurfaces.indices.length).toBeGreaterThan(0);
    // Water wins the overlap: the 2D py < px half is water. In 3D (x = px,
    // z = -py) that is the water-covered corner {x:20,z:20}; the water-free
    // {x:-20,z:-20} corner still belongs to green.
    expect(topSurfaceCovers(withWater.greenSurfaces, { x: 20, z: 20 }, 0.05)).toBe(false);
    expect(topSurfaceCovers(withWater.greenSurfaces, { x: -20, z: -20 }, 0.05)).toBe(true);
    // Carving the green down to a triangle shrinks its triangle budget.
    expect(withWater.greenMetrics.triangles).toBeLessThan(withoutWater.greenMetrics.triangles);
  });

  it("creates a Path Surface from a footway centerline using the fallback width", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [],
        green: [],
        paths: [
          {
            id: "way/footway",
            tags: { highway: "footway" },
            polygons: [],
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        rail: [],
        trees: [],
      },
    );

    expect(result.pathSurfaces.indices.length).toBeGreaterThan(0);
    expect(result.pathMetrics.generated).toBeGreaterThanOrEqual(1);
    expect(result.pathMetrics.fallback).toBe(1);
  });

  it("creates a Rail Surface from a tram centerline", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [],
        green: [],
        paths: [],
        rail: [
          {
            id: "way/tram",
            tags: { railway: "tram" },
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        trees: [],
      },
    );

    expect(result.railSurfaces.indices.length).toBeGreaterThan(0);
    expect(result.railMetrics.generated).toBeGreaterThanOrEqual(1);
    expect(result.railMetrics.fallback).toBe(1);
  });

  it("subtracts higher-priority Road Surfaces from an overlapping Path Surface", () => {
    const paths: SourcePath[] = [
      {
        id: "way/footway",
        tags: { highway: "footway", width: "4" },
        polygons: [],
        lines: [[[0, -0.001], [0, 0.001]]],
      },
    ];
    const road: SourceRoad = {
      id: "way/road",
      tags: { highway: "residential", width: "8" },
      polygons: [],
      lines: [[[-0.001, 0], [0.001, 0]]],
    };

    const withoutRoad = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [], roads: [], water: [], green: [], paths, rail: [], trees: [] },
    );
    const withRoad = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [], roads: [road], water: [], green: [], paths, rail: [], trees: [] },
    );

    // The road strip carves the footway's top footprint out at the crossing.
    expect(topSurfaceCovers(withRoad.pathSurfaces, { x: 0, z: 0 }, 0.05)).toBe(false);
    // The footway still exists clear of the road corridor.
    expect(topSurfaceCovers(withRoad.pathSurfaces, { x: 0, z: 20 }, 0.05)).toBe(true);
    // The road splits the intact footway strip into two disjoint pieces, so the
    // carved footway produces a different (here larger) triangle count than the
    // intact no-road case — proof the subtraction actually reshaped it.
    expect(withRoad.pathMetrics.triangles).not.toBe(withoutRoad.pathMetrics.triangles);
    expect(withRoad.pathMetrics.triangles).toBeGreaterThan(withoutRoad.pathMetrics.triangles);
    // Roads are unaffected by path processing.
    expect(withRoad.roadMetrics).toMatchObject({ generated: 1, skipped: 0 });
  });

  it("skips Path and Rail Surface generation when the paths/rail layer is disabled", () => {
    const result = generateTile(
      {
        center: { latitude: 0, longitude: 0 },
        span: 500,
        layers: { green: true, pathsRail: false, trees: true },
      },
      {
        buildings: [],
        roads: [],
        water: [],
        green: [],
        paths: [
          {
            id: "way/footway",
            tags: { highway: "footway" },
            polygons: [],
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        rail: [
          {
            id: "way/tram",
            tags: { railway: "tram" },
            lines: [[[-0.001, 0], [0.001, 0]]],
          },
        ],
        trees: [],
      },
    );

    expect(result.pathSurfaces.indices.length).toBe(0);
    expect(result.railSurfaces.indices.length).toBe(0);
    expect(result.pathMetrics).toEqual({
      mapped: 0,
      explicit: 0,
      fallback: 0,
      generated: 0,
      skipped: 0,
      triangles: 0,
    });
    expect(result.railMetrics).toEqual({
      mapped: 0,
      explicit: 0,
      fallback: 0,
      generated: 0,
      skipped: 0,
      triangles: 0,
    });
  });

  const forestSource: SourceGreen = {
    id: "way/wood",
    tags: { natural: "wood" },
    polygons: [[[
      [-0.0005, -0.0005],
      [0.0005, -0.0005],
      [0.0005, 0.0005],
      [-0.0005, 0.0005],
      [-0.0005, -0.0005],
    ]]],
  };

  it("scatters Trees across a forest-tagged Green Surface", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      { buildings: [], roads: [], water: [], green: [forestSource], paths: [], rail: [], trees: [] },
    );

    expect(result.trees.indices.length).toBeGreaterThan(0);
    expect(result.trees.positions.length).toBeGreaterThan(0);
    expect(result.treeMetrics.scattered).toBeGreaterThan(0);
    expect(result.treeMetrics.triangles).toBe(result.trees.indices.length / 3);
  });

  it("places a mapped natural=tree point and reports it in Tree metrics", () => {
    const result = generateTile(
      { center: { latitude: 0, longitude: 0 }, span: 500 },
      {
        buildings: [],
        roads: [],
        water: [],
        green: [],
        paths: [],
        rail: [],
        trees: [{ id: "node/tree", position: [0.0001, 0.0001] }],
      },
    );

    expect(result.treeMetrics.mapped).toBe(1);
    expect(result.trees.indices.length).toBeGreaterThan(0);
  });

  it("generates byte-identical Trees for identical config and sources", () => {
    const config = { center: { latitude: 0, longitude: 0 }, span: 500 } as const;
    const sources = {
      buildings: [],
      roads: [],
      water: [],
      green: [forestSource],
      paths: [],
      rail: [],
      trees: [],
    };
    const first = generateTile(config, sources);
    const second = generateTile(config, sources);

    expect(first.trees.positions.length).toBeGreaterThan(0);
    expect(new Uint8Array(first.trees.positions.buffer)).toEqual(
      new Uint8Array(second.trees.positions.buffer),
    );
    expect(new Uint8Array(first.trees.indices.buffer)).toEqual(
      new Uint8Array(second.trees.indices.buffer),
    );
  });

  it("skips Tree generation when the trees layer is disabled", () => {
    const result = generateTile(
      {
        center: { latitude: 0, longitude: 0 },
        span: 500,
        layers: { green: true, pathsRail: true, trees: false },
      },
      { buildings: [], roads: [], water: [], green: [forestSource], paths: [], rail: [], trees: [] },
    );

    expect(result.trees.indices.length).toBe(0);
    expect(result.treeMetrics).toEqual({ mapped: 0, scattered: 0, capped: 0, triangles: 0 });
  });

  describe("optional OSM building colours (vertex colours)", () => {
    const squareBuilding = (tags: Record<string, string>): SourceBuilding => ({
      id: "building/coloured",
      tags,
      polygons: [[[
        [-0.0002, -0.0002],
        [0.0002, -0.0002],
        [0.0002, 0.0002],
        [-0.0002, 0.0002],
        [-0.0002, -0.0002],
      ]]],
    });

    it("emits no colour attribute when useOsmColors is absent", () => {
      const result = generateTile(
        { center: { latitude: 0, longitude: 0 }, span: 500 },
        {
          buildings: [squareBuilding({ building: "yes", height: "12", "building:colour": "#ff0000" })],
          roads: [],
          water: [],
          green: [],
          paths: [],
          rail: [],
          trees: [],
        },
      );

      expect(result.buildings.colors).toBeUndefined();
    });

    it("writes building:colour to every building vertex", () => {
      const result = generateTile(
        { center: { latitude: 0, longitude: 0 }, span: 500, useOsmColors: true },
        {
          buildings: [squareBuilding({ building: "yes", height: "12", "building:colour": "#ff0000" })],
          roads: [],
          water: [],
          green: [],
          paths: [],
          rail: [],
          trees: [],
        },
      );

      const { colors, positions } = result.buildings;
      expect(colors).toBeDefined();
      expect(colors!.length).toBe(positions.length);
      let hasRed = false;
      for (let vertex = 0; vertex < colors!.length / 3; vertex += 1) {
        expect([colors![vertex * 3], colors![vertex * 3 + 1], colors![vertex * 3 + 2]]).toEqual([1, 0, 0]);
        hasRed = true;
      }
      expect(hasRed).toBe(true);
    });

    it("overrides roof faces (normal.y > 0.9) with roof:colour", () => {
      const result = generateTile(
        { center: { latitude: 0, longitude: 0 }, span: 500, useOsmColors: true },
        {
          buildings: [
            squareBuilding({
              building: "yes",
              height: "12",
              "building:colour": "#ff0000",
              "roof:colour": "#0000ff",
            }),
          ],
          roads: [],
          water: [],
          green: [],
          paths: [],
          rail: [],
          trees: [],
        },
      );

      const { colors, normals, indices } = result.buildings;
      expect(colors).toBeDefined();

      // Every roof face (all three vertex normals point up) must be blue, and
      // its vertices are located via the index, proving the roof vertices
      // specifically received the roof colour.
      let roofFaces = 0;
      for (let triangle = 0; triangle < indices.length; triangle += 3) {
        const face = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
        if (face.every((vertex) => normals[vertex * 3 + 1] > 0.9)) {
          roofFaces += 1;
          for (const vertex of face) {
            expect([colors![vertex * 3], colors![vertex * 3 + 1], colors![vertex * 3 + 2]]).toEqual([0, 0, 1]);
          }
        }
      }
      expect(roofFaces).toBeGreaterThan(0);

      // A wall vertex (normal not pointing up) keeps the wall colour.
      let hasRedWall = false;
      for (let vertex = 0; vertex < colors!.length / 3; vertex += 1) {
        if (normals[vertex * 3 + 1] <= 0.9) {
          expect([colors![vertex * 3], colors![vertex * 3 + 1], colors![vertex * 3 + 2]]).toEqual([1, 0, 0]);
          hasRedWall = true;
        }
      }
      expect(hasRedWall).toBe(true);
    });

    it("defaults untagged buildings to white so the material colour multiplies through", () => {
      const result = generateTile(
        { center: { latitude: 0, longitude: 0 }, span: 500, useOsmColors: true },
        {
          buildings: [squareBuilding({ building: "yes", height: "12" })],
          roads: [],
          water: [],
          green: [],
          paths: [],
          rail: [],
          trees: [],
        },
      );

      const { colors } = result.buildings;
      expect(colors).toBeDefined();
      for (let component = 0; component < colors!.length; component += 1) {
        expect(colors![component]).toBe(1);
      }
    });
  });
});
