import { describe, expect, it } from "vitest";

import type {
  GeneratedTile,
  RoadMetrics,
  SerializedGeometry,
  SurfaceMetrics,
  TileMetrics,
  TileParts,
  TreeMetrics,
  WaterMetrics,
} from "../geometry/generate-tile";
import { PRINT_SCALE_MM_PER_M } from "../domain/print-size";
import type { TileColors } from "./export-glb";
import { CLEARANCE_MM, exportObj, exportTrayObj, TRAY_FLOOR_MM, TRAY_WALL_MM } from "./export-obj";

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

function triangle(): SerializedGeometry {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

const tileMetrics: TileMetrics = { explicit: 0, levels: 0, fallback: 0, generated: 0, skipped: 0, triangles: 0 };
const roadMetrics: RoadMetrics = { mapped: 0, explicit: 0, lanes: 0, fallback: 0, generated: 0, skipped: 0, triangles: 0 };
const waterMetrics: WaterMetrics = { mapped: 0, explicit: 0, fallback: 0, generated: 0, skipped: 0, triangles: 0 };
const surfaceMetrics: SurfaceMetrics = { mapped: 0, explicit: 0, fallback: 0, generated: 0, skipped: 0, triangles: 0 };
const treeMetrics: TreeMetrics = { mapped: 0, scattered: 0, capped: 0, triangles: 0 };

function makeTile(parts: Partial<TileParts>): GeneratedTile {
  const empty = { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() };
  return {
    base: triangle(),
    buildings: empty,
    roadSurfaces: empty,
    waterSurfaces: empty,
    greenSurfaces: empty,
    pathSurfaces: empty,
    railSurfaces: empty,
    trees: empty,
    parts: { buildings: [], roads: [], water: [], green: [], paths: [], rail: [], trees: [], ...parts },
    metrics: tileMetrics,
    roadMetrics,
    waterMetrics,
    greenMetrics: surfaceMetrics,
    pathMetrics: surfaceMetrics,
    railMetrics: surfaceMetrics,
    treeMetrics,
  };
}

const metadata = {
  center: { latitude: 52.52, longitude: 13.405 },
  span: 500,
  sourceTimestamp: "2026-07-03T00:00:00Z",
};

// The exporter's coordinate math, mirrored so assertions survive constant
// tweaks: detail fidelity is a fixed scale; the lift rests the base's
// underside on z=0.
const scale = PRINT_SCALE_MM_PER_M;
const lift = 0.01 * metadata.span * scale;
const fmt = (value: number) => String(Number(value.toFixed(3)));

/** Group v-lines of the OBJ by their `o` section. */
function vLinesBySection(obj: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current = "";
  for (const line of obj.split("\n")) {
    if (line.startsWith("o ")) sections.set((current = line.slice(2)), []);
    else if (current && line.startsWith("v ")) sections.get(current)!.push(line);
  }
  return sections;
}

describe("exportObj (map part)", () => {
  it("scales the map to drop into the tray with clearance", () => {
    const tile = makeTile({});
    const cornerRadiusMeters = metadata.span / Math.sqrt(3); // 288.675
    tile.base = {
      positions: new Float32Array([-cornerRadiusMeters, 0, 0, cornerRadiusMeters, 0, 0, 0, 1, 0]),
      normals: new Float32Array(9).fill(0),
      indices: new Uint32Array([0, 1, 2]),
    };
    const obj = exportObj(tile, colors, metadata);
    const mapCorner = fmt((metadata.span / Math.sqrt(3)) * scale);
    expect(obj).toContain(`v -${mapCorner} 0`);
    expect(obj).toContain(`v ${mapCorner} 0`);
    expect(obj).not.toContain("TileTray");
  });

  it("emits one named o-object per element plus the base, with global face indices", () => {
    const tile = makeTile({
      buildings: [
        { name: "Building_way_1", geometry: triangle() },
        { name: "Building_way_2", geometry: triangle() },
      ],
      roads: [{ name: "Road_001", geometry: triangle() }],
      trees: [{ name: "Tree_001", geometry: triangle() }],
    });
    const obj = exportObj(tile, colors, metadata);
    const names = obj.split("\n").filter((line) => line.startsWith("o ")).map((line) => line.slice(2));
    expect(names).toEqual(["TileBase", "Building_way_1", "Building_way_2", "Road_001", "Tree_001"]);
    // Faces reference the global 1-based vertex list: four preceding objects
    // weld to 3 vertices each, so the last object's face starts at 13.
    expect(obj).toContain("f 13 14 15");
  });

  it("thickens ground slabs to the printable minimum, seated exactly on the plate surface", () => {
    const tile = makeTile({
      roads: [
        {
          name: "Road_001",
          geometry: {
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0.05, 0, 1, 0.05, 0]),
            normals: new Float32Array(12).fill(0),
            indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
          },
        },
      ],
    });
    const obj = exportObj(tile, colors, metadata);
    expect(obj).toContain(`v 0 0 ${fmt(lift)}`);
    expect(obj).toContain(`v 0 0 ${fmt(lift + 0.6)}`);
  });

  it("stretches tiny buildings to the printable minimum height", () => {
    const tile = makeTile({
      buildings: [
        {
          name: "Building_way_1",
          // 1 m tall → far below 1 mm at this scale → stretched to 1.0 mm on the plate.
          geometry: {
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0.5]),
            normals: new Float32Array(9).fill(0),
            indices: new Uint32Array([0, 1, 2]),
          },
        },
      ],
    });
    const obj = exportObj(tile, colors, metadata);
    // top vertex (0, 1, 0.5): stretched height 1.0, above the base lift.
    expect(obj).toContain(`v 0 ${fmt(-0.5 * scale)} ${fmt(1 + lift)}`);
  });

  it("fattens tree-trunk vertices to the printable minimum radius", () => {
    const tile = makeTile({
      trees: [
        {
          name: "Tree_001",
          // Canopy spans x 8..12 m (axis at 10 m), trunk vertex 0.1 m off-axis.
          geometry: {
            positions: new Float32Array([8, 4, 0, 12, 4, 0, 10, 6, 0, 10.1, 0, 0, 9.9, 0, 0, 10, 2, 0]),
            normals: new Float32Array(18).fill(0),
            indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
          },
        },
      ],
    });
    const obj = exportObj(tile, colors, metadata);
    const axis = 10 * scale;
    const foot = fmt(lift);
    // Trunk vertices pushed to axis ± 0.5 mm, the foot seated on the plate;
    // canopy vertices untouched.
    expect(obj).toContain(`v ${fmt(axis + 0.5)} 0 ${foot}`);
    expect(obj).toContain(`v ${fmt(axis - 0.5)} 0 ${foot}`);
    expect(obj).toContain(`v ${fmt(12 * scale)} `);
  });

  it("keeps the plate's layers single-colored: no element reaches below the plate surface", () => {
    const tile = makeTile({
      buildings: [{ name: "Building_way_1", geometry: triangle() }],
      roads: [
        {
          name: "Road_001",
          geometry: {
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0.05, 0, 1, 0.05, 0]),
            normals: new Float32Array(12).fill(0),
            indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
          },
        },
      ],
      trees: [
        {
          name: "Tree_001",
          geometry: {
            positions: new Float32Array([8, 4.05, 0, 12, 4.05, 0, 10, 6.05, 0, 10.1, 0.05, 0, 9.9, 0.05, 0, 10, 2.05, 0]),
            normals: new Float32Array(18).fill(0),
            indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
          },
        },
      ],
    });
    const obj = exportObj(tile, colors, metadata);
    for (const [section, lines] of vLinesBySection(obj)) {
      if (section === "TileBase") continue;
      for (const line of lines) {
        const z = Number(line.slice(2).split(" ")[2]);
        expect(z, `${section}: ${line}`).toBeGreaterThanOrEqual(Number(fmt(lift)));
      }
    }
  });

  it("embeds each layer's theme color as vertex colors, red for marked buildings", () => {
    const tile = makeTile({
      buildings: [
        { name: "Building_way_1", geometry: triangle() },
        { name: "Building_way_2", geometry: triangle() },
      ],
      roads: [{ name: "Road_001", geometry: triangle() }],
    });
    const obj = exportObj(tile, colors, metadata, { redBuildings: new Set(["Building_way_2"]) });
    const sections = vLinesBySection(obj);
    expect(sections.get("TileBase")![0]).toMatch(/ 0\.8 0\.8 0\.8$/);
    expect(sections.get("Building_way_1")![0]).toMatch(/ 0\.6902 0\.6588 0\.5961$/);
    expect(sections.get("RED_Building_way_2")![0]).toMatch(/ 0\.7608 0\.1922 0\.1216$/);
    expect(sections.get("Road_001")![0]).toMatch(/ 0\.3333 0\.3333 0\.3333$/);
    // No MTL machinery — colors live on the vertices alone.
    expect(obj).not.toContain("mtllib");
    expect(obj).not.toContain("usemtl");
  });

  it("welds duplicate vertices and drops triangles degenerated by the weld", () => {
    const tile = makeTile({});
    tile.base = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array(18).fill(0),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    const obj = exportObj(tile, colors, metadata);
    expect(vLinesBySection(obj).get("TileBase")).toHaveLength(3);
    expect(obj.split("\n").filter((line) => line.startsWith("f "))).toHaveLength(2);
  });
});

describe("exportTrayObj (tray part)", () => {
  it("exports a brown shell: full-width floor plus wall rising a lip above the seated map", () => {
    const obj = exportTrayObj(metadata);
    const lines = vLinesBySection(obj).get("TileTray")!;
    const xs = lines.map((line) => Number(line.slice(2).split(" ")[0]));
    const zs = lines.map((line) => Number(line.slice(2).split(" ")[2]));
    // Outer width = map + clearance + wall on both sides, resting on the plate.
    const expectedWidth = 2 * ((metadata.span / Math.sqrt(3)) * scale + CLEARANCE_MM + TRAY_WALL_MM);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(expectedWidth, 2);
    expect(Math.min(...zs)).toBe(0);
    // Wall top = floor + seated map base thickness (lift) + 1.5 mm lip.
    expect(Math.max(...zs)).toBeCloseTo(TRAY_FLOOR_MM + lift + 1.5, 3);
    // The floor plane exists across the full hexagon (its top at TRAY_FLOOR_MM).
    expect(zs).toContain(TRAY_FLOOR_MM);
    // Brown vertex colors throughout.
    for (const line of lines) expect(line).toMatch(/ 0\.4784 0\.2902 0\.1294$/);
  });
});
