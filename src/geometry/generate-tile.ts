import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  Shape,
  Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { Coordinates } from "../domain/location";
import { resolveBuildingColors, type BuildingColors } from "./building-color";
import { resolveBuildingHeight, type HeightSource } from "./height";
import {
  bufferLines,
  differencePolygons,
  intersectPolygons,
  unionPolygons,
} from "./integer-geometry";
import { resolveGreenKind } from "./green-surface";
import { resolvePathWidth, type PathWidthSource } from "./path-surface";
import { resolveRailWidth, type RailWidthSource } from "./rail-surface";
import { resolveRoadWidth, type RoadWidthSource } from "./road-surface";
import { buildTreesGeometry, TREE_TRIANGLES } from "./tree-geometry";
import { pointInPolygon, scatterTrees } from "./tree-scatter";
import { resolveWaterWidth, type WaterWidthSource } from "./water-surface";
import { FOREST_TAGS } from "../osm/tags";

const EARTH_RADIUS_METERS = 6_378_137;
const TRIANGLE_LIMIT = 500_000;

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];

export interface SourceBuilding {
  id: string;
  tags: Record<string, string>;
  polygons: Polygon[];
}

export interface SourceRoad {
  id: string;
  tags: Record<string, string>;
  lines: Position[][];
  polygons: Polygon[];
}

export interface SourceWater {
  id: string;
  tags: Record<string, string>;
  lines: Position[][];
  polygons: Polygon[];
}

export interface SourceGreen {
  id: string;
  tags: Record<string, string>;
  polygons: Polygon[];
}

export interface SourcePath {
  id: string;
  tags: Record<string, string>;
  lines: Position[][];
  polygons: Polygon[];
}

export interface SourceRail {
  id: string;
  tags: Record<string, string>;
  lines: Position[][];
}

export interface SourceTree {
  id: string;
  position: Position; // [longitude, latitude]
}

export interface TileSources {
  buildings: SourceBuilding[];
  roads: SourceRoad[];
  water: SourceWater[];
  green: SourceGreen[];
  paths: SourcePath[];
  rail: SourceRail[];
  trees: SourceTree[];
}

export interface LayerToggles {
  green: boolean;
  pathsRail: boolean;
  trees: boolean;
}

export const DEFAULT_LAYERS: LayerToggles = { green: true, pathsRail: true, trees: true };

export interface GenerateTileConfig {
  center: Coordinates;
  span: number;
  layers?: LayerToggles;
  useOsmColors?: boolean;
}

export interface SerializedGeometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  rise?: Float32Array;
  colors?: Float32Array;
}

export interface TileMetrics {
  explicit: number;
  levels: number;
  fallback: number;
  generated: number;
  skipped: number;
  triangles: number;
}

export interface RoadMetrics {
  mapped: number;
  explicit: number;
  lanes: number;
  fallback: number;
  generated: number;
  skipped: number;
  triangles: number;
}

export interface WaterMetrics {
  mapped: number;
  explicit: number;
  fallback: number;
  generated: number;
  skipped: number;
  triangles: number;
}

export interface SurfaceMetrics {
  mapped: number;
  explicit: number;
  fallback: number;
  generated: number;
  skipped: number;
  triangles: number;
}

export interface TreeMetrics {
  mapped: number;
  scattered: number;
  capped: number;
  triangles: number;
}

export interface GeneratedTile {
  base: SerializedGeometry;
  buildings: SerializedGeometry;
  roadSurfaces: SerializedGeometry;
  waterSurfaces: SerializedGeometry;
  greenSurfaces: SerializedGeometry;
  pathSurfaces: SerializedGeometry;
  railSurfaces: SerializedGeometry;
  trees: SerializedGeometry;
  metrics: TileMetrics;
  roadMetrics: RoadMetrics;
  waterMetrics: WaterMetrics;
  greenMetrics: SurfaceMetrics;
  pathMetrics: SurfaceMetrics;
  railMetrics: SurfaceMetrics;
  treeMetrics: TreeMetrics;
}

export class GeometryBudgetError extends Error {
  constructor() {
    super("Tile exceeds the 500,000 triangle limit. Reduce Tile Span or disable layers.");
  }
}

