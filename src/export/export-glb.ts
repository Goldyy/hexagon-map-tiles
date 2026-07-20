import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, Scene } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { Coordinates } from "../domain/location";
import type { GeneratedTile, SerializedGeometry, TilePart } from "../geometry/generate-tile";

/**
 * Per-surface hex colors for the eight exported layers. `buildings` is ignored
 * when OSM vertex colors are active for the Buildings layer (see `geometry()`).
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
 * Build a BufferGeometry from a `SerializedGeometry`. Only `positions`,
 * `normals`, and `indices` ever become exported attributes — `data.rise` is
 * never read here, so it can never leak into the GLB. `vertexColors` is only
 * honored when the caller has confirmed a `color` attribute should be used
 * (currently just the Buildings layer, gated on `useOsmColors` + presence of
 * `data.colors`).
 */
function geometry(data: SerializedGeometry, vertexColors: boolean): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute("position", new BufferAttribute(data.positions, 3));
  result.setAttribute("normal", new BufferAttribute(data.normals, 3));
  result.setIndex(new BufferAttribute(data.indices, 1));
  if (vertexColors && data.colors) {
    result.setAttribute("color", new BufferAttribute(data.colors, 3));
  }
  return result;
}

/**
 * One shared material per layer. When vertex colors are honored the material
 * color is forced to white so the per-vertex colors multiply through unchanged.
 */
function layerMaterial(materialName: string, color: string, vertexColors: boolean): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: materialName,
    color: new Color(vertexColors ? "#ffffff" : color),
    vertexColors,
    roughness: 0.9,
    metalness: 0,
  });
}

export interface ExportMetadata {
  center: Coordinates;
  span: number;
  sourceTimestamp: string | null;
}

/**
 * The eight named layers, in export order. Every entry but `TileBase` is
 * omitted from the scene when its `SerializedGeometry` has zero indices (an
 * empty/disabled layer) — `TileBase` always exists. Each layer with `parts`
 * becomes a `Group` of individually named child meshes (one per building,
 * ground-surface polygon, or tree) sharing one layer material, so downstream
 * tools can address every element on its own.
 */
function layerTable(
  tile: GeneratedTile,
  colors: TileColors,
): Array<[name: string, materialName: string, data: SerializedGeometry, color: string, parts: TilePart[] | null]> {
  return [
    ["TileBase", "TileBaseMaterial", tile.base, colors.base, null],
    ["Buildings", "BuildingsMaterial", tile.buildings, colors.buildings, tile.parts.buildings],
    ["RoadSurfaces", "RoadSurfaceMaterial", tile.roadSurfaces, colors.roads, tile.parts.roads],
    ["WaterSurfaces", "WaterSurfaceMaterial", tile.waterSurfaces, colors.water, tile.parts.water],
    ["GreenSurfaces", "GreenSurfaceMaterial", tile.greenSurfaces, colors.green, tile.parts.green],
    ["PathSurfaces", "PathSurfaceMaterial", tile.pathSurfaces, colors.paths, tile.parts.paths],
    ["RailSurfaces", "RailSurfaceMaterial", tile.railSurfaces, colors.rail, tile.parts.rail],
    ["Trees", "TreesMaterial", tile.trees, colors.trees, tile.parts.trees],
  ];
}

/** Color for buildings the user click-marked red in the preview (shared with the OBJ export). */
export const MARKED_RED = "#c2311f";

export async function exportGlb(
  tile: GeneratedTile,
  colors: TileColors,
  metadata: ExportMetadata,
  options?: { useOsmColors?: boolean; redBuildings?: ReadonlySet<string> },
): Promise<ArrayBuffer> {
  const scene = new Scene();
  scene.name = "HexagonMapTile";

  // Marked buildings get one shared red material (vertex colors off so OSM
  // colors never override the mark); created lazily only when needed.
  let redMaterial: MeshStandardMaterial | null = null;
  const materialFor = (part: TilePart, layerMat: MeshStandardMaterial): MeshStandardMaterial => {
    if (!options?.redBuildings?.has(part.name)) return layerMat;
    redMaterial ??= layerMaterial("BuildingsRedMaterial", MARKED_RED, false);
    return redMaterial;
  };

  const included: string[] = [];
  for (const [name, materialName, data, color, parts] of layerTable(tile, colors)) {
    if (name !== "TileBase" && data.indices.length === 0) continue;
    const vertexColors = name === "Buildings" && Boolean(options?.useOsmColors) && Boolean(data.colors);
    const material = layerMaterial(materialName, color, vertexColors);
    if (parts && parts.length > 0) {
      const group = new Group();
      group.name = name;
      for (const part of parts) {
        const partMaterial = name === "Buildings" ? materialFor(part, material) : material;
        const child = new Mesh(
          geometry(part.geometry, vertexColors && partMaterial === material),
          partMaterial,
        );
        child.name = part.name;
        group.add(child);
      }
      scene.add(group);
    } else {
      const mesh = new Mesh(geometry(data, vertexColors), material);
      mesh.name = name;
      scene.add(mesh);
    }
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
  const disposed = new Set<MeshStandardMaterial>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    if (object.material instanceof MeshStandardMaterial && !disposed.has(object.material)) {
      disposed.add(object.material);
      object.material.dispose();
    }
  });
  if (!(result instanceof ArrayBuffer)) throw new Error("GLB exporter returned invalid data.");

  const roundTrip = await new GLTFLoader().parseAsync(result.slice(0), "");
  for (const [name] of layerTable(tile, colors)) {
    const present = Boolean(roundTrip.scene.getObjectByName(name));
    const expected = included.includes(name);
    if (present !== expected) {
      throw new Error(`GLB validation failed: layer "${name}" ${expected ? "is missing" : "should be omitted"}.`);
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
