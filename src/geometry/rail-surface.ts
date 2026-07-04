import { parseMappedWidth } from "./road-surface";

export type RailWidthSource = "explicit" | "fallback";

export interface RailWidth {
  width: number;
  source: RailWidthSource;
}

const FALLBACK_WIDTHS: Record<string, number> = {
  rail: 4,
  tram: 3,
  light_rail: 3.5,
};

export function resolveRailWidth(tags: Record<string, string>): RailWidth {
  const width = parseMappedWidth(tags.width);
  if (Number.isFinite(width) && width > 0) return { width, source: "explicit" };
  return { width: FALLBACK_WIDTHS[tags.railway] ?? 3.5, source: "fallback" };
}
