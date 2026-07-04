export type HeightSource = "explicit" | "levels" | "fallback";

export interface HeightResult {
  height: number;
  minHeight: number;
  source: HeightSource;
}

function parseLength(value: string | undefined): number {
  if (!value || value.includes(";")) return Number.NaN;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith("ft") || normalized.endsWith("feet") || normalized.endsWith("'")) {
    return Math.round(parsed * 0.3048 * 1_000_000) / 1_000_000;
  }
  return parsed;
}

export function resolveBuildingHeight(tags: Record<string, string>): HeightResult {
  const explicit = parseLength(tags.height);
  const levels = Number.parseFloat(tags["building:levels"] ?? "");
  const minHeight = parseLength(tags.min_height);
  const minLevels = Number.parseFloat(tags["building:min_level"] ?? "");
  const resolvedMinHeight =
    Number.isFinite(minHeight) && minHeight >= 0
      ? minHeight
      : Number.isFinite(minLevels) && minLevels >= 0
        ? minLevels * 3
        : 0;

  if (Number.isFinite(explicit) && explicit > 0) {
    return { height: explicit, minHeight: resolvedMinHeight, source: "explicit" };
  }
  if (Number.isFinite(levels) && levels > 0) {
    return { height: levels * 3, minHeight: resolvedMinHeight, source: "levels" };
  }

  return {
    height: 9,
    minHeight: resolvedMinHeight,
    source: "fallback",
  };
}
