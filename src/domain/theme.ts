import type { TileColors } from "@/export/export-glb";

/**
 * Non-geometry appearance of the preview scene for a theme: the sky gradient,
 * fog colour, and light intensities. Task 9 consumes `skyTop`/`skyBottom` in a
 * gradient shader; this task only feeds `fog`/`ambientIntensity`/
 * `directionalIntensity` into the existing preview JSX.
 */
export interface PreviewEnvironment {
  skyTop: string;
  skyBottom: string;
  fog: string;
  ambientIntensity: number;
  directionalIntensity: number;
}

export interface Theme {
  id: string;
  label: string;
  colors: TileColors;
  environment: PreviewEnvironment;
}

export const THEMES: readonly Theme[] = [
  {
    id: "sandstone",
    label: "Sandstone",
    colors: {
      base: "#d8c7a5",
      buildings: "#b3a389",
      roads: "#777267",
      water: "#4f8796",
      green: "#9fae7e",
      paths: "#cfc3a4",
      rail: "#8f8577",
      trees: "#6f8f5a",
    },
    environment: {
      skyTop: "#f2ead9",
      skyBottom: "#e8dfce",
      fog: "#e8dfce",
      ambientIntensity: 1.45,
      directionalIntensity: 2.2,
    },
  },
  {
    id: "daylight",
    label: "Daylight",
    colors: {
      base: "#e2ded6",
      buildings: "#f7f4ed",
      roads: "#fdfdfb",
      water: "#9dc2e6",
      green: "#c1e0b2",
      paths: "#efe9dd",
      rail: "#c9c4bb",
      trees: "#7bb26a",
    },
    environment: {
      skyTop: "#dfeaf5",
      skyBottom: "#f5f2ec",
      fog: "#eef1f0",
      ambientIntensity: 1.6,
      directionalIntensity: 1.8,
    },
  },
  {
    id: "night",
    label: "Night",
    colors: {
      base: "#2e3138",
      buildings: "#4a4f5a",
      roads: "#6b7280",
      water: "#1f3a52",
      green: "#31473a",
      paths: "#4b5563",
      rail: "#3d4148",
      trees: "#2f4d3a",
    },
    environment: {
      skyTop: "#1a2130",
      skyBottom: "#232936",
      fog: "#232936",
      ambientIntensity: 0.9,
      directionalIntensity: 1.2,
    },
  },
];

export const DEFAULT_THEME: Theme = THEMES[0];

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
}
