// Leaf module for OSM tag predicates shared between normalize.ts and the
// worker-bundled geometry pipeline. Keep this file dependency-free so importing
// a predicate never drags osmtogeojson (or anything else) into the worker chunk.

export const FOREST_TAGS = (tags: Record<string, string>): boolean =>
  tags.natural === "wood" || tags.landuse === "forest";
