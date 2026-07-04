import { describe, expect, it } from "vitest";

import { normalizeMapData } from "./normalize";

describe("OpenStreetMap buildings", () => {
  it("converts a closed building way into Building Massing input", () => {
    const result = normalizeMapData({
      version: 0.6,
      osm3s: { timestamp_osm_base: "2026-07-01T10:00:00Z" },
      elements: [
        { type: "node", id: 1, lat: 0, lon: 0 },
        { type: "node", id: 2, lat: 0, lon: 0.001 },
        { type: "node", id: 3, lat: 0.001, lon: 0.001 },
        { type: "node", id: 4, lat: 0.001, lon: 0 },
        {
          type: "way",
          id: 10,
          nodes: [1, 2, 3, 4, 1],
          tags: { building: "yes", height: "12" },
        },
      ],
    });

    expect(result.sourceTimestamp).toBe("2026-07-01T10:00:00Z");
    expect(result.buildings).toHaveLength(1);
    expect(result.buildings[0]).toMatchObject({ id: "way/10", tags: { height: "12" } });
    expect(result.buildings[0]?.polygons[0]?.[0]).toHaveLength(5);
    expect(result.green).toEqual([]);
    expect(result.paths).toEqual([]);
    expect(result.rail).toEqual([]);
    expect(result.trees).toEqual([]);
  });

  it("uses Building Parts instead of their containing Building Outline", () => {
    const nodes = [
      { type: "node", id: 1, lat: 1, lon: 1 },
      { type: "node", id: 2, lat: 1, lon: 1.01 },
      { type: "node", id: 3, lat: 1.01, lon: 1.01 },
      { type: "node", id: 4, lat: 1.01, lon: 1 },
      { type: "node", id: 5, lat: 1.002, lon: 1.002 },
      { type: "node", id: 6, lat: 1.002, lon: 1.008 },
      { type: "node", id: 7, lat: 1.008, lon: 1.008 },
      { type: "node", id: 8, lat: 1.008, lon: 1.002 },
    ];
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        ...nodes,
        { type: "way", id: 20, nodes: [1, 2, 3, 4, 1], tags: { building: "yes" } },
        {
          type: "way",
          id: 21,
          nodes: [5, 6, 7, 8, 5],
          tags: { "building:part": "yes", height: "18" },
        },
      ],
    });

    expect(result.buildings.map((building) => building.id)).toEqual(["way/21"]);
  });

  it("converts a supported highway centerline into Road Surface input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 31, lat: 52.52, lon: 13.404 },
        { type: "node", id: 32, lat: 52.52, lon: 13.406 },
        {
          type: "way",
          id: 30,
          nodes: [31, 32],
          tags: { highway: "primary", width: "9" },
        },
      ],
    });

    expect(result.roads).toEqual([
      {
        id: "way/30",
        tags: { highway: "primary", width: "9" },
        lines: [[[13.404, 52.52], [13.406, 52.52]]],
        polygons: [],
      },
    ]);
  });

  it("uses a mapped road area as Road Surface polygon input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 41, lat: 52.52, lon: 13.404 },
        { type: "node", id: 42, lat: 52.52, lon: 13.406 },
        { type: "node", id: 43, lat: 52.5201, lon: 13.406 },
        { type: "node", id: 44, lat: 52.5201, lon: 13.404 },
        {
          type: "way",
          id: 40,
          nodes: [41, 42, 43, 44, 41],
          tags: { "area:highway": "residential" },
        },
      ],
    });

    expect(result.roads[0]).toMatchObject({
      id: "way/40",
      lines: [],
      tags: { "area:highway": "residential" },
    });
    expect(result.roads[0]?.polygons[0]?.[0]).toHaveLength(5);
  });

  it("treats a routable pedestrian area as Road Surface polygon input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 51, lat: 52.52, lon: 13.404 },
        { type: "node", id: 52, lat: 52.52, lon: 13.406 },
        { type: "node", id: 53, lat: 52.5201, lon: 13.406 },
        { type: "node", id: 54, lat: 52.5201, lon: 13.404 },
        {
          type: "way",
          id: 50,
          nodes: [51, 52, 53, 54, 51],
          tags: { highway: "pedestrian", area: "yes" },
        },
      ],
    });

    expect(result.roads[0]?.polygons[0]?.[0]).toHaveLength(5);
    expect(result.roads[0]?.lines).toEqual([]);
  });

  it("excludes underground mapped road areas", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 61, lat: 52.52, lon: 13.404 },
        { type: "node", id: 62, lat: 52.52, lon: 13.406 },
        { type: "node", id: 63, lat: 52.5201, lon: 13.406 },
        { type: "node", id: 64, lat: 52.5201, lon: 13.404 },
        {
          type: "way",
          id: 60,
          nodes: [61, 62, 63, 64, 61],
          tags: { "area:highway": "residential", tunnel: "yes", layer: "-1" },
        },
      ],
    });

    expect(result.roads).toEqual([]);
  });

  it("converts a mapped inland water area into Water Surface input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 71, lat: 52.52, lon: 13.404 },
        { type: "node", id: 72, lat: 52.52, lon: 13.406 },
        { type: "node", id: 73, lat: 52.521, lon: 13.406 },
        { type: "node", id: 74, lat: 52.521, lon: 13.404 },
        {
          type: "way",
          id: 70,
          nodes: [71, 72, 73, 74, 71],
          tags: { natural: "water", water: "lake" },
        },
      ],
    });

    expect(result.water[0]).toMatchObject({
      id: "way/70",
      tags: { natural: "water", water: "lake" },
      lines: [],
    });
    expect(result.water[0]?.polygons[0]?.[0]).toHaveLength(5);
  });

  it("converts a supported waterway centerline into Water Surface input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 81, lat: 52.52, lon: 13.404 },
        { type: "node", id: 82, lat: 52.521, lon: 13.406 },
        {
          type: "way",
          id: 80,
          nodes: [81, 82],
          tags: { waterway: "river", width: "12" },
        },
      ],
    });

    expect(result.water).toEqual([
      {
        id: "way/80",
        tags: { waterway: "river", width: "12" },
        lines: [[[13.404, 52.52], [13.406, 52.521]]],
        polygons: [],
      },
    ]);
  });

  it("excludes non-permanent and underground waterways", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 91, lat: 52.52, lon: 13.404 },
        { type: "node", id: 92, lat: 52.521, lon: 13.406 },
        { type: "way", id: 90, nodes: [91, 92], tags: { waterway: "stream", intermittent: "yes" } },
        { type: "way", id: 93, nodes: [91, 92], tags: { waterway: "river", seasonal: "spring" } },
        { type: "way", id: 94, nodes: [91, 92], tags: { waterway: "canal", tunnel: "culvert" } },
        { type: "way", id: 95, nodes: [91, 92], tags: { waterway: "river", layer: "-1" } },
        { type: "way", id: 96, nodes: [91, 92], tags: { waterway: "stream", covered: "yes" } },
      ],
    });

    expect(result.water).toEqual([]);
  });

  it("supports legacy mapped inland water area tags", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 101, lat: 52.52, lon: 13.404 },
        { type: "node", id: 102, lat: 52.52, lon: 13.406 },
        { type: "node", id: 103, lat: 52.521, lon: 13.406 },
        { type: "node", id: 104, lat: 52.521, lon: 13.404 },
        { type: "way", id: 100, nodes: [101, 102, 103, 104, 101], tags: { waterway: "riverbank" } },
        { type: "way", id: 105, nodes: [101, 102, 103, 104, 101], tags: { landuse: "reservoir" } },
        { type: "way", id: 106, nodes: [101, 102, 103, 104, 101], tags: { landuse: "basin" } },
      ],
    });

    expect(result.water.map(({ id }) => id)).toEqual(["way/100", "way/105", "way/106"]);
    expect(result.water.every(({ polygons }) => polygons.length === 1)).toBe(true);
  });

  it("excludes wastewater areas", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 111, lat: 52.52, lon: 13.404 },
        { type: "node", id: 112, lat: 52.52, lon: 13.406 },
        { type: "node", id: 113, lat: 52.521, lon: 13.406 },
        { type: "node", id: 114, lat: 52.521, lon: 13.404 },
        {
          type: "way",
          id: 110,
          nodes: [111, 112, 113, 114, 111],
          tags: { natural: "water", water: "wastewater" },
        },
      ],
    });

    expect(result.water).toEqual([]);
  });
});

