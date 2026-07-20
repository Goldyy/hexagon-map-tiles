import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMapData } from "./overpass";

describe("Overpass map data", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries one transient 504 response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("Busy", { status: 504 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      callback();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    await expect(fetchMapData({ latitude: 1, longitude: 1 }, 500)).resolves.toEqual({
      elements: [],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports a 504 after the single retry is exhausted", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("Busy", { status: 504 }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      callback();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    await expect(fetchMapData({ latitude: 2, longitude: 2 }, 500)).rejects.toThrow(
      "Map data service returned 504. Try again.",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("requests mapped water areas and supported waterways in the shared query", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await fetchMapData({ latitude: 3, longitude: 3 }, 500);

    const body = fetch.mock.calls[0]?.[1]?.body as URLSearchParams;
    const query = body.get("data");
    expect(query).toContain('way["natural"="water"]');
    expect(query).toContain('relation["waterway"="riverbank"]');
    expect(query).toContain('way["landuse"~"^(reservoir|basin)$"]');
    expect(query).toContain('way["waterway"~"^(river|canal|stream)$"]');
  });

  it("requests green space, paths, rail, and trees in the shared query", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await fetchMapData({ latitude: 4, longitude: 4 }, 500);

    const body = fetch.mock.calls[0]?.[1]?.body as URLSearchParams;
    const query = body.get("data");
    expect(query).toContain("leisure");
    expect(query).toContain("footway");
    expect(query).toContain("railway");
    expect(query).toContain('node["natural"="tree"]');
    expect(query).toContain('way["area:highway"~"^(footway|cycleway|path|steps)$"]');
  });

  it("caches under the v5 key prefix", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await fetchMapData({ latitude: 5, longitude: 5 }, 500);

    const { openDB } = await import("idb");
    const db = await openDB("hexagon-map-tiles", 1);
    const keys = (await db.getAllKeys("responses")) as string[];
    expect(keys.some((key) => key.startsWith("overpass:v5:5.000000:5.000000:500"))).toBe(true);
  });
});
