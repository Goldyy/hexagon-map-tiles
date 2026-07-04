import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, Scene } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { Coordinates } from "../domain/location";
import type { GeneratedTile, SerializedGeometry } from "../geometry/generate-tile";

/**
 * Per-surface hex colors for the eight exported meshes. `buildings` is ignored
 * when OSM vertex colors are active for the Buildings mesh (see `mesh()`).
 */
export interface TileColors {
  base: string;
  buildings: string;
  roads: string;
  water: string;
  green: string;
  paths: string;
  rail: string;
  trees: string;
}

/**
 * Build a single named mesh from a `SerializedGeometry`. Only `positions`,
 * `normals`, and `indices` ever become exported attributes — `data.rise` is
 * never read here, so it can never leak into the GLB. `vertexColors` is only
 * honored when the caller has confirmed a `color` attribute should be used
 * (currently just the Buildings mesh, gated on `useOsmColors` + presence of
 * `data.colors`); when honored the material color is forced to white so the
 * per-vertex colors multiply through unchanged.
 */
function mesh(
  name: string,
  materialName: string,
  data: SerializedGeometry,
  color: string,
  vertexColors: boolean,
): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  const useVertexColors = vertexColors && Boolean(data.colors);
  if (useVertexColors && data.colors) {
    geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  }
  const material = new MeshStandardMaterial({
    name: materialName,
    color: new Color(useVertexColors ? "#ffffff" : color),
    vertexColors: useVertexColors,
    roughness: 0.9,
    metalness: 0,
  });
  const result = new Mesh(geometry, material);
  result.name = name;
  return result;
}

export interface ExportMetadata {
  center: Coordinates;
  span: number;
  sourceTimestamp: string | null;
}

/**
 * The eight named mesh/material pairs, in export order. Every entry but
 * `TileBase` is omitted from the scene when its `SerializedGeometry` has zero
 * indices (an empty/disabled layer) — `TileBase` always exists.
 */
function meshTable(
  tile: GeneratedTile,
  colors: TileColors,
): Array<[name: string, materialName: string, data: SerializedGeometry, color: string]> {
  return [
    ["TileBase", "TileBaseMaterial", tile.base, colors.base],
    ["Buildings", "BuildingsMaterial", tile.buildings, colors.buildings],
    ["RoadSurfaces", "RoadSurfaceMaterial", tile.roadSurfaces, colors.roads],
    ["WaterSurfaces", "WaterSurfaceMaterial", tile.waterSurfaces, colors.water],
    ["GreenSurfaces", "GreenSurfaceMaterial", tile.greenSurfaces, colors.green],
    ["PathSurfaces", "PathSurfaceMaterial", tile.pathSurfaces, colors.paths],
    ["RailSurfaces", "RailSurfaceMaterial", tile.railSurfaces, colors.rail],
    ["Trees", "TreesMaterial", tile.trees, colors.trees],
  ];
}

export async function exportGlb(
  tile: GeneratedTile,
  colors: TileColors,
  metadata: ExportMetadata,
  options?: { useOsmColors?: boolean },
): Promise<ArrayBuffer> {
  const scene = new Scene();
  scene.name = "HexagonMapTile";

  const included: string[] = [];
  for (const [name, materialName, data, color] of meshTable(tile, colors)) {
    if (name !== "TileBase" && data.indices.length === 0) continue;
    const vertexColors = name === "Buildings" && Boolean(options?.useOsmColors);
    scene.add(mesh(name, materialName, data, color, vertexColors));
    included.push(name);
  }

  scene.userData = {
    attribution: "Map data © OpenStreetMap contributors",
    license: "https://www.openstreetmap.org/copyright",
    sourceTimestamp: metadata.sourceTimestamp,
    tileCenter: metadata.center,
    tileSpanMeters: metadata.span,
    units: "meters",
    orientation: "+X east, -Z north, +Y up",
    generatedAt: new Date().toISOString(),
    layers: included,
  };

  const result = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  });
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    if (object.material instanceof MeshStandardMaterial) object.material.dispose();
  });
  if (!(result instanceof ArrayBuffer)) throw new Error("GLB exporter returned invalid data.");

  const roundTrip = await new GLTFLoader().parseAsync(result.slice(0), "");
  for (const [name] of meshTable(tile, colors)) {
    const present = Boolean(roundTrip.scene.getObjectByName(name));
    const expected = included.includes(name);
    if (present !== expected) {
      throw new Error(`GLB validation failed: mesh "${name}" ${expected ? "is missing" : "should be omitted"}.`);
    }
  }
  roundTrip.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  return result;
}
