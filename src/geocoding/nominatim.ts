import type { Coordinates } from "../domain/location";
import { cachedJson } from "../cache/cache";

export interface PlaceResult extends Coordinates {
  displayName: string;
}

export async function searchAddress(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const endpoint = new URL(
    import.meta.env.VITE_NOMINATIM_ENDPOINT || "https://nominatim.openstreetmap.org/search",
  );
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("accept-language", navigator.language);
  const data = await cachedJson(
    `nominatim:v1:${query.trim().toLocaleLowerCase()}:${navigator.language}`,
    async () => {
      const response = await fetch(endpoint, { signal });
      if (!response.ok) throw new Error(`Address service returned ${response.status}. Try again.`);
      return response.json() as Promise<Array<{ lat: string; lon: string; display_name: string }>>;
    },
    7 * 24 * 60 * 60 * 1_000,
  );
  return data.map((item) => ({
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    displayName: item.display_name,
  }));
}
