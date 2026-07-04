import { describe, expect, it } from "vitest";

import { buildTreesGeometry, TREE_TRIANGLES } from "./tree-geometry";
import type { TreePlacement } from "./tree-scatter";

const placement = (x: number, z: number): TreePlacement => ({
  x,
  z,
  scale: 1,
  rotation: 0,
});

describe("buildTreesGeometry", () => {
  it("exposes a positive per-tree triangle count", () => {
    expect(TREE_TRIANGLES).toBeGreaterThan(0);
    expect(Number.isInteger(TREE_TRIANGLES)).toBe(true);
  });

  it("merges one instance of the template per placement", () => {
    const geometry = buildTreesGeometry([placement(0, 0), placement(10, 0), placement(0, 10)]);
    expect(geometry).not.toBeNull();
    expect(geometry!.index).not.toBeNull();
    expect(geometry!.index!.count).toBe(3 * TREE_TRIANGLES * 3);
    geometry!.dispose();
  });

  it("returns null when there are no placements", () => {
    expect(buildTreesGeometry([])).toBeNull();
  });

  it("positions each tree at its placement, canopy above the trunk", () => {
    const geometry = buildTreesGeometry([placement(25, -15)]);
    const positions = geometry!.getAttribute("position");
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumZ = 0;
    for (let index = 0; index < positions.count; index++) {
      sumX += positions.getX(index);
      sumZ += positions.getZ(index);
      minY = Math.min(minY, positions.getY(index));
      maxY = Math.max(maxY, positions.getY(index));
    }
    // Sits on the ground (base slab at y = 0.05) and rises into a canopy.
    expect(minY).toBeCloseTo(0.05, 3);
    expect(maxY).toBeGreaterThan(4);
    // Centered on the placement's east (x), and on the *negated* north (z): the
    // placement carries projected (east, north), and north maps to world -Z to
    // match the ground/building layers (the "-Z is north" invariant).
    expect(sumX / positions.count).toBeCloseTo(25, 0);
    expect(sumZ / positions.count).toBeCloseTo(15, 0);
    geometry!.dispose();
  });
});