function project(position: Position, center: Coordinates): Position {
  const [longitude, latitude] = position;
  const radians = Math.PI / 180;
  return [
    (longitude - center.longitude) * radians * EARTH_RADIUS_METERS * Math.cos(center.latitude * radians),
    (latitude - center.latitude) * radians * EARTH_RADIUS_METERS,
  ];
}

export function createHexagon(span: number): Ring {
  const radius = span / Math.sqrt(3);
  return Array.from({ length: 7 }, (_, index) => {
    const angle = ((index % 6) * Math.PI) / 3;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as Position;
  });
}

function geometryData(geometry: BufferGeometry): SerializedGeometry {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const index = geometry.getIndex();
  const indices = index
    ? Uint32Array.from(index.array)
    : Uint32Array.from({ length: position.count }, (_, item) => item);
  const rise = geometry.getAttribute("aRise");
  const serialized: SerializedGeometry = {
    positions: Float32Array.from(position.array),
    normals: Float32Array.from(normal.array),
    indices,
  };
  if (color) serialized.colors = Float32Array.from(color.array);
  if (rise) serialized.rise = Float32Array.from(rise.array);
  return serialized;
}

/**
 * Attach a per-vertex `aRise` BufferAttribute driving the preview reveal
 * animation: every vertex of a building carries that building's centroid distance
 * from the Tile Centre, normalised by `span / 2` and clamped to 0..1. Central
 * buildings get values near 0 (rise first); edge buildings near 1 (rise last).
 * Preview-only — export ignores it. Applied to every building so `mergeGeometries`
 * sees a consistent attribute set.
 */
function applyBuildingRise(geometry: BufferGeometry, span: number): void {
  const position = geometry.getAttribute("position");
  const count = position.count;
  let sumX = 0;
  let sumZ = 0;
  for (let vertex = 0; vertex < count; vertex += 1) {
    sumX += position.getX(vertex);
    sumZ += position.getZ(vertex);
  }
  const centroidX = count > 0 ? sumX / count : 0;
  const centroidZ = count > 0 ? sumZ / count : 0;
  const distance = Math.hypot(centroidX, centroidZ);
  const rise = Math.min(1, Math.max(0, distance / (span / 2)));
  const array = new Float32Array(count).fill(rise);
  geometry.setAttribute("aRise", new BufferAttribute(array, 1));
}

/**
 * Attach a per-vertex `color` BufferAttribute (linear-sRGB) to a building
 * geometry so preview/export can render OSM `building:colour`/`roof:colour`.
 * Untagged vertices default to white `(1,1,1)` so the material colour
 * multiplies through unchanged. When a roof colour is present, every face whose
 * three vertices all have an upward normal (`normal.y > 0.9` — the flat top of
 * the extrusion) is overridden with the roof colour; walls keep the wall colour.
 * Applied to every building when `useOsmColors` is on so `mergeGeometries` sees
 * a consistent attribute set.
 */
function applyBuildingColors(geometry: BufferGeometry, colors: BuildingColors): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const count = position.count;
  const array = new Float32Array(count * 3);
  const [wallR, wallG, wallB] = colors.wall ?? [1, 1, 1];
  for (let vertex = 0; vertex < count; vertex += 1) {
    array[vertex * 3] = wallR;
    array[vertex * 3 + 1] = wallG;
    array[vertex * 3 + 2] = wallB;
  }

  if (colors.roof) {
    const [roofR, roofG, roofB] = colors.roof;
    const index = geometry.getIndex();
    const faceCount = index ? index.count : count;
    const vertexOf = index ? (item: number) => index.getX(item) : (item: number) => item;
    for (let face = 0; face + 2 < faceCount; face += 3) {
      const a = vertexOf(face);
      const b = vertexOf(face + 1);
      const c = vertexOf(face + 2);
      if (normal.getY(a) > 0.9 && normal.getY(b) > 0.9 && normal.getY(c) > 0.9) {
        for (const vertex of [a, b, c]) {
          array[vertex * 3] = roofR;
          array[vertex * 3 + 1] = roofG;
          array[vertex * 3 + 2] = roofB;
        }
      }
    }
  }

  geometry.setAttribute("color", new BufferAttribute(array, 3));
}

export function emptyGeometry(): SerializedGeometry {
  return {
    positions: new Float32Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
  };
}

