// Print export as Wavefront OBJ: targets slicers (PrusaSlicer, Bambu/Orca,
// Cura), which all import multi-object OBJ files reliably. Every element —
// the tile base, each building, each ground-surface polygon, each tree — is
// its own named `o` object, so it stays individually selectable in the
// slicer. Theme colors are embedded as per-vertex colors on the `v` lines
// (`v x y z r g b`) — deliberately instead of a companion MTL file: it keeps
// each export a single file, and Bambu Studio / OrcaSlicer read colored OBJs
// natively, offering per-color filament mapping on import. Click-marked
// buildings carry red vertex colors (plus a `RED_` name prefix).
//
// The print is TWO separately printed parts:
//  - `exportObj` — the map itself: base plus all elements, resting on the
//    build plate, sized to drop into the tray with CLEARANCE_MM of play.
//  - `exportTrayObj` — the brown display tray (`TileTray`): a full hexagonal
//    floor under the model plus a surrounding wall that rises a lip above the
//    inserted map's base. Print it in brown, then seat the map inside.
// Detail fidelity is fixed at 1:PRINT_RATIO (see domain/print-size), so the
// printed size grows with the Tile Span; the sidebar readout shows how large.
//
// Unlike the GLB (a faithful render asset), this export is print-ready:
// real-world sizes that would be unprintably small are clamped (ground slabs
// thickened, tiny buildings raised, tree trunks fattened), and coordinates
// are millimeters, Z-up (slicer convention), resting on the plate at z = 0.
//
// To minimize filament changes along Z, every element sits EXACTLY on top of
// the base plate (coplanar, never embedded into it): the plate's layers slice
// as a single color, and color changes only start above the plate surface.
// Trees are dropped onto the plate as well — where they stand on a green
// surface they overlap it, but tree and surface share a color there.

import { ExtrudeGeometry, Path, Shape, Vector2 } from "three";

import { FRAME_COLOR } from "../domain/print-palette";
import { CLEARANCE_MM, printScale, totalWidthMm, TRAY_WALL_MM } from "../domain/print-size";
import type { GeneratedTile, SerializedGeometry, TilePart } from "../geometry/generate-tile";
import { MARKED_RED, type ExportMetadata, type TileColors } from "./export-glb";

export { CLEARANCE_MM, TRAY_WALL_MM };

/** Thickness of the tray floor the map sits on. */
export const TRAY_FLOOR_MM = 1.2;
/** How far the tray wall rises above the inserted map's base surface. */
const TRAY_LIP_MM = 1.5;
/** How far the tray wall reaches down into the tray floor so the bodies fuse. */
const TRAY_JOIN_MM = 0.3;
/** Minimum printed thickness of road/water/green/path/rail slabs. */
const MIN_SLAB_TOP_MM = 0.6;
/** Minimum printed building height (before embedding). */
const MIN_BUILDING_MM = 1.0;
/** Minimum printed tree-trunk radius. */
const MIN_TRUNK_RADIUS_MM = 0.5;

/** How each layer's geometry must be adapted for printability. */
type PartKind = "base" | "building" | "slab" | "tree";

/** mm per meter for the map — constant 1:PRINT_RATIO detail fidelity. */
const mapScale = printScale;

