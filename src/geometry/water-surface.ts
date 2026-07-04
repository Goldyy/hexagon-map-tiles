import { parseMappedWidth } from "./road-surface";

export type WaterWidthSource = "explicit" | "fallback";

export interface WaterWidth {
  width: number;
  source: WaterWidthSource;
}

const FALLBACK_WIDTHS: Record<string, number> = {
  river: 8,
  canal: 6,
  stream: 2,
};

export function resolveWaterWidth(tags: Record<string, string>): WaterWidth {
  const width = parseMappedWidth(tags.width);
  if (Number.isFinite(width) && width > 0) return { width, source: "explicit" };
  return { width: FALLBACK_WIDTHS[tags.waterway] ?? 2, source: "fallback" };
}
