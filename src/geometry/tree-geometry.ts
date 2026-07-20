// Low-poly tree geometry: a single shared template (trunk + canopy) is cloned,
// transformed per placement, and merged into one indexed BufferGeometry. Uses
// Three.js but stays worker-safe (no DOM). Determinism lives in tree-scatter.ts;
// this module only realises the placements it is given, in order.

import { BufferGeometry, CylinderGeometry, IcosahedronGeometry } from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { TreePlacement } from "./tree-scatter";

function createTemplate(): BufferGeometry {
  // Trunk: tapered 5-sided cylinder standing on the ground (centre at y = 1.1).
  const trunk = new CylinderGeometry(0.25, 0.35, 2.2, 5);
  trunk.translate(0, 1.1, 0);

  // Canopy: a bare icosahedron. IcosahedronGeometry is non-indexed, so index it
  // (mergeVertices) to keep the merged template indexed for budget/triangle math.
  const canopyRaw = new IcosahedronGeometry(2.4, 0);
  const canopy = mergeVertices(canopyRaw);
  canopyRaw.dispose();
  canopy.translate(0, 4.4, 0);

  const template = mergeGeometries([trunk, canopy], false);
  trunk.dispose();
  canopy.dispose();
  return template;
}

const TEMPLATE = createTemplate();

/** Triangles in one tree template — the per-instance triangle count for budget math. */
export const TREE_TRIANGLES =
  (TEMPLATE.getIndex()?.count ?? TEMPLATE.getAttribute("position").count) / 3;

/**
 * Build one merged geometry from tree placements. Each placement clones the
 * template and applies uniform scale, then rotation about Y, then a translation
 * onto the tile base slab. Returns null for no placements.
 *
 * Placements carry projected (east, north) coordinates. The rest of the pipeline
 * maps a projected point through polygonGeometry's `rotateX(-π/2)`, which sends
 * north to world -Z (the "-Z is north" invariant). Trees are translated directly
 * rather than rotated, so we negate the north component here to land on the same
 * side of the tile as the ground surfaces and Building Massing — without it the
 * whole tree layer is mirrored across the north-south axis.
 */
export function buildTreesGeometry(placements: TreePlacement[]): BufferGeometry | null {
  if (placements.length === 0) return null;

  const geometries = placements.map((placement) => buildTreeGeometry(placement));
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

/** Realise a single placement as its own geometry — one tree, one object. */
export function buildTreeGeometry(placement: TreePlacement): BufferGeometry {
  const instance = TEMPLATE.clone();
  instance.scale(placement.scale, placement.scale, placement.scale);
  instance.rotateY(placement.rotation);
  instance.translate(placement.x, 0.05, -placement.z);
  return instance;
}
