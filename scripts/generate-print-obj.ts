// One-off: generate the print OBJs (map + tray) for a location without the
// browser (used when browser downloads are blocked).
// Run: npx vite-node scripts/generate-print-obj.ts
import "fake-indexeddb/auto";
import { writeFileSync } from "node:fs";

import { reducePalette } from "../src/domain/print-palette";
import { DEFAULT_THEME } from "../src/domain/theme";
import { exportObj, exportTrayObj } from "../src/export/export-obj";
import { generateTile } from "../src/geometry/generate-tile";
import { normalizeMapData } from "../src/osm/normalize";
import { fetchMapData } from "../src/osm/overpass";

// Overpass rejects requests without a browser-ish identity (406) when called
// from Node — add a User-Agent to every request.
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  originalFetch(input, {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), "User-Agent": "hexagon-map-tiles/0.1 (dev script)" },
  })) as typeof fetch;

const center = { latitude: 50.737667259070946, longitude: 7.098482097663432 };
const span = 250;

const raw = await fetchMapData(center, span);
const normalized = normalizeMapData(raw as Parameters<typeof normalizeMapData>[0]);
const tile = generateTile({ center, span }, normalized);
const palette = reducePalette(DEFAULT_THEME.colors, "filament");
const metadata = { center, span, sourceTimestamp: normalized.sourceTimestamp };
const map = exportObj(tile, palette.colors, metadata);
const tray = exportTrayObj(metadata, { color: palette.frame });

const stem = `${process.env.HOME}/Downloads/hex-tile-${center.latitude.toFixed(4)}-${center.longitude.toFixed(4)}-${span}m`;
writeFileSync(`${stem}-map.obj`, map);
writeFileSync(`${stem}-tray.obj`, tray);
console.log("geschrieben:", `${stem}-map.obj (${(map.length / 1024).toFixed(0)} KB)`);
console.log("geschrieben:", `${stem}-tray.obj (${(tray.length / 1024).toFixed(0)} KB)`);
