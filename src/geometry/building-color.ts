import { Color } from "three";

/**
 * Resolved OSM colour tags for a single building. Each channel triple is in the
 * renderer's working (linear-sRGB) colour space — the form a Three.js `color`
 * BufferAttribute is consumed in with `vertexColors`, and the form glTF's
 * COLOR_0 accessor expects, so the value flows straight through to preview and
 * GLB export without a further conversion. `null` means the tag was absent or
 * invalid (invalid tags are treated as absent, never fatal).
 */
export interface BuildingColors {
  wall: [number, number, number] | null;
  roof: [number, number, number] | null;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parse an OSM colour value into a linear RGB triple, or `null` when it is not
 * a recognised `#rgb`/`#rrggbb` hex string or a CSS named colour from three's
 * `Color.NAMES` table. `new Color(...)` performs the sRGB→linear conversion.
 */
export function parseOsmColor(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (HEX_PATTERN.test(trimmed)) {
    return new Color(trimmed).toArray() as [number, number, number];
  }

  const named = Color.NAMES[trimmed.toLowerCase() as keyof typeof Color.NAMES];
  if (named !== undefined) {
    return new Color(named).toArray() as [number, number, number];
  }

  return null;
}

/**
 * Resolve the wall colour (`building:colour`) and roof colour (`roof:colour`)
 * from a building's tags. Each is `null` when the tag is absent or invalid.
 */
export function resolveBuildingColors(tags: Record<string, string>): BuildingColors {
  return {
    wall: parseOsmColor(tags["building:colour"]),
    roof: parseOsmColor(tags["roof:colour"]),
  };
}
