import type { ZoneBoundaries, ZoneRiskSummary } from '../model/risk';

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function distanceKm(latA: number, lonA: number, latB: number, lonB: number): number {
  const dLat = toRadians(latB - latA);
  const dLon = toRadians(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function nearestZone(
  zones: readonly ZoneRiskSummary[],
  latitude: number,
  longitude: number,
): ZoneRiskSummary | undefined {
  let best: ZoneRiskSummary | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const distance = distanceKm(latitude, longitude, zone.latitude, zone.longitude);
    if (distance < bestDistance) {
      best = zone;
      bestDistance = distance;
    }
  }
  return best;
}

/** Initial bearing (0–360°, 0 = north, clockwise) from A to B along the great circle. */
export function bearingDegrees(latA: number, lonA: number, latB: number, lonB: number): number {
  const phiA = toRadians(latA);
  const phiB = toRadians(latB);
  const dLon = toRadians(lonB - lonA);
  const y = Math.sin(dLon) * Math.cos(phiB);
  const x = Math.cos(phiA) * Math.sin(phiB) - Math.sin(phiA) * Math.cos(phiB) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type Cardinal = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
const CARDINALS: readonly Cardinal[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** One of 8 directions, each 45° wide and centered on its own: 22.5° is already «noreste». */
export function cardinal(bearing: number): Cardinal {
  return CARDINALS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!;
}

type Ring = readonly (readonly number[])[];

/** Ray casting on [longitude, latitude] pairs: the boundaries are small enough for a flat test. */
function insideRing(ring: Ring, longitude: number, latitude: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside its holes. */
function insidePolygon(rings: readonly Ring[], longitude: number, latitude: number): boolean {
  const [outer, ...holes] = rings;
  return !!outer && insideRing(outer, longitude, latitude) && !holes.some((hole) => insideRing(hole, longitude, latitude));
}

/** Id of the municipality whose boundary holds the point; null outside every one (outside Nariño). */
export function zoneAt(boundaries: ZoneBoundaries, latitude: number, longitude: number): string | null {
  for (const feature of boundaries.features) {
    const { geometry } = feature;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (polygons.some((rings) => insidePolygon(rings, longitude, latitude))) return feature.properties.id;
  }
  return null;
}
