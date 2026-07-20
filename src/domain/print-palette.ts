// Filament-budget palette: a printer only holds a few filaments, so the user
// picks how many colors the model may use. Layers are then folded into that
// many slots along curated groupings (kept semantic — ground tones together,
// greens together — rather than by color distance, which pairs badly at small
// budgets). Each slot renders in its first-listed layer's theme color. The
// reduced palette drives the preview AND both exports, so what you see is
// what the slicer gets. Red click-marks are deliberately not part of the
// budget — they are an explicit extra filament.
import type { TileColors } from "../export/export-glb";

/** Display-tray color (brown) — printed separately from the map. */
export const FRAME_COLOR = "#7a4a21";

/**
 * How many filament colors the model may use. "all" = no folding;
 * "filament" = the owner's fixed green/white/blue kit (red stays the
 * click-mark extra, brown stays the separately printed tray).
 */
export type ColorSlotCount = 3 | 4 | 5 | 6 | "filament" | "all";

export const COLOR_SLOT_OPTIONS: readonly ColorSlotCount[] = [3, 4, 5, 6, "all"];

// The fixed filament kit: the base plate and linework are white, buildings
// get the kit's red as their own tone, nature is green, water blue.
const FILAMENT_WHITE = "#ffffff";
const FILAMENT_GREEN = "#3d8a40";
const FILAMENT_BLUE = "#2d6fb0";
const FILAMENT_RED = "#c2311f";

export interface PrintPalette {
  colors: TileColors;
  frame: string;
}

type PaletteKey = keyof TileColors;

// Slot groupings per budget; the first key of each group donates its color.
// The budget counts MODEL colors only — the tray is a separately printed
// brown part, so brown never appears inside the map itself.
const GROUPS: Record<Exclude<ColorSlotCount, "all" | "filament">, PaletteKey[][]> = {
  3: [
    ["base", "buildings", "paths"],
    ["roads", "rail"],
    ["green", "trees", "water"],
  ],
  4: [
    ["base", "paths"],
    ["buildings"],
    ["roads", "rail"],
    ["green", "trees", "water"],
  ],
  5: [
    ["base", "paths"],
    ["buildings"],
    ["roads", "rail"],
    ["green", "trees"],
    ["water"],
  ],
  6: [
    ["base"],
    ["buildings"],
    ["paths"],
    ["roads", "rail"],
    ["green", "trees"],
    ["water"],
  ],
};

export function reducePalette(colors: TileColors, slots: ColorSlotCount): PrintPalette {
  if (slots === "all") return { colors, frame: FRAME_COLOR };
  if (slots === "filament") {
    return {
      colors: {
        base: FILAMENT_WHITE,
        buildings: FILAMENT_RED,
        roads: FILAMENT_WHITE,
        paths: FILAMENT_WHITE,
        rail: FILAMENT_WHITE,
        green: FILAMENT_GREEN,
        trees: FILAMENT_GREEN,
        water: FILAMENT_BLUE,
      },
      frame: FRAME_COLOR,
    };
  }
  const reduced = { ...colors };
  for (const group of GROUPS[slots]) {
    const slotColor = colors[group[0]];
    for (const key of group) reduced[key] = slotColor;
  }
  return { colors: reduced, frame: FRAME_COLOR };
}