describe("OpenStreetMap green, paths, rail, and trees", () => {
  it("converts a forested landuse way into Green Space input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 1, lat: 52.52, lon: 13.404 },
        { type: "node", id: 2, lat: 52.52, lon: 13.406 },
        { type: "node", id: 3, lat: 52.521, lon: 13.406 },
        { type: "node", id: 4, lat: 52.521, lon: 13.404 },
        {
          type: "way",
          id: 10,
          nodes: [1, 2, 3, 4, 1],
          tags: { landuse: "forest" },
        },
      ],
    });

    expect(result.green).toHaveLength(1);
    expect(result.green[0]).toMatchObject({ id: "way/10", tags: { landuse: "forest" } });
    expect(result.green[0]?.polygons[0]?.[0]).toHaveLength(5);
  });

  it("converts a footway into Path centerline input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 21, lat: 52.52, lon: 13.404 },
        { type: "node", id: 22, lat: 52.52, lon: 13.406 },
        {
          type: "way",
          id: 20,
          nodes: [21, 22],
          tags: { highway: "footway" },
        },
      ],
    });

    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]?.lines).toHaveLength(1);
    expect(result.paths[0]?.polygons).toEqual([]);
  });

  it("converts a tram way into Rail centerline input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 31, lat: 52.52, lon: 13.404 },
        { type: "node", id: 32, lat: 52.52, lon: 13.406 },
        {
          type: "way",
          id: 30,
          nodes: [31, 32],
          tags: { railway: "tram" },
        },
      ],
    });

    expect(result.rail).toEqual([
      {
        id: "way/30",
        tags: { railway: "tram" },
        lines: [[[13.404, 52.52], [13.406, 52.52]]],
      },
    ]);
  });

  it("includes a below-grade rail way without a tunnel tag", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 33, lat: 52.52, lon: 13.404 },
        { type: "node", id: 34, lat: 52.52, lon: 13.406 },
        {
          type: "way",
          id: 35,
          nodes: [33, 34],
          tags: { railway: "rail", layer: "-1" },
        },
      ],
    });

    expect(result.rail).toHaveLength(1);
    expect(result.rail[0]?.id).toBe("way/35");
  });

  it("excludes tunneled rail ways", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 36, lat: 52.52, lon: 13.404 },
        { type: "node", id: 37, lat: 52.52, lon: 13.406 },
        {
          type: "way",
          id: 38,
          nodes: [36, 37],
          tags: { railway: "rail", tunnel: "yes" },
        },
      ],
    });

    expect(result.rail).toEqual([]);
  });

  it("uses a mapped footway area as Path polygon input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 44, lat: 52.52, lon: 13.404 },
        { type: "node", id: 45, lat: 52.52, lon: 13.406 },
        { type: "node", id: 46, lat: 52.521, lon: 13.406 },
        { type: "node", id: 47, lat: 52.521, lon: 13.404 },
        {
          type: "way",
          id: 43,
          nodes: [44, 45, 46, 47, 44],
          tags: { "area:highway": "footway" },
        },
      ],
    });

    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]?.lines).toEqual([]);
    expect(result.paths[0]?.polygons[0]?.[0]).toHaveLength(5);
  });

  it("converts natural=tree nodes into Tree input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 41, lat: 52.52, lon: 13.404, tags: { natural: "tree" } },
        { type: "node", id: 42, lat: 52.521, lon: 13.406, tags: { natural: "tree" } },
      ],
    });

    expect(result.trees).toHaveLength(2);
    expect(result.trees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: [13.404, 52.52] }),
        expect.objectContaining({ position: [13.406, 52.521] }),
      ]),
    );
  });

  it("excludes tunneled footways from Path input", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 51, lat: 52.52, lon: 13.404 },
        { type: "node", id: 52, lat: 52.52, lon: 13.406 },
        {
          type: "way",
          id: 50,
          nodes: [51, 52],
          tags: { highway: "footway", tunnel: "yes" },
        },
      ],
    });

    expect(result.paths).toEqual([]);
  });

  it("keeps a pedestrian way classified as Road Surface, not Path", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 61, lat: 52.52, lon: 13.404 },
        { type: "node", id: 62, lat: 52.52, lon: 13.406 },
        {
          type: "way",
          id: 60,
          nodes: [61, 62],
          tags: { highway: "pedestrian" },
        },
      ],
    });

    expect(result.roads).toHaveLength(1);
    expect(result.roads[0]?.id).toBe("way/60");
    expect(result.paths).toEqual([]);
  });

  it("assembles a Green Space relation with a hole into one polygon with two rings", () => {
    const result = normalizeMapData({
      version: 0.6,
      elements: [
        { type: "node", id: 71, lat: 0, lon: 0 },
        { type: "node", id: 72, lat: 0, lon: 0.01 },
        { type: "node", id: 73, lat: 0.01, lon: 0.01 },
        { type: "node", id: 74, lat: 0.01, lon: 0 },
        { type: "node", id: 75, lat: 0.002, lon: 0.002 },
        { type: "node", id: 76, lat: 0.002, lon: 0.008 },
        { type: "node", id: 77, lat: 0.008, lon: 0.008 },
        { type: "node", id: 78, lat: 0.008, lon: 0.002 },
        { type: "way", id: 80, nodes: [71, 72, 73, 74, 71] },
        { type: "way", id: 81, nodes: [75, 76, 77, 78, 75] },
        {
          type: "relation",
          id: 90,
          members: [
            { type: "way", ref: 80, role: "outer" },
            { type: "way", ref: 81, role: "inner" },
          ],
          tags: { leisure: "park", type: "multipolygon" },
        },
      ],
    });

    expect(result.green).toHaveLength(1);
    expect(result.green[0]?.polygons).toHaveLength(1);
    expect(result.green[0]?.polygons[0]).toHaveLength(2);
  });
});
