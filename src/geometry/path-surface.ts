import { parseMappedWidth } from "./road-surface";

export type PathWidthSource = "explicit" | "fallback";

export interface PathWidth {
  width: number;
  source: PathWidthSource;
}

const FALLBACK_WIDTHS: Record<string, number> = {
  footway: 2,
  cycleway: 2.5,
  path: 1.5,
  steps: 2,
};

export function resolvePathWidth(tags: Record<string, string>): PathWidth {
  const width = parseMappedWidth(tags.width);
  if (Number.isFinite(width) && width > 0) return { width, source: "explicit" };
  return { width: FALLBACK_WIDTHS[tags.highway] ?? 2, source: "fallback" };
}
