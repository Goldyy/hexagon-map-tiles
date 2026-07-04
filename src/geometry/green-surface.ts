export type GreenKind = "park" | "grass" | "forest" | "scrub";

const LEISURE_KINDS: Record<string, GreenKind> = {
  park: "park",
};

const LANDUSE_KINDS: Record<string, GreenKind> = {
  grass: "grass",
  meadow: "grass",
  village_green: "grass",
  recreation_ground: "grass",
  forest: "forest",
};

const NATURAL_KINDS: Record<string, GreenKind> = {
  wood: "forest",
  scrub: "scrub",
  grassland: "scrub",
};

export function resolveGreenKind(tags: Record<string, string>): GreenKind | null {
  const leisure = LEISURE_KINDS[tags.leisure];
  if (leisure) return leisure;
  const landuse = LANDUSE_KINDS[tags.landuse];
  if (landuse) return landuse;
  const natural = NATURAL_KINDS[tags.natural];
  if (natural) return natural;
  return null;
}