function polygonGeometry(polygon: Polygon, height: number, minHeight: number): BufferGeometry | null {
  const [outer, ...holes] = polygon;
  if (!outer || outer.length < 4 || height <= minHeight) return null;

  const shape = new Shape(outer.slice(0, -1).map(([x, y]) => new Vector2(x, y)));
  for (const hole of holes) {
    if (hole.length < 4) continue;
    shape.holes.push(new Path(hole.slice(0, -1).map(([x, y]) => new Vector2(x, y))));
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: height - minHeight,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, minHeight, 0);
  return geometry;
}

/**
 * Clip a ground layer's polygons to the tile and carve away every higher-priority
 * ground surface accumulated so far, so overlapping slabs never coexist at y=0.
 *
 *   clipped      = differencePolygons(intersectPolygons(unionPolygons(polygons), integerClip), occupied)
 *   nextOccupied = unionPolygons([...occupied, ...clipped])
 *
 * When this layer contributes nothing (`clipped` empty), `occupied` is returned
 * unchanged — geometrically identical to re-unioning it, but skips the work.
 */
function clipGroundLayer(
  polygons: Polygon[],
  integerClip: Polygon[],
  occupied: Polygon[],
): { clipped: Polygon[]; nextOccupied: Polygon[] } {
  const clipped = differencePolygons(
    intersectPolygons(unionPolygons(polygons), integerClip),
    occupied,
  );
  const nextOccupied =
    clipped.length === 0 ? occupied : unionPolygons([...occupied, ...clipped]);
  return { clipped, nextOccupied };
}

function incrementSource(metrics: TileMetrics, source: HeightSource): void {
  metrics[source] += 1;
}

function incrementRoadSource(metrics: RoadMetrics, source: RoadWidthSource | "mapped"): void {
  metrics[source] += 1;
}

function incrementWaterSource(metrics: WaterMetrics, source: WaterWidthSource | "mapped"): void {
  metrics[source] += 1;
}

function incrementPathSource(metrics: SurfaceMetrics, source: PathWidthSource | "mapped"): void {
  metrics[source] += 1;
}

function incrementRailSource(metrics: SurfaceMetrics, source: RailWidthSource): void {
  metrics[source] += 1;
}

/**
 * Extrude a set of already-clipped ground polygons into 5 cm slabs, enforcing
 * the shared triangle budget as each one is added, then merge them into a
 * single geometry. Consolidates the extrude→budget-check→merge sequence that
 * was previously duplicated across roads, water, and green surfaces.
 *
 * `budgetSoFar` is the running triangle total (base + every layer generated
 * before this one, including this layer's own accumulator at call time, which
 * is always 0 for a layer that hasn't extruded anything yet). `onBudgetExceeded`
 * disposes whatever geometries this call's caller is responsible for (prior
 * merged layers + the base) before `GeometryBudgetError` propagates.
 */
