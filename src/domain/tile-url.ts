import type { Coordinates } from "@/domain/location";
import { themeById } from "@/domain/theme";
import type { TileColors } from "@/export/export-glb";
import type { LayerToggles } from "@/geometry/generate-tile";

/**
 * The parsed contents of a share URL. `overrides` holds only the colours that
 * differ from the selected theme (a v1 URL, which carries no `theme`, parses as
 * sandstone with its raw colour params as overrides). `layers` is fully
 * resolved: an absent `layers` param means every layer is enabled.
 */
export interface TileUrlConfig {
  center: Coordinates;
  span: number;
  themeId: string;
  overrides: Partial<TileColors>;
  layers: LayerToggles;
  useOsmColors: boolean;
}

// TileColors key ↔ URL param name. v1 names (base/buildings/roads/water) are
// preserved exactly; the enrichment surfaces reuse their own key as the name.
const COLOR_KEYS: readonly (keyof TileColors)[] = [
  "base",
  "buildings",
  "roads",
  "water",
  "green",
  "paths",
  "rail",
  "trees",
];

// LayerToggles key ↔ its `layers` CSV token, in serialization order.
const LAYER_TOKENS: readonly [keyof LayerToggles, string][] = [
  ["green", "green"],
  ["pathsRail", "pathsrail"],
  ["trees", "trees"],
];

export function parseTileUrl(search: string): TileUrlConfig | null {
  const query = new URLSearchParams(search);
  const latitude = Number(query.get("lat"));
  const longitude = Number(query.get("lon"));
  const span = Number(query.get("span"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(span) || span < 100 || span > 2_000) {
    return null;
  }

  const theme = themeById(query.get("theme"));

  const overrides: Partial<TileColors> = {};
  for (const key of COLOR_KEYS) {
    const value = query.get(key);
    if (value && value !== theme.colors[key]) overrides[key] = value;
  }

  const layersParam = query.get("layers");
  let layers: LayerToggles;
  if (layersParam === null) {
    layers = { green: true, pathsRail: true, trees: true };
  } else {
    const enabled = new Set(layersParam.split(",").filter(Boolean));
    layers = {
      green: enabled.has("green"),
      pathsRail: enabled.has("pathsrail"),
      trees: enabled.has("trees"),
    };
  }

  return {
    center: { latitude, longitude },
    span,
    themeId: theme.id,
    overrides,
    layers,
    useOsmColors: query.get("osmcolors") === "1",
  };
}

export function serializeTileUrl(config: TileUrlConfig): string {
  const theme = themeById(config.themeId);
  const query = new URLSearchParams();
  query.set("lat", config.center.latitude.toFixed(6));
  query.set("lon", config.center.longitude.toFixed(6));
  query.set("span", String(config.span));

  if (theme.id !== "sandstone") query.set("theme", theme.id);

  for (const key of COLOR_KEYS) {
    const value = config.overrides[key];
    if (value && value !== theme.colors[key]) query.set(key, value);
  }

  const enabledTokens = LAYER_TOKENS.filter(([key]) => config.layers[key]).map(([, token]) => token);
  if (enabledTokens.length < LAYER_TOKENS.length) query.set("layers", enabledTokens.join(","));

  if (config.useOsmColors) query.set("osmcolors", "1");

  return `?${query}`;
}
