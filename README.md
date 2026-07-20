# Hexagon Map Tiles

Static browser app that converts an address or latitude/longitude into a clipped hexagonal 3D tile containing OpenStreetMap Building Massing, Road Surfaces, Water Surfaces, Green Surfaces, Path Surfaces, Rail Surfaces, and Trees — exported as a GLB (rendering) or a print-ready OBJ (3D printing), with every building, surface polygon, and tree as an individually named object.

## Features

- Address or `lat, lon` input, with client-side geocoding via Nominatim and map data via Overpass (both cached in IndexedDB).
- Buildings (with Building Part massing), roads, water, green spaces, paths, rail, and scattered/mapped trees, each independently toggleable.
- Three built-in themes (Sandstone, Daylight, Night) plus per-surface color overrides, and an optional "use OSM colors" mode that paints Buildings with real-world vertex colors instead of a flat theme color.
- A live Three.js preview with a rise-in reveal animation for buildings, matching the coordinate system and geometry of the downloaded GLB exactly — preview and export are built from the same generated buffers.
- Shareable URLs that round-trip location, span, theme, color overrides, layer toggles, and OSM-color mode.
- A triangle-budget guard (500,000 generated triangles) that aborts cleanly and asks you to reduce Tile Span, rather than silently simplifying geometry.
- A slicer-ready OBJ print export — fixed 1:2000 detail fidelity with a live model-size readout, printable minimum thicknesses enforced — where the tile base and every element are separate objects (see "Print a tile (OBJ export)").

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

Exports use meters, Y-up, `+X` east, and `-Z` north, with Tile Center at `(0, 0, 0)`. Up to eight named layer/material pairs are present: `TileBase`/`TileBaseMaterial` (always present, a single mesh), `Buildings`/`BuildingsMaterial`, `RoadSurfaces`/`RoadSurfaceMaterial`, `WaterSurfaces`/`WaterSurfaceMaterial`, `GreenSurfaces`/`GreenSurfaceMaterial`, `PathSurfaces`/`PathSurfaceMaterial`, `RailSurfaces`/`RailSurfaceMaterial`, and `Trees`/`TreesMaterial`. Every layer other than `TileBase` is a **group of individually named child meshes** — one mesh per element (`Building_way_123456`, `Road_001`, `Tree_042`, …) — all sharing that layer's material, so single elements can be selected, recolored, or moved on their own. A layer is omitted entirely when it had no data — treat them all as optional. `scene.userData.layers` lists exactly which layers made it into a given export. When OSM colors are enabled, `BuildingsMaterial` is left white and per-vertex colors carry the palette, so recolor the geometry's `color` attribute rather than the material in that mode. To restyle a whole layer, traverse the group and swap each child mesh's material (they share one instance, so assigning to the first child's material also works).

## Print a tile (OBJ export)

The "Download OBJ (print)" button produces **two** slicer-ready `.obj` files for two separate prints (the browser may ask once to allow both downloads):

- `…-map.obj` — the map: tile base plus **every element as a separate, named object** (each building carries its OSM id; each road/water/green/path/rail polygon and each tree is its own body). Palette colors are embedded as **per-vertex colors** on the `v` lines — Bambu Studio and OrcaSlicer read colored OBJs natively and offer per-color filament mapping; buildings click-marked red carry red vertex colors (and a `RED_` name prefix). PrusaSlicer and Cura ignore vertex colors and import the plain geometry.
- `…-tray.obj` — the brown display **tray** (`TileTray`): a hexagonal shell with a full floor under the model and a surrounding wall. Print it separately (e.g. in brown), then seat the printed map inside — it drops in with 0.25 mm of play per side and the wall rises a 1.5 mm lip above the map's base.

- Detail fidelity is fixed at **1:2000** (0.5 mm per real-world meter — a 2 m path prints 1 mm wide, comfortably above nozzle width), so the printed size grows with the Tile Span: ~157 mm at 250 m span, ~301 mm at 500 m. A live readout under the Tile Span slider shows the resulting model width and whether it fits a printer bed. Both files are millimeters, Z-up, resting on the build plate at `z = 0` — print as-is, no rescaling needed.
- The preview renders the assembled result — the map seated in its tray — true to the printed proportions.
- A **Print colors** control folds the palette to as many colors as the printer holds filaments: the fixed **Green · White · Blue · Red** kit (white plate and linework, red buildings, green nature, blue water; brown tray printed separately) or generic budgets (3/4/5/6/All) along curated groups. The reduced palette drives the preview, the legend, and both exports.
- Everything visible is printable: ground surfaces are thickened to at least 0.6 mm, buildings to at least 1 mm, and tree trunks to at least 1 mm diameter. Every element sits exactly on top of the base plate (never embedded into it), so the plate's layers slice in a single color and filament changes along Z are minimized.
- Because the scale is fixed, detail quality is identical at every Tile Span — only the printed footprint changes. Spans up to ~400 m fit a standard 256 mm bed; beyond ~550 m the model outgrows common printers.

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
