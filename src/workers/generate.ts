import type { GeneratedTile, GenerateTileConfig, TileSources } from "../geometry/generate-tile";

let requestId = 0;

export function generateInWorker(config: GenerateTileConfig, sources: TileSources): Promise<GeneratedTile> {
  const id = ++requestId;
  const worker = new Worker(new URL("./tile.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ id: number; result?: GeneratedTile; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("Tile worker returned no result."));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Tile generation worker failed."));
    };
    worker.postMessage({ id, config, sources });
  });
}
