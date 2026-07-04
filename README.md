# Hexagon Map Tiles

Static browser app that converts an address or latitude/longitude into a clipped hexagonal GLB containing OpenStreetMap Building Massing, Road Surfaces, Water Surfaces, Green Surfaces, Path Surfaces, Rail Surfaces, and Trees.

## Features

- Address or `lat, lon` input, with client-side geocoding via Nominatim and map data via Overpass (both cached in IndexedDB).
- Buildings (with Building Part massing), roads, water, green spaces, paths, rail, and scattered/mapped trees, each independently toggleable.
- Three built-in themes (Sandstone, Daylight, Night) plus per-surface color overrides, and an optional "use OSM colors" mode that paints Buildings with real-world vertex colors instead of a flat theme color.
- A live Three.js preview with a rise-in reveal animation for buildings, matching the coordinate system and geometry of the downloaded GLB exactly — preview and export are built from the same generated buffers.
- Shareable URLs that round-trip location, span, theme, color overrides, layer toggles, and OSM-color mode.
- A triangle-budget guard (500,000 generated triangles) that aborts cleanly and asks you to reduce Tile Span, rather than silently simplifying geometry.

## Develop

Requires Node.js 20.19+.

```sh
npm install
npm run dev
```

Quality gates:

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Deploy

This is a static site with no backend or server runtime: everything (geocoding, Overpass queries, geometry generation, preview, export) runs in the browser, so any static host works.

Build command: `npm run build`. Static output: `dist/`.

**Cloudflare Pages** (reference target): connect the repository, select the Vite preset, use `npm run build` as the build command and `dist` as the output directory, and publish. No Functions, database, auth, or secrets are required.

**GitHub Pages, or any other static host**: run `npm run build` and upload the contents of `dist/` — no server-side rendering, API routes, or runtime configuration are needed.

`VITE_OVERPASS_ENDPOINT` and `VITE_NOMINATIM_ENDPOINT` may replace the default public providers at build time.

Public provider use is limited to hobby-scale traffic. Read the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) before deployment.

## Share URLs

Generating a tile updates the URL with query parameters that fully describe it, so the link can be shared or bookmarked:

| Param | Meaning |
| --- | --- |
| `lat`, `lon` | Tile Center coordinates. |
| `span` | Tile Span in meters (100–2000). |
| `theme` | Theme id (`sandstone`, `daylight`, `night`); omitted for the default (`sandstone`). |
| `base`, `buildings`, `roads`, `water`, `green`, `paths`, `rail`, `trees` | Per-surface color overrides; only present when they differ from the selected theme. |
| `layers` | Comma-separated list of enabled optional layers: `green`, `pathsrail`, `trees`. Omitted entirely when all are enabled; an included param lists only the ones that are on. |
| `osmcolors` | `1` when Buildings should be painted with real-world OSM vertex colors instead of the theme color. |

## Load an export in Three.js

```ts
import { Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const gltf = await loader.loadAsync("/tile.glb");
scene.add(gltf.scene);

// TileBase always exists; every other mesh is present only if that
// layer had data when the tile was generated, so guard before using it.
const tileBase = gltf.scene.getObjectByName("TileBase");
const buildings = gltf.scene.getObjectByName("Buildings");
const roads = gltf.scene.getObjectByName("RoadSurfaces");
const water = gltf.scene.getObjectByName("WaterSurfaces");
const green = gltf.scene.getObjectByName("GreenSurfaces");
const paths = gltf.scene.getObjectByName("PathSurfaces");
const rail = gltf.scene.getObjectByName("RailSurfaces");
const trees = gltf.scene.getObjectByName("Trees");

// Materials can be swapped per mesh — guard because the mesh may be absent.
if (green instanceof Mesh) green.material = new MeshStandardMaterial({ color: "#4c7a3d" });
```

Exports use meters, Y-up, `+X` east, and `-Z` north, with Tile Center at `(0, 0, 0)`. Up to eight named mesh/material pairs are present: `TileBase`/`TileBaseMaterial` (always present), `Buildings`/`BuildingsMaterial`, `RoadSurfaces`/`RoadSurfaceMaterial`, `WaterSurfaces`/`WaterSurfaceMaterial`, `GreenSurfaces`/`GreenSurfaceMaterial`, `PathSurfaces`/`PathSurfaceMaterial`, `RailSurfaces`/`RailSurfaceMaterial`, and `Trees`/`TreesMaterial`. Every mesh other than `TileBase` is omitted entirely when its layer had no data — treat them all as optional. `scene.userData.layers` lists exactly which meshes made it into a given export. When OSM colors are enabled, `BuildingsMaterial` is left white and per-vertex colors carry the palette, so recolor the geometry's `color` attribute rather than the material in that mode.

### Reproducing the rise animation

The in-app preview grows each building upward over 1.2 seconds with a smooth S-curve grow-in whenever a new tile appears. That animation is preview-only and is never baked into the GLB. Reproduce a close approximation in a plain Three.js scene by tweening the `Buildings` mesh's Y scale over the same 1.2 seconds:

```ts
import type { Object3D } from "three";

function reveal(mesh: Object3D | null | undefined, durationMs = 1200) {
  if (!mesh) return;
  const target = mesh;
  const start = performance.now();
  target.scale.y = 0.0001;

  function tick(now: number) {
    const t = Math.min((now - start) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    target.scale.y = eased;
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

reveal(gltf.scene.getObjectByName("Buildings"));
```

Public display of generated assets must visibly credit [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Attribution and source metadata are also embedded in the GLB scene extras.
