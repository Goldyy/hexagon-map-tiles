import osmtogeojson from "osmtogeojson";

import type {
  SourceBuilding,
  SourceGreen,
  SourcePath,
  SourceRail,
  SourceRoad,
  SourceTree,
  SourceWater,
} from "../geometry/generate-tile";

interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  [key: string]: unknown;
}

export interface NormalizedOsm {
  buildings: SourceBuilding[];
  roads: SourceRoad[];
  water: SourceWater[];
  green: SourceGreen[];
  paths: SourcePath[];
  rail: SourceRail[];
  trees: SourceTree[];
  sourceTimestamp: string | null;
}

const ROAD_CLASSES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
  "living_street",
  "service",
  "pedestrian",
]);
const WATERWAY_CLASSES = new Set(["river", "canal", "stream"]);
const PATH_CLASSES = new Set(["footway", "cycleway", "path", "steps"]);
const RAIL_CLASSES = new Set(["rail", "tram", "light_rail"]);
const GREEN_LEISURE = new Set(["park", "garden"]);
const GREEN_LANDUSE = new Set(["grass", "meadow", "forest", "recreation_ground", "village_green"]);
const GREEN_NATURAL = new Set(["wood", "scrub", "grassland"]);
// Re-exported from the dependency-free leaf module so worker-bundled geometry
// code can share the predicate without pulling osmtogeojson into its chunk.
export { FOREST_TAGS } from "./tags";

type Point = [number, number];
type Ring = Point[];

function pointInRing([x, y]: Point, ring: Ring): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [xi, yi] = ring[current];
    const [xj, yj] = ring[previous];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function containsPoint(building: SourceBuilding, point: Point): boolean {
  return building.polygons.some(([outer, ...holes]) => {
    return pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
  });
}