function trim(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * Scale a part into millimeters and clamp it to printable dimensions.
 * Returns a transformed copy of the positions (still Y-up).
 */
function printablePositions(data: SerializedGeometry, kind: PartKind, scale: number): Float32Array {
  const positions = new Float32Array(data.positions.length);
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = data.positions[index] * scale;
  }
  const count = positions.length / 3;
  if (kind === "base" || count === 0) return positions;

  if (kind === "slab") {
    // Ground slabs have exactly two Y planes (bottom 0, top 0.05 m·scale):
    // pin the bottom onto the base surface and the top to a printable height.
    const top = 0.05 * scale;
    const printedTop = Math.max(top, MIN_SLAB_TOP_MM);
    for (let vertex = 0; vertex < count; vertex += 1) {
      positions[vertex * 3 + 1] = positions[vertex * 3 + 1] > top / 2 ? printedTop : 0;
    }
    return positions;
  }

  if (kind === "building") {
    let maxY = 0;
    for (let vertex = 0; vertex < count; vertex += 1) {
      if (positions[vertex * 3 + 1] > maxY) maxY = positions[vertex * 3 + 1];
    }
    const stretch = maxY > 0 && maxY < MIN_BUILDING_MM ? MIN_BUILDING_MM / maxY : 1;
    for (let vertex = 0; vertex < count; vertex += 1) {
      positions[vertex * 3 + 1] = positions[vertex * 3 + 1] * stretch;
    }
    return positions;
  }

  // Tree: fatten the trunk to a printable radius without inflating the whole
  // tree. The template is rotationally symmetric, so the XZ bounding-box
  // center is the trunk axis; trunk vertices sit far closer to it (≤ ~0.05 of
  // the tree height) than canopy vertices (~0.35), so 0.15·height separates
  // them cleanly at any placement scale/rotation.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const axisX = (minX + maxX) / 2;
  const axisZ = (minZ + maxZ) / 2;
  const trunkThreshold = (maxY - minY) * 0.15;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const dx = positions[vertex * 3] - axisX;
    const dz = positions[vertex * 3 + 2] - axisZ;
    const radius = Math.hypot(dx, dz);
    if (radius > 1e-6 && radius < trunkThreshold && radius < MIN_TRUNK_RADIUS_MM) {
      const factor = MIN_TRUNK_RADIUS_MM / radius;
      positions[vertex * 3] = axisX + dx * factor;
      positions[vertex * 3 + 2] = axisZ + dz * factor;
    }
    // Drop the tree's foot onto the plate surface (it floats a slab-height
    // above y=0 in world space).
    positions[vertex * 3 + 1] -= minY;
  }
  return positions;
}

/** A hexagon corner ring at multiples of 60°, one corner on +X. */
function hexagonCorners(radius: number): Vector2[] {
  return Array.from(
    { length: 6 },
    (_, index) =>
      new Vector2(Math.cos((index * Math.PI) / 3) * radius, Math.sin((index * Math.PI) / 3) * radius),
  );
}

/** Extrude a hexagon (optionally with a hexagonal hole) into a Y-up solid. */
function extrudeHexagon(
  outerRadius: number,
  innerRadius: number | null,
  depth: number,
  bottomY: number,
): SerializedGeometry {
  const shape = new Shape(hexagonCorners(outerRadius));
  if (innerRadius !== null) shape.holes.push(new Path(hexagonCorners(innerRadius)));
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottomY, 0);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  const data: SerializedGeometry = {
    positions: Float32Array.from(position.array),
    normals: Float32Array.from(normal.array),
    indices: index
      ? Uint32Array.from(index.array)
      : Uint32Array.from({ length: position.count }, (_, item) => item),
  };
  geometry.dispose();
  return data;
}

function concatGeometry(a: SerializedGeometry, b: SerializedGeometry): SerializedGeometry {
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions);
  positions.set(b.positions, a.positions.length);
  const normals = new Float32Array(a.normals.length + b.normals.length);
  normals.set(a.normals);
  normals.set(b.normals, a.normals.length);
  const offset = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  for (let item = 0; item < b.indices.length; item += 1) indices[a.indices.length + item] = b.indices[item] + offset;
  return { positions, normals, indices };
}

/**
 * The display tray in millimeters (Y-up, underside at y = 0): a full
 * hexagonal floor plus a surrounding wall whose lip rises above the inserted
 * map's base surface. The wall reaches down into the floor so both shells
 * fuse during slicing.
 */
