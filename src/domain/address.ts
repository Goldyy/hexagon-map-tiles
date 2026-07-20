// Address helpers for marked buildings: format a building's OSM addresses for
// the marked list, resolve a typed "street housenumber" query to the building
// parts it names, and locate the building part under a geocoded coordinate
// (the Nominatim fallback for addresses OSM has no local node/tag for).
// Matching is forgiving about case, spacing, and the German "Str."
// abbreviation, but requires a house number — a street alone would flood the
// marking.
import type { Coordinates } from "../domain/location";
import type { PartAddress, TilePart } from "../geometry/generate-tile";
import { pointInPolygon } from "../geometry/tree-scatter";

/** Human-readable address ("Rheinstraße 12"), or null when untagged. */
export function formatAddress(address: PartAddress | undefined): string | null {
  if (!address) return null;
  const text = [address.street, address.housenumber].filter(Boolean).join(" ").trim();
  return text.length > 0 ? text : null;
}

/** All of a part's addresses as one display label, or null when untagged. */
export function formatAddresses(addresses: readonly PartAddress[] | undefined): string | null {
  if (!addresses || addresses.length === 0) return null;
  const labels = addresses
    .map((address) => formatAddress(address))
    .filter((label): label is string => label !== null);
  return labels.length > 0 ? labels.join(" · ") : null;
}

function normalizeStreet(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/str\.?(?=\s|$)/g, "straße");
}

function normalizeHousenumber(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

/** Split "Rheinstraße 12a" into street and house number; null when either is missing. */
export function parseAddressQuery(query: string): { street: string; housenumber: string } | null {
  const match = query.trim().match(/^(.+?)[,\s]+(\d\S*(?:\s*[a-zA-Z])?)$/);
  if (!match) return null;
  const street = match[1].trim();
  const housenumber = match[2].trim();
  if (street.length === 0 || housenumber.length === 0) return null;
  return { street, housenumber };
}

/** All building parts one of whose tagged addresses matches the query. */
export function findBuildingsByAddress(parts: readonly TilePart[], query: string): TilePart[] {
  const parsed = parseAddressQuery(query);
  if (!parsed) return [];
  const street = normalizeStreet(parsed.street);
  const housenumber = normalizeHousenumber(parsed.housenumber);
  return parts.filter((part) =>
    (part.addresses ?? []).some(
      (address) =>
        address.street !== undefined &&
        address.housenumber !== undefined &&
        normalizeStreet(address.street) === street &&
        normalizeHousenumber(address.housenumber) === housenumber,
    ),
  );
}

const EARTH_RADIUS_METERS = 6_378_137;

/**
 * All building parts whose footprint contains the given coordinate — the
 * geocoder fallback: project the hit the same way the tile was projected,
 * then point-test the stored footprints.
 */
export function findBuildingsAtCoordinate(
  parts: readonly TilePart[],
  center: Coordinates,
  hit: Coordinates,
): TilePart[] {
  const radians = Math.PI / 180;
  const point: [number, number] = [
    (hit.longitude - center.longitude) * radians * EARTH_RADIUS_METERS * Math.cos(center.latitude * radians),
    (hit.latitude - center.latitude) * radians * EARTH_RADIUS_METERS,
  ];
  return parts.filter((part) => part.footprint && pointInPolygon(point, part.footprint));
}
