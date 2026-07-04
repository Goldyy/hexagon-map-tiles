/// <reference lib="webworker" />

import { generateTile, type GenerateTileConfig, type TileSources } from "../geometry/generate-tile";

export interface WorkerRequest {
  id: number;
  config: GenerateTileConfig;
  sources: TileSources;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, config, sources } = event.data;
  try {
    const result = generateTile(config, sources);
    const transfer = [
      result.base.positions.buffer,
      result.base.normals.buffer,
      result.base.indices.buffer,
      result.buildings.positions.buffer,
      result.buildings.normals.buffer,
      result.buildings.indices.buffer,
      result.roadSurfaces.positions.buffer,
      result.roadSurfaces.normals.buffer,
      result.roadSurfaces.indices.buffer,
      result.waterSurfaces.positions.buffer,
      result.waterSurfaces.normals.buffer,
      result.waterSurfaces.indices.buffer,
      result.greenSurfaces.positions.buffer,
      result.greenSurfaces.normals.buffer,
      result.greenSurfaces.indices.buffer,
      result.pathSurfaces.positions.buffer,
      result.pathSurfaces.normals.buffer,
      result.pathSurfaces.indices.buffer,
      result.railSurfaces.positions.buffer,
      result.railSurfaces.normals.buffer,
      result.railSurfaces.indices.buffer,
      result.trees.positions.buffer,
      result.trees.normals.buffer,
      result.trees.indices.buffer,
    ];
    if (result.buildings.rise) transfer.push(result.buildings.rise.buffer);
    if (result.buildings.colors) transfer.push(result.buildings.colors.buffer);
    self.postMessage({ id, result }, { transfer });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Tile generation failed." });
  }
};
