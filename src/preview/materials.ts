import { Color, MeshStandardMaterial } from "three";

export function createRoadPreviewMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

export function createWaterPreviewMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.65,
    metalness: 0,
  });
}

/**
 * Ground-slab materials for the enrichment layers. Green, Path, and Rail surfaces
 * sit at y=0 alongside Road Surfaces, so they share the same negative
 * `polygonOffset` bias to keep them from z-fighting the Tile Base. Trees are
 * volumetric geometry and need no offset.
 */
export function createGreenPreviewMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

export function createPathPreviewMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

export function createRailPreviewMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.9,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

export function createTreesPreviewMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.85,
    metalness: 0,
  });
}