function trayGeometryMm(span: number): SerializedGeometry {
  const mapCornerRadius = (span / Math.sqrt(3)) * mapScale(span);
  const innerRadius = mapCornerRadius + CLEARANCE_MM;
  const outerRadius = innerRadius + TRAY_WALL_MM;
  const mapBaseMm = 0.01 * span * mapScale(span);
  const wallTop = TRAY_FLOOR_MM + mapBaseMm + TRAY_LIP_MM;
  const floor = extrudeHexagon(outerRadius, null, TRAY_FLOOR_MM, 0);
  const wall = extrudeHexagon(
    outerRadius,
    innerRadius,
    wallTop - (TRAY_FLOOR_MM - TRAY_JOIN_MM),
    TRAY_FLOOR_MM - TRAY_JOIN_MM,
  );
  return concatGeometry(floor, wall);
}

/**
 * The display tray in world meters (Y-up) for the preview, positioned so the
 * map (base underside at y = −0.01·span) sits on the tray floor — the exact
 * proportions `exportTrayObj` prints.
 */
export function printTrayGeometry(span: number): SerializedGeometry {
  const scale = mapScale(span);
  const tray = trayGeometryMm(span);
  const offsetY = -0.01 * span - TRAY_FLOOR_MM / scale;
  const positions = new Float32Array(tray.positions.length);
  for (let vertex = 0; vertex < tray.positions.length / 3; vertex += 1) {
    positions[vertex * 3] = tray.positions[vertex * 3] / scale;
    positions[vertex * 3 + 1] = tray.positions[vertex * 3 + 1] / scale + offsetY;
    positions[vertex * 3 + 2] = tray.positions[vertex * 3 + 2] / scale;
  }
  return { positions, normals: tray.normals, indices: tray.indices };
}

/** `#rrggbb` → sRGB vertex-color triple ("0.702 0.639 0.537"). */
function colorTriple(color: string): string {
  const channels = [1, 3, 5].map((offset) =>
    String(Number((parseInt(color.slice(offset, offset + 2), 16) / 255).toFixed(4))),
  );
  return channels.join(" ");
}

