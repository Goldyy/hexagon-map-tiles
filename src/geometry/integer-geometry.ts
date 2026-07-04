import {
  booleanOpWithPolyTree,
  ClipType,
  EndType,
  FillRule,
  inflatePaths,
  JoinType,
  type Path64,
  type Paths64,
  type PolyPath64,
  PolyTree64,
  stripDuplicates,
} from "clipper2-ts";

export type Position = [number, number];
export type Ring = Position[];
export type Polygon = Ring[];

const INTEGER_SCALE = 1_000;
const ARC_TOLERANCE = 0.1 * INTEGER_SCALE;

function samePosition(first: Position, second: Position): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

function toPath(ring: Ring, closed: boolean): Path64 {
  const points = closed && ring.length > 1 && samePosition(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring;
  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return [];
  return stripDuplicates(
    points.map(([x, y]) => ({
      x: Math.round(x * INTEGER_SCALE),
      y: Math.round(y * INTEGER_SCALE),
    })),
    closed,
  );
}

function polygonsToPaths(polygons: Polygon[]): Paths64 {
  return polygons.flatMap((polygon) =>
    polygon.map((ring) => toPath(ring, true)).filter((path) => path.length >= 3),
  );
}

function fromPath(path: Path64): Ring {
  if (path.length === 0) return [];
  const ring = path.map(({ x, y }) => [x / INTEGER_SCALE, y / INTEGER_SCALE] as Position);
  ring.push([...ring[0]] as Position);
  return ring;
}

function treeToPolygons(tree: PolyTree64): Polygon[] {
  const polygons: Polygon[] = [];

  function visitOuter(index: number, parent: PolyPath64): void {
    const outer = parent.child(index);
    if (!outer.poly || outer.isHole) return;
    const polygon: Polygon = [fromPath(outer.poly)];
    for (let childIndex = 0; childIndex < outer.count; childIndex += 1) {
      const hole = outer.child(childIndex);
      if (hole.poly && hole.isHole) polygon.push(fromPath(hole.poly));
    }
    polygons.push(polygon);

    for (let childIndex = 0; childIndex < outer.count; childIndex += 1) {
      const hole = outer.child(childIndex);
      for (let islandIndex = 0; islandIndex < hole.count; islandIndex += 1) {
        visitOuter(islandIndex, hole);
      }
    }
  }

  for (let index = 0; index < tree.count; index += 1) visitOuter(index, tree);
  return polygons;
}

function booleanPolygons(
  clipType: ClipType,
  subject: Polygon[],
  clip: Polygon[] | null,
  fillRule: FillRule,
): Polygon[] {
  const subjectPaths = polygonsToPaths(subject);
  if (subjectPaths.length === 0) return [];
  const tree = new PolyTree64();
  booleanOpWithPolyTree(
    clipType,
    subjectPaths,
    clip ? polygonsToPaths(clip) : null,
    tree,
    fillRule,
  );
  return treeToPolygons(tree);
}

export function unionPolygons(polygons: Polygon[]): Polygon[] {
  return booleanPolygons(ClipType.Union, polygons, null, FillRule.NonZero);
}

export function intersectPolygons(subject: Polygon[], clip: Polygon[]): Polygon[] {
  return booleanPolygons(ClipType.Intersection, subject, clip, FillRule.EvenOdd);
}

export function differencePolygons(subject: Polygon[], clip: Polygon[]): Polygon[] {
  if (clip.length === 0) return subject;
  return booleanPolygons(ClipType.Difference, subject, clip, FillRule.NonZero);
}

export function bufferLines(lines: Position[][], width: number): Polygon[] {
  const paths = lines.map((line) => toPath(line, false)).filter((path) => path.length >= 2);
  if (paths.length === 0 || !Number.isFinite(width) || width <= 0) return [];
  const buffered = inflatePaths(
    paths,
    (width * INTEGER_SCALE) / 2,
    JoinType.Round,
    EndType.Round,
    2,
    ARC_TOLERANCE,
  );
  const tree = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Union, buffered, null, tree, FillRule.NonZero);
  return treeToPolygons(tree);
}
