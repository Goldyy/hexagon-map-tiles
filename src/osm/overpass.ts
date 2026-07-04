import type { Coordinates } from "../domain/location";
import { cachedJson } from "../cache/cache";

const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const RETRY_DELAY_MINIMUM_MS = 250;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function waitForRetry(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, RETRY_DELAY_MINIMUM_MS + Math.random() * RETRY_DELAY_MINIMUM_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function queryBounds(center: Coordinates, span: number) {
  const radius = span / Math.sqrt(3) + 100;
  const latitudeDelta = radius / 111_320;
  const longitudeDelta = radius / (111_320 * Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180)));
  return {
    south: center.latitude - latitudeDelta,
    west: center.longitude - longitudeDelta,
    north: center.latitude + latitudeDelta,
    east: center.longitude + longitudeDelta,
  };
}

export async function fetchMapData(
  center: Coordinates,
  span: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const { south, west, north, east } = queryBounds(center, span);
  const bounds = `${south},${west},${north},${east}`;
  const roadClasses = "^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian)$";
  const waterwayClasses = "^(river|canal|stream)$";
  const leisureClasses = "^(park|garden)$";
  const greenLanduseClasses = "^(grass|meadow|forest|recreation_ground|village_green)$";
  const greenNaturalClasses = "^(wood|scrub|grassland)$";
  const pathClasses = "^(footway|cycleway|path|steps)$";
  const railClasses = "^(rail|tram|light_rail)$";
  const query = `[out:json][timeout:25];(way["building"](${bounds});relation["building"](${bounds});way["building:part"](${bounds});relation["building:part"](${bounds});way["highway"~"${roadClasses}"](${bounds});relation["highway"~"${roadClasses}"]["area"="yes"](${bounds});way["area:highway"~"${roadClasses}"](${bounds});relation["area:highway"~"${roadClasses}"](${bounds});way["natural"="water"](${bounds});relation["natural"="water"](${bounds});way["waterway"="riverbank"](${bounds});relation["waterway"="riverbank"](${bounds});way["landuse"~"^(reservoir|basin)$"](${bounds});relation["landuse"~"^(reservoir|basin)$"](${bounds});way["waterway"~"${waterwayClasses}"](${bounds});way["leisure"~"${leisureClasses}"](${bounds});relation["leisure"~"${leisureClasses}"](${bounds});way["landuse"~"${greenLanduseClasses}"](${bounds});relation["landuse"~"${greenLanduseClasses}"](${bounds});way["natural"~"${greenNaturalClasses}"](${bounds});relation["natural"~"${greenNaturalClasses}"](${bounds});way["highway"~"${pathClasses}"](${bounds});way["area:highway"~"${pathClasses}"](${bounds});way["railway"~"${railClasses}"](${bounds});node["natural"="tree"](${bounds}););out body;>;out skel qt;`;
  const endpoint = import.meta.env.VITE_OVERPASS_ENDPOINT || DEFAULT_ENDPOINT;
  const cacheKey = `overpass:v4:${center.latitude.toFixed(6)}:${center.longitude.toFixed(6)}:${span}`;
  return cachedJson(
    cacheKey,
    async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(endpoint, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          signal,
        });
        if (response.ok) return response.json();
        if (response.status === 504 && attempt === 0) {
          await waitForRetry(signal);
          continue;
        }
        throw new Error(`Map data service returned ${response.status}. Try again.`);
      }
      throw new Error("Map data service did not return a response. Try again.");
    },
    15 * 60 * 1_000,
  );
}
