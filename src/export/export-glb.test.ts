import { describe, expect, it } from "vitest";

import type {
  GeneratedTile,
  RoadMetrics,
  SerializedGeometry,
  SurfaceMetrics,
  TileMetrics,
  TreeMetrics,
  WaterMetrics,
} from "../geometry/generate-tile";
import { exportGlb, type TileColors } from "./export-glb";

function triangle(colors?: [number, number, number]): SerializedGeometry {
  const geometry: SerializedGeometry = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
  if (colors) {
    geometry.colors = new Float32Array([...colors, ...colors, ...colors]);
  }
  return geometry;
}

function emptyGeometry(): SerializedGeometry {
  return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() };
}

const tileMetrics: TileMetrics = {
  explicit: 0,
  levels: 0,
  fallback: 0,
  generated: 0,
  skipped: 0,
  triangles: 0,
};

const roadMetrics: RoadMetrics = {
  mapped: 0,
  explicit: 0,
  lanes: 0,
  fallback: 0,
  generated: 0,
  skipped: 0,
  triangles: 0,
};

const waterMetrics: WaterMetrics = {
  mapped: 0,
  explicit: 0,
  fallback: 0,
  generated: 0,
  skipped: 0,
  triangles: 0,
};

const surfaceMetrics: SurfaceMetrics = {
  mapped: 0,
  explicit: 0,
  fallback: 0,
  generated: 0,
  skipped: 0,
  triangles: 0,
};

const treeMetrics: TreeMetrics = { mapped: 0, scattered: 0, capped: 0, triangles: 0 };

function fullTile(buildingColors?: [number, number, number]): GeneratedTile {
  return {
    base: triangle(),
    buildings: triangle(buildingColors),
    roadSurfaces: triangle(),
    waterSurfaces: triangle(),
    greenSurfaces: triangle(),
    pathSurfaces: triangle(),
    railSurfaces: triangle(),
    trees: triangle(),
    metrics: tileMetrics,
    roadMetrics,
    waterMetrics,
    greenMetrics: surfaceMetrics,
    pathMetrics: surfaceMetrics,
    railMetrics: surfaceMetrics,
    treeMetrics,
  };
}

function partialTile(): GeneratedTile {
  return {
    base: triangle(),
    buildings: triangle(),
    roadSurfaces: triangle(),
    waterSurfaces: triangle(),
    greenSurfaces: emptyGeometry(),
    pathSurfaces: emptyGeometry(),
    railSurfaces: emptyGeometry(),
    trees: emptyGeometry(),
    metrics: tileMetrics,
    roadMetrics,
    waterMetrics,
    greenMetrics: surfaceMetrics,
    pathMetrics: surfaceMetrics,
    railMetrics: surfaceMetrics,
    treeMetrics,
  };
}

const colors: TileColors = {
  base: "#cccccc",
  buildings: "#b0a898",
  roads: "#555555",
  water: "#4a80c0",
  green: "#9fae7e",
  paths: "#cfc3a4",
  rail: "#8f8577",
  trees: "#6f8f5a",
};

const metadata = {
  center: { latitude: 52.52, longitude: 13.405 },
  span: 500,
  sourceTimestamp: "2026-07-03T00:00:00Z",
};

const ALL_NAMES = [
  "TileBase",
  "Buildings",
  "RoadSurfaces",
  "WaterSurfaces",
  "GreenSurfaces",
  "PathSurfaces",
  "RailSurfaces",
  "Trees",
];

describe("exportGlb (v2 contract)", () => {
  it("includes all eight named meshes for a full tile and lists them in userData.layers", async () => {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const buffer = await exportGlb(fullTile(), colors, metadata);
    const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), "");
    for (const name of ALL_NAMES) {
      expect(gltf.scene.getObjectByName(name), `expected ${name} to exist`).toBeTruthy();
    }
    expect(gltf.scene.userData.layers).toEqual(ALL_NAMES);
  });

  it("omits meshes whose source geometry has zero indices, keeping TileBase always", async () => {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const buffer = await exportGlb(partialTile(), colors, metadata);
    const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), "");
    const expectedPresent = ["TileBase", "Buildings", "RoadSurfaces", "WaterSurfaces"];
    const expectedAbsent = ["GreenSurfaces", "PathSurfaces", "RailSurfaces", "Trees"];
    for (const name of expectedPresent) {
      expect(gltf.scene.getObjectByName(name), `expected ${name} to exist`).toBeTruthy();
    }
    for (const name of expectedAbsent) {
      expect(gltf.scene.getObjectByName(name), `expected ${name} to be absent`).toBeFalsy();
    }
    expect(gltf.scene.userData.layers).toEqual(expectedPresent);
  });

  it("applies OSM vertex colors to Buildings when useOsmColors is on and colors are present", async () => {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const { MeshStandardMaterial, Mesh } = await import("three");
    const buffer = await exportGlb(fullTile([0.2, 0.4, 0.6]), colors, metadata, {
      useOsmColors: true,
    });
    const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), "");
    const buildings = gltf.scene.getObjectByName("Buildings");
    expect(buildings).toBeInstanceOf(Mesh);
    const material = (buildings as InstanceType<typeof Mesh>).material;
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    const standard = material as InstanceType<typeof MeshStandardMaterial>;
    expect(standard.vertexColors).toBe(true);
    expect(standard.color.getHexString()).toBe("ffffff");
  });

  it("does not apply vertex colors to Buildings when useOsmColors is on but colors are absent", async () => {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const { MeshStandardMaterial, Mesh } = await import("three");
    const buffer = await exportGlb(fullTile(), colors, metadata, { useOsmColors: true });
    const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), "");
    const buildings = gltf.scene.getObjectByName("Buildings");
    const standard = (buildings as InstanceType<typeof Mesh>).material as InstanceType<
      typeof MeshStandardMaterial
    >;
    expect(standard.vertexColors).toBe(false);
    expect(standard.color.getHexString()).toBe(new (await import("three")).Color(colors.buildings).getHexString());
  });

  it("never exports the rise attribute", async () => {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const { Mesh } = await import("three");
    const tileWithRise = fullTile();
    tileWithRise.buildings = { ...tileWithRise.buildings, rise: new Float32Array([1, 1, 1]) };
    const buffer = await exportGlb(tileWithRise, colors, metadata);
    const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), "");
    const buildings = gltf.scene.getObjectByName("Buildings");
    expect(buildings).toBeInstanceOf(Mesh);
    const geometry = (buildings as InstanceType<typeof Mesh>).geometry;
    expect(Object.keys(geometry.attributes)).not.toContain("rise");
  });

  it("preserves v1 metadata keys on scene.userData", async () => {
    const buffer = await exportGlb(fullTile(), colors, metadata);
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), "");
    const { userData } = gltf.scene;
    expect(userData.attribution).toBe("Map data © OpenStreetMap contributors");
    expect(userData.license).toBe("https://www.openstreetmap.org/copyright");
    expect(userData.units).toBe("meters");
    expect(userData.orientation).toBe("+X east, -Z north, +Y up");
    expect(userData.tileCenter).toEqual(metadata.center);
    expect(userData.tileSpanMeters).toBe(metadata.span);
  });
});
