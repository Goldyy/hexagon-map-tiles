export type RoadWidthSource = "explicit" | "lanes" | "fallback";

export interface RoadWidth {
  width: number;
  source: RoadWidthSource;
}

const FALLBACK_WIDTHS: Record<string, number> = {
  motorway: 12,
  trunk: 10,
  primary: 9,
  secondary: 8,
  tertiary: 7,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 4,
  pedestrian: 4,
};

export function parseMappedWidth(value: string | undefined): number {
  if (!value || value.includes(";")) return Number.NaN;
  const imperial = value.trim().match(/^(\d+(?:\.\d+)?)'(\d+(?:\.\d+)?)?"?$/);
  if (imperial) {
    const feet = Number(imperial[1]);
    const inches = Number(imperial[2] ?? 0);
    return Math.round((feet * 0.3048 + inches * 0.0254) * 1_000_000) / 1_000_000;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return /(?:ft|feet)\s*$/i.test(value) ? parsed * 0.3048 : parsed;
}

export function resolveRoadWidth(tags: Record<string, string>): RoadWidth {
  const width = parseMappedWidth(tags.width);
  if (Number.isFinite(width) && width > 0) return { width, source: "explicit" };
  const lanes = Number.parseFloat(tags.lanes ?? "");
  if (Number.isFinite(lanes) && lanes > 0) return { width: lanes * 3.25, source: "lanes" };
  return { width: FALLBACK_WIDTHS[tags.highway] ?? 4, source: "fallback" };
}
