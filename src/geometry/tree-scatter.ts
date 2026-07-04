// Deterministic tree placement: mapped natural=tree points plus a reproducible
// grid scatter across forest polygons. Pure and worker-safe — no Three.js, no
// Math.random, no Date. Identical input must always yield identical output so
// that a shared tile URL reproduces byte-for-byte identical geometry.

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];

export interface TreePlacement {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

export const TREE_CAP = 2_000;
export const SCATTER_SPACING_METERS = 12;

/** FNV-1a 32-bit hash of a string, returned as an unsigned 32-bit integer. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG: a deterministic generator of values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInRing([x, z]: Position, ring: Ring): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [xi, zi] = ring[current];
    const [xj, zj] = ring[previous];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Ray-cast point-in-polygon test honouring holes: inside the outer ring and outside every hole. */
export function pointInPolygon(point: Position, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(point, outer)) return false;
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

export function scatterTrees(input: {
  forests: Polygon[];
  mappedTrees: Position[];
  seedText: string;
  cap?: number;
}): { placements: TreePlacement[]; scattered: number; capped: number } {
  const { forests, mappedTrees, seedText, cap = TREE_CAP } = input;
  const rng = mulberry32(hashSeed(seedText));
  const placements: TreePlacement[] = [];
  let scattered = 0;
  let capped = 0;

  // Mapped trees first — they occupy the lowest placement indices, so scattered
  // trees always follow them in the output array. The cap intentionally applies
  // to scatter fill only: mapped OSM points are bounded real data, and the
  // triangle budget backstops the total.
  for (const [x, z] of mappedTrees) {
    const scale = 0.9 + rng() * 0.3;
    const rotation = rng() * Math.PI * 2;
    placements.push({ x, z, scale, rotation });
  }

  // Grid scatter per forest polygon, row-major from (min-x, min-z). Every grid
  // point consumes exactly four PRNG values (x-jitter, z-jitter, scale,
  // rotation) whether kept or rejected, so the shared sequence stays aligned.
  for (const forest of forests) {
    const [outer] = forest;
    if (!outer || outer.length === 0) continue;

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of outer) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    for (let gz = minZ; gz <= maxZ; gz += SCATTER_SPACING_METERS) {
      for (let gx = minX; gx <= maxX; gx += SCATTER_SPACING_METERS) {
        const x = gx + (rng() - 0.5) * 8;
        const z = gz + (rng() - 0.5) * 8;
        const scale = 0.9 + rng() * 0.3;
        const rotation = rng() * Math.PI * 2;
        if (!pointInPolygon([x, z], forest)) continue;
        if (placements.length >= cap) {
          capped++;
          continue;
        }
        placements.push({ x, z, scale, rotation });
        scattered++;
      }
    }
  }

  return { placements, scattered, capped };
}