interface ObjEntry {
  name: string;
  color: string;
  /** Final positions in millimeters, Y-up (lift already applied). */
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Serialize entries as a colored multi-object OBJ. Welds vertices on rounded
 * coordinates so extrusion caps and walls share their ring vertices and the
 * solids stay manifold; drops triangles the weld collapses. Converts Y-up to
 * Z-up via `(x, y, z) → (x, -z, y)` — a proper rotation, so triangle winding
 * (outward normals) is preserved.
 */
function writeObj(header: string[], entries: ObjEntry[]): string {
  const lines = [...header];
  let vertexOffset = 0;
  for (const entry of entries) {
    const rgb = colorTriple(entry.color);
    const seen = new Map<string, number>();
    const vertices: string[] = [];
    const count = entry.positions.length / 3;
    const remap = new Uint32Array(count);
    for (let vertex = 0; vertex < count; vertex += 1) {
      const x = trim(entry.positions[vertex * 3]);
      const y = trim(-entry.positions[vertex * 3 + 2]);
      const z = trim(entry.positions[vertex * 3 + 1]);
      const key = `${x},${y},${z}`;
      let index = seen.get(key);
      if (index === undefined) {
        index = vertices.length;
        seen.set(key, index);
        vertices.push(`v ${x} ${y} ${z} ${rgb}`);
      }
      remap[vertex] = index;
    }

    const faces: string[] = [];
    for (let face = 0; face + 2 < entry.indices.length; face += 3) {
      const a = remap[entry.indices[face]];
      const b = remap[entry.indices[face + 1]];
      const c = remap[entry.indices[face + 2]];
      if (a === b || b === c || a === c) continue;
      faces.push(`f ${vertexOffset + a + 1} ${vertexOffset + b + 1} ${vertexOffset + c + 1}`);
    }
    if (faces.length === 0) continue;

    lines.push(`o ${entry.name}`);
    lines.push(...vertices, ...faces);
    vertexOffset += vertices.length;
  }
  lines.push("");
  return lines.join("\n");
}

const ATTRIBUTION = "# Map data (c) OpenStreetMap contributors - https://www.openstreetmap.org/copyright";

/**
 * The exported layers in build order, each with its theme color; the tile
 * base is prepended separately.
 */
function layerTable(
  tile: GeneratedTile,
  colors: TileColors,
): Array<[kind: PartKind, color: string, parts: TilePart[]]> {
  return [
    ["building", colors.buildings, tile.parts.buildings],
    ["slab", colors.roads, tile.parts.roads],
    ["slab", colors.water, tile.parts.water],
    ["slab", colors.green, tile.parts.green],
    ["slab", colors.paths, tile.parts.paths],
    ["slab", colors.rail, tile.parts.rail],
    ["tree", colors.trees, tile.parts.trees],
  ];
}

export interface ObjExportOptions {
  /**
   * Buildings the user click-marked red in the preview (by part name). They
   * are exported with red vertex colors and a `RED_` name prefix — easy to
   * spot and assign to a red filament in the slicer.
   */
  redBuildings?: ReadonlySet<string>;
}

/** The map part: everything except the tray, resting on the build plate. */
export function exportObj(
  tile: GeneratedTile,
  colors: TileColors,
  metadata: ExportMetadata,
  options?: ObjExportOptions,
): string {
  const scale = mapScale(metadata.span);
  // Lift so the base's underside rests on the build plate at z = 0.
  const lift = 0.01 * metadata.span * scale;

  const entries: ObjEntry[] = [];
  const addEntry = (name: string, kind: PartKind, color: string, data: SerializedGeometry): void => {
    const positions = printablePositions(data, kind, scale);
    for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
      positions[vertex * 3 + 1] += lift;
    }
    entries.push({ name, color, positions, indices: data.indices });
  };

  addEntry("TileBase", "base", colors.base, tile.base);
  for (const [kind, color, parts] of layerTable(tile, colors)) {
    for (const part of parts) {
      const marked = kind === "building" && options?.redBuildings?.has(part.name);
      if (marked) addEntry(`RED_${part.name}`, kind, MARKED_RED, part.geometry);
      else addEntry(part.name, kind, color, part.geometry);
    }
  }

  return writeObj(
    [
      `# Hexagon Map Tile ${metadata.center.latitude.toFixed(4)}, ${metadata.center.longitude.toFixed(4)} (${metadata.span} m span) - map part`,
      ATTRIBUTION,
      `# Units: millimeters, Z-up, resting on z=0. Drops into the tray part with ${CLEARANCE_MM} mm play (map scale 1:${Math.round(1000 / scale)}).`,
      "# Ground surfaces, small buildings, and tree trunks are clamped to printable minimum sizes.",
      "# Vertex lines carry sRGB colors (v x y z r g b) for colored import in Bambu Studio / OrcaSlicer.",
    ],
    entries,
  );
}

/**
 * The tray part: the brown hexagonal shell (floor plus wall) the printed map
 * is seated into. Printed separately.
 */
export function exportTrayObj(metadata: ExportMetadata, options?: { color?: string }): string {
  const tray = trayGeometryMm(metadata.span);
  return writeObj(
    [
      `# Hexagon Map Tile ${metadata.center.latitude.toFixed(4)}, ${metadata.center.longitude.toFixed(4)} (${metadata.span} m span) - display tray`,
      ATTRIBUTION,
      `# Units: millimeters, Z-up, resting on z=0. ${totalWidthMm(metadata.span).toFixed(1)} mm across corners; the map part drops in with ${CLEARANCE_MM} mm play.`,
    ],
    [{ name: "TileTray", color: options?.color ?? FRAME_COLOR, positions: tray.positions, indices: tray.indices }],
  );
}