export function normalizeMapData(input: OverpassResponse): NormalizedOsm {
  const collection = osmtogeojson(input);
  const buildings: SourceBuilding[] = [];
  const roads: SourceRoad[] = [];
  const water: SourceWater[] = [];
  const green: SourceGreen[] = [];
  const paths: SourcePath[] = [];
  const rail: SourceRail[] = [];
  const trees: SourceTree[] = [];

  for (const feature of collection.features) {
    const { tags: nestedTags, id: _id, ...flatTags } = feature.properties ?? {};
    const tags = nestedTags ?? flatTags;
    const isVisibleWater =
      tags.intermittent !== "yes" &&
      tags.seasonal === undefined &&
      (tags.tunnel === undefined || tags.tunnel === "no") &&
      tags.covered !== "yes" &&
      Number(tags.layer ?? "0") >= 0;
    const isMappedWaterArea =
      tags.water !== "wastewater" &&
      tags.basin !== "wastewater" &&
      (tags.natural === "water" ||
        tags.waterway === "riverbank" ||
        tags.landuse === "reservoir" ||
        tags.landuse === "basin");
    if (
      isVisibleWater &&
      isMappedWaterArea &&
      feature.geometry &&
      (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
    ) {
      water.push({
        id: feature.id ?? `water/${water.length}`,
        tags,
        lines: [],
        polygons: (feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourceWater["polygons"],
      });
    }
    if (
      isVisibleWater &&
      tags.waterway &&
      WATERWAY_CLASSES.has(tags.waterway) &&
      feature.geometry &&
      (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString")
    ) {
      water.push({
        id: feature.id ?? `water/${water.length}`,
        tags,
        lines: (feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourceWater["lines"],
        polygons: [],
      });
    }
    const isVisibleRoad = tags.tunnel !== "yes" && Number(tags.layer ?? "0") >= 0;
    if (
      isVisibleRoad &&
      tags["area:highway"] &&
      ROAD_CLASSES.has(tags["area:highway"]) &&
      feature.geometry &&
      (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
    ) {
      roads.push({
        id: feature.id ?? `road/${roads.length}`,
        tags,
        lines: [],
        polygons: (feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourceRoad["polygons"],
      });
    }
    if (
      isVisibleRoad &&
      !tags["area:highway"] &&
      tags.highway &&
      ROAD_CLASSES.has(tags.highway) &&
      tags.area === "yes" &&
      feature.geometry &&
      (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
    ) {
      roads.push({
        id: feature.id ?? `road/${roads.length}`,
        tags,
        lines: [],
        polygons: (feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourceRoad["polygons"],
      });
    }
    if (
      tags.highway &&
      ROAD_CLASSES.has(tags.highway) &&
      isVisibleRoad &&
      feature.geometry &&
      (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString")
    ) {
      roads.push({
        id: feature.id ?? `road/${roads.length}`,
        tags,
        lines: (feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourceRoad["lines"],
        polygons: [],
      });
    }
    const isVisibleGreen =
      (tags.tunnel === undefined || tags.tunnel === "no") &&
      tags.covered !== "yes" &&
      Number(tags.layer ?? "0") >= 0;
    const isMappedGreenArea =
      (tags.leisure !== undefined && GREEN_LEISURE.has(tags.leisure)) ||
      (tags.landuse !== undefined && GREEN_LANDUSE.has(tags.landuse)) ||
      (tags.natural !== undefined && GREEN_NATURAL.has(tags.natural));
    if (
      isVisibleGreen &&
      isMappedGreenArea &&
      feature.geometry &&
      (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
    ) {
      green.push({
        id: feature.id ?? `green/${green.length}`,
        tags,
        polygons: (feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourceGreen["polygons"],
      });
    }

    const isVisiblePath = tags.tunnel !== "yes" && Number(tags.layer ?? "0") >= 0;
    if (
      isVisiblePath &&
      tags["area:highway"] &&
      PATH_CLASSES.has(tags["area:highway"]) &&
      feature.geometry &&
      (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
    ) {
      paths.push({
        id: feature.id ?? `path/${paths.length}`,
        tags,
        lines: [],
        polygons: (feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourcePath["polygons"],
      });
    }
    if (
      isVisiblePath &&
      !tags["area:highway"] &&
      tags.highway &&
      PATH_CLASSES.has(tags.highway) &&
      tags.area === "yes" &&
      feature.geometry &&
      (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
    ) {
      paths.push({
        id: feature.id ?? `path/${paths.length}`,
        tags,
        lines: [],
        polygons: (feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourcePath["polygons"],
      });
    }
    if (
      isVisiblePath &&
      tags.highway &&
      PATH_CLASSES.has(tags.highway) &&
      feature.geometry &&
      (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString")
    ) {
      paths.push({
        id: feature.id ?? `path/${paths.length}`,
        tags,
        lines: (feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourcePath["lines"],
        polygons: [],
      });
    }

    const isVisibleRail = tags.tunnel !== "yes";
    if (
      isVisibleRail &&
      tags.railway &&
      RAIL_CLASSES.has(tags.railway) &&
      feature.geometry &&
      (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString")
    ) {
      rail.push({
        id: feature.id ?? `rail/${rail.length}`,
        tags,
        lines: (feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as SourceRail["lines"],
      });
    }

    if (tags.natural === "tree" && feature.geometry && feature.geometry.type === "Point") {
      trees.push({
        id: feature.id ?? `tree/${trees.length}`,
        position: feature.geometry.coordinates as SourceTree["position"],
      });
    }

    if ((!tags.building && !tags["building:part"]) || !feature.geometry) continue;
    if (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") continue;

    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    buildings.push({
      id: feature.id ?? `building/${buildings.length}`,
      tags,
      polygons: polygons as SourceBuilding["polygons"],
    });
  }

  const parts = buildings.filter((building) => building.tags["building:part"]);
  const renderedBuildings = buildings.filter((building) => {
    if (building.tags["building:part"]) return true;
    return !parts.some((part) => {
      const point = part.polygons[0]?.[0]?.[0];
      return point ? containsPoint(building, point) : false;
    });
  });

  return {
    buildings: renderedBuildings,
    roads,
    water,
    green,
    paths,
    rail,
    trees,
    sourceTimestamp: input.osm3s?.timestamp_osm_base ?? null,
  };
}