function extrudeGroundSurfaces(
  polygons: Polygon[],
  budgetSoFar: number,
  onBudgetExceeded: () => void,
): { geometry: BufferGeometry | null; triangles: number; count: number } {
  const geometries: BufferGeometry[] = [];
  let triangles = 0;
  for (const polygon of polygons) {
    const geometry = polygonGeometry(polygon, 0.05, 0);
    if (!geometry) continue;
    const geometryTriangles = (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
    if (budgetSoFar + triangles + geometryTriangles > TRIANGLE_LIMIT) {
      geometry.dispose();
      for (const created of geometries) created.dispose();
      onBudgetExceeded();
      throw new GeometryBudgetError();
    }
    triangles += geometryTriangles;
    geometries.push(geometry);
  }
  const count = geometries.length;
  const geometry = geometries.length > 0 ? mergeGeometries(geometries, false) : null;
  for (const created of geometries) created.dispose();
  return { geometry, triangles, count };
}

export function generateTile(config: GenerateTileConfig, sources: TileSources): GeneratedTile {
  const { buildings, roads, water, green, paths, rail, trees } = sources;
  if (config.span < 100 || config.span > 2_000) {
    throw new RangeError("Tile Span must be between 100 and 2,000 meters.");
  }

  const hexagon = createHexagon(config.span);
  const integerClip: Polygon[] = [[hexagon]];
  const radius = config.span / Math.sqrt(3);
  const thickness = config.span * 0.01;
  const base = new CylinderGeometry(radius, radius, thickness, 6, 1, false, 0);
  base.rotateY(Math.PI / 6);
  base.translate(0, -thickness / 2, 0);
  const baseTriangles = (base.getIndex()?.count ?? base.getAttribute("position").count) / 3;
  const geometries: BufferGeometry[] = [];
  // Clipped Building Outline footprints, accumulated as the buildings are
  // extruded, so trees can be kept out of Building Massing (see the tree block).
  const buildingFootprints: Polygon[] = [];
  const metrics: TileMetrics = {
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
  const greenMetrics: SurfaceMetrics = {
    mapped: 0,
    explicit: 0,
    fallback: 0,
    generated: 0,
    skipped: 0,
    triangles: 0,
  };
  const pathMetrics: SurfaceMetrics = {
    mapped: 0,
    explicit: 0,
    fallback: 0,
    generated: 0,
    skipped: 0,
    triangles: 0,
  };
  const railMetrics: SurfaceMetrics = {
    mapped: 0,
    explicit: 0,
    fallback: 0,
    generated: 0,
    skipped: 0,
    triangles: 0,
  };

  for (const building of buildings) {
    const resolved = resolveBuildingHeight(building.tags);
    const colors = config.useOsmColors ? resolveBuildingColors(building.tags) : null;
    let generated = false;
    try {
      for (const polygon of building.polygons) {
        const projected = polygon.map((ring) => ring.map((point) => project(point, config.center)));
        const clipped = intersectPolygons([projected], integerClip);
        for (const clippedPolygon of clipped) {
          buildingFootprints.push(clippedPolygon as Polygon);
          const geometry = polygonGeometry(
            clippedPolygon as Polygon,
            resolved.height,
            resolved.minHeight,
          );
          if (!geometry) continue;
          const triangles = (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
          if (baseTriangles + metrics.triangles + triangles > TRIANGLE_LIMIT) {
            geometry.dispose();
            for (const created of geometries) created.dispose();
            base.dispose();
            throw new GeometryBudgetError();
          }
          if (colors) applyBuildingColors(geometry, colors);
          applyBuildingRise(geometry, config.span);
          metrics.triangles += triangles;
          geometries.push(geometry);
          generated = true;
        }
      }
    } catch (error) {
      if (error instanceof GeometryBudgetError) throw error;
      generated = false;
    }

    if (generated) {
      metrics.generated += 1;
      incrementSource(metrics, resolved.source);
    } else {
      metrics.skipped += 1;
    }
  }

  const merged = geometries.length > 0 ? mergeGeometries(geometries, false) : null;
  for (const geometry of geometries) geometry.dispose();

  const roadSurfaces: Array<{
    polygons: Polygon[];
    source: RoadWidthSource | "mapped";
  }> = [];
  for (const road of roads) {
    try {
      const mapped = road.polygons.map((polygon) =>
        polygon.map((ring) => ring.map((point) => project(point, config.center))),
      );
      const width = resolveRoadWidth(road.tags);
      const buffered = bufferLines(
        road.lines.map((line) => line.map((point) => project(point, config.center))),
        width.width,
      );
      if (mapped.length === 0 && buffered.length === 0) {
        roadMetrics.skipped += 1;
        continue;
      }
      const roadSurface = unionPolygons([...mapped, ...buffered]);
      const withinTile = intersectPolygons(roadSurface, integerClip);
      if (withinTile.length === 0) continue;
      roadSurfaces.push({
        polygons: roadSurface,
        source: mapped.length > 0 ? "mapped" : width.source,
      });
    } catch {
      roadMetrics.skipped += 1;
    }
  }

  let acceptedRoads = roadSurfaces;
  let combinedRoads: Polygon[] = [];
  if (roadSurfaces.length > 0) {
    try {
      combinedRoads = unionPolygons(roadSurfaces.flatMap(({ polygons }) => polygons));
    } catch {
      acceptedRoads = [];
      for (const road of roadSurfaces) {
        try {
          combinedRoads = unionPolygons([...combinedRoads, ...road.polygons]);
          acceptedRoads.push(road);
        } catch {
          roadMetrics.skipped += 1;
        }
      }
    }
  }
  for (const road of acceptedRoads) {
    roadMetrics.generated += 1;
    incrementRoadSource(roadMetrics, road.source);
  }

  const clippedRoads = intersectPolygons(combinedRoads, integerClip);
  const {
    geometry: mergedRoads,
    triangles: roadTriangles,
  } = extrudeGroundSurfaces(clippedRoads, baseTriangles + metrics.triangles + roadMetrics.triangles, () => {
    merged?.dispose();
    base.dispose();
  });
  roadMetrics.triangles += roadTriangles;

  // Ground-surface subtraction chain (priority: roads > paths > rail > water > green).
  // `occupied` is the union of every higher-priority ground polygon accumulated so
  // far; each lower layer subtracts it so slabs at y=0 never overlap.
  let occupied: Polygon[] = clippedRoads;

  // Paths — project mapped polygons and buffer centerlines (mirrors the road
  // flow), then carve away the road corridor via the shared subtraction chain.
  // Skipped entirely (both generation and metrics) when the pathsRail toggle is off.
  const pathPolygons: Polygon[] = [];
  if (config.layers?.pathsRail !== false) {
    for (const path of paths) {
      try {
        const mapped = path.polygons.map((polygon) =>
          polygon.map((ring) => ring.map((point) => project(point, config.center))),
        );
        const width = resolvePathWidth(path.tags);
        const buffered = bufferLines(
          path.lines.map((line) => line.map((point) => project(point, config.center))),
          width.width,
        );
        if (mapped.length === 0 && buffered.length === 0) {
          pathMetrics.skipped += 1;
          continue;
        }
        const surface = unionPolygons([...mapped, ...buffered]);
        const withinTile = intersectPolygons(surface, integerClip);
        if (withinTile.length === 0) continue;
        pathPolygons.push(...surface);
        pathMetrics.generated += 1;
        incrementPathSource(pathMetrics, mapped.length > 0 ? "mapped" : width.source);
      } catch {
        pathMetrics.skipped += 1;
      }
    }
  }
  const { clipped: clippedPaths, nextOccupied: occupiedAfterPaths } = clipGroundLayer(
    pathPolygons,
    integerClip,
    occupied,
  );
  occupied = occupiedAfterPaths;
  const {
    geometry: mergedPaths,
    triangles: pathTriangles,
  } = extrudeGroundSurfaces(
    clippedPaths,
    baseTriangles + metrics.triangles + roadMetrics.triangles + pathMetrics.triangles,
    () => {
      mergedRoads?.dispose();
      merged?.dispose();
      base.dispose();
    },
  );
  pathMetrics.triangles += pathTriangles;

  // Rail — buffered centerlines only (rail has no mapped polygon source), then
  // carved against roads and paths before water/green.
  const railPolygons: Polygon[] = [];
  if (config.layers?.pathsRail !== false) {
    for (const railSource of rail) {
      try {
        const width = resolveRailWidth(railSource.tags);
        const buffered = bufferLines(
          railSource.lines.map((line) => line.map((point) => project(point, config.center))),
          width.width,
        );
        if (buffered.length === 0) {
          railMetrics.skipped += 1;
          continue;
        }
        const surface = unionPolygons(buffered);
        const withinTile = intersectPolygons(surface, integerClip);
        if (withinTile.length === 0) continue;
        railPolygons.push(...surface);
        railMetrics.generated += 1;
        incrementRailSource(railMetrics, width.source);
      } catch {
        railMetrics.skipped += 1;
      }
    }
  }
  const { clipped: clippedRail, nextOccupied: occupiedAfterRail } = clipGroundLayer(
    railPolygons,
    integerClip,
    occupied,
  );
  occupied = occupiedAfterRail;
  const {
    geometry: mergedRail,
    triangles: railTriangles,
  } = extrudeGroundSurfaces(
    clippedRail,
    baseTriangles + metrics.triangles + roadMetrics.triangles + pathMetrics.triangles + railMetrics.triangles,
    () => {
      mergedPaths?.dispose();
      mergedRoads?.dispose();
      merged?.dispose();
      base.dispose();
    },
  );
  railMetrics.triangles += railTriangles;

  const waterPolygons: Polygon[] = [];
  for (const source of water) {
    try {
      const mapped = source.polygons.map((polygon) =>
        polygon.map((ring) => ring.map((point) => project(point, config.center))),
      );
      const width = resolveWaterWidth(source.tags);
      const buffered = bufferLines(
        source.lines.map((line) => line.map((point) => project(point, config.center))),
        width.width,
      );
      if (mapped.length === 0 && buffered.length === 0) {
        waterMetrics.skipped += 1;
        continue;
      }
      const surface = unionPolygons([...mapped, ...buffered]);
      const withinTile = intersectPolygons(surface, integerClip);
      if (withinTile.length === 0) continue;
      waterPolygons.push(...surface);
      waterMetrics.generated += 1;
      incrementWaterSource(waterMetrics, mapped.length > 0 ? "mapped" : width.source);
    } catch {
      waterMetrics.skipped += 1;
    }
  }

  const clippedWater = waterPolygons.length === 0
    ? []
    : differencePolygons(
        intersectPolygons(unionPolygons(waterPolygons), integerClip),
        occupied,
      );
  const {
    geometry: mergedWater,
    triangles: waterTriangles,
  } = extrudeGroundSurfaces(
    clippedWater,
    baseTriangles +
      metrics.triangles +
      roadMetrics.triangles +
      pathMetrics.triangles +
      railMetrics.triangles +
      waterMetrics.triangles,
    () => {
      mergedRail?.dispose();
      mergedPaths?.dispose();
      mergedRoads?.dispose();
      merged?.dispose();
      base.dispose();
    },
  );
  waterMetrics.triangles += waterTriangles;

  // Water joins the occupancy union before green subtracts against it.
  occupied =
    clippedWater.length === 0 ? occupied : unionPolygons([...occupied, ...clippedWater]);

  // Green surfaces — the lowest-priority ground layer. Skipped entirely when the
  // green layer toggle is off; otherwise each source polygon carves against every
  // higher-priority surface via the shared subtraction chain.
  const greenPolygons: Polygon[] = [];
  if (config.layers?.green !== false) {
    for (const source of green) {
      const kind = resolveGreenKind(source.tags);
      if (!kind) {
        greenMetrics.skipped += 1;
        continue;
      }
      try {
        const mapped = source.polygons.map((polygon) =>
          polygon.map((ring) => ring.map((point) => project(point, config.center))),
        );
        if (mapped.length === 0) {
          greenMetrics.skipped += 1;
          continue;
        }
        const surface = unionPolygons(mapped);
        const withinTile = intersectPolygons(surface, integerClip);
        if (withinTile.length === 0) continue;
        greenPolygons.push(...surface);
        greenMetrics.mapped += 1;
      } catch {
        greenMetrics.skipped += 1;
      }
    }
  }

  const { clipped: clippedGreen } = clipGroundLayer(greenPolygons, integerClip, occupied);
  const {
    geometry: mergedGreen,
    triangles: greenTriangles,
    count: greenCount,
  } = extrudeGroundSurfaces(
    clippedGreen,
    baseTriangles +
      metrics.triangles +
      roadMetrics.triangles +
      pathMetrics.triangles +
      railMetrics.triangles +
      waterMetrics.triangles +
      greenMetrics.triangles,
    () => {
      mergedWater?.dispose();
      mergedRail?.dispose();
      mergedPaths?.dispose();
      mergedRoads?.dispose();
      merged?.dispose();
      base.dispose();
    },
  );
  greenMetrics.triangles += greenTriangles;
  greenMetrics.generated += greenCount;

  // Trees — deterministic scatter across forest-tagged green sources plus mapped
  // natural=tree points. Skipped entirely (generation and metrics) when the trees
  // toggle is off. Placement is a pure, reproducible function of center/span, so
  // identical inputs always produce byte-identical geometry.
  const treeMetrics: TreeMetrics = { mapped: 0, scattered: 0, capped: 0, triangles: 0 };
  let mergedTrees: BufferGeometry | null = null;
  if (config.layers?.trees !== false) {
    const forestPolygons: Polygon[] = [];
    for (const source of green) {
      if (!FOREST_TAGS(source.tags)) continue;
      try {
        for (const polygon of source.polygons) {
          const projected = polygon.map((ring) => ring.map((point) => project(point, config.center)));
          forestPolygons.push(...intersectPolygons([projected], integerClip));
        }
      } catch {
        // Malformed forest polygons are skipped, not fatal.
      }
    }

    // Tree keep-out mask: no tree — scattered or mapped — may stand on another
    // surface. It unions every non-natural surface the tile renders (roads,
    // paths, rail, water via `occupied`, plus Building Massing footprints).
    // Green Surfaces are deliberately absent: trees belong on grass/parks.
    const keepOut: Polygon[] =
      buildingFootprints.length === 0 ? occupied : [...occupied, ...buildingFootprints];

    // Scatter only on forest ground that survives the keep-out mask, so a forest
    // polygon overlapping a river or a building never sprouts trees there.
    const scatterForests =
      forestPolygons.length === 0 || keepOut.length === 0
        ? forestPolygons
        : differencePolygons(forestPolygons, keepOut);

    // Axis-aligned bounds per keep-out polygon so the mapped-tree point test
    // stays cheap on large tiles (span 2000 in a dense city yields thousands of
    // building footprints): reject on the box before the ray-cast.
    const keepOutBounds = keepOut.map((polygon) => {
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of polygon[0] ?? []) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      return { minX, minZ, maxX, maxZ };
    });
    const insideKeepOut = ([x, z]: Position): boolean => {
      for (let index = 0; index < keepOut.length; index++) {
        const bounds = keepOutBounds[index];
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
        if (pointInPolygon([x, z], keepOut[index])) return true;
      }
      return false;
    };

    // Mapped natural=tree points keep their exact surveyed positions, but any
    // that land on the keep-out mask (in water, on a street, inside a building)
    // are dropped rather than left intersecting that surface.
    const mappedTrees: Position[] = [];
    for (const tree of trees) {
      const projected = project(tree.position, config.center);
      if (!pointInPolygon(projected, [hexagon])) continue;
      if (insideKeepOut(projected)) continue;
      mappedTrees.push(projected);
    }

    const seedText = `${config.center.latitude.toFixed(6)},${config.center.longitude.toFixed(6)},${config.span}`;
    const { placements, scattered, capped } = scatterTrees({
      forests: scatterForests,
      mappedTrees,
      seedText,
    });

    const treeTriangles = placements.length * TREE_TRIANGLES;
    const budgetSoFar =
      baseTriangles +
      metrics.triangles +
      roadMetrics.triangles +
      pathMetrics.triangles +
      railMetrics.triangles +
      waterMetrics.triangles +
      greenMetrics.triangles;
    if (budgetSoFar + treeTriangles > TRIANGLE_LIMIT) {
      mergedGreen?.dispose();
      mergedWater?.dispose();
      mergedRail?.dispose();
      mergedPaths?.dispose();
      mergedRoads?.dispose();
      merged?.dispose();
      base.dispose();
      throw new GeometryBudgetError();
    }

    mergedTrees = buildTreesGeometry(placements);
    treeMetrics.mapped = mappedTrees.length;
    treeMetrics.scattered = scattered;
    treeMetrics.capped = capped;
    treeMetrics.triangles = treeTriangles;
  }

  const result = {
    base: geometryData(base),
    buildings: merged ? geometryData(merged) : emptyGeometry(),
    roadSurfaces: mergedRoads ? geometryData(mergedRoads) : emptyGeometry(),
    waterSurfaces: mergedWater ? geometryData(mergedWater) : emptyGeometry(),
    greenSurfaces: mergedGreen ? geometryData(mergedGreen) : emptyGeometry(),
    pathSurfaces: mergedPaths ? geometryData(mergedPaths) : emptyGeometry(),
    railSurfaces: mergedRail ? geometryData(mergedRail) : emptyGeometry(),
    trees: mergedTrees ? geometryData(mergedTrees) : emptyGeometry(),
    metrics,
    roadMetrics,
    waterMetrics,
    greenMetrics,
    pathMetrics,
    railMetrics,
    treeMetrics,
  };
  base.dispose();
  merged?.dispose();
  mergedRoads?.dispose();
  mergedPaths?.dispose();
  mergedRail?.dispose();
  mergedWater?.dispose();
  mergedGreen?.dispose();
  mergedTrees?.dispose();
  return result;
}
