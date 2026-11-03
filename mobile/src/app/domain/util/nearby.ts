import type { Hotspot, ZoneBoundaries, ZoneRiskSummary } from '../model/risk';
import { bearingDegrees, cardinal, distanceKm, nearestZone, zoneAt, type Cardinal } from './geo';

/** Farther than this, a heat spot is not «near»: the card says there is none instead. */
export const NEARBY_HOTSPOT_MAX_KM = 100;

/**
 * Where the person is with respect to the municipalities: inside one ('inside'), outside every boundary
 * ('outside', so the closest seat is given), or not known because the boundaries did not load ('nearest').
 */
export type NearbyPlace = 'inside' | 'outside' | 'nearest';

export interface NearbyHotspot {
  readonly hotspot: Hotspot;
  readonly km: number;
  readonly direction: Cardinal;
}

export interface NearbySummary {
  readonly latitude: number;
  readonly longitude: number;
  readonly zone: ZoneRiskSummary;
  readonly place: NearbyPlace;
  /** From the person to the municipal seat. */
  readonly zoneKm: number;
  /** The closest heat spot of the list (the last 5 days) within NEARBY_HOTSPOT_MAX_KM; null if none. */
  readonly hotspot: NearbyHotspot | null;
}

/** «Cerca de mí», all on the phone: the municipality of the point and the closest recent heat spot. */
export function nearbySummary(
  latitude: number,
  longitude: number,
  zones: readonly ZoneRiskSummary[],
  hotspots: readonly Hotspot[],
  boundaries: ZoneBoundaries | null,
): NearbySummary | null {
  const containing = boundaries ? zoneAt(boundaries, latitude, longitude) : null;
  const inside = containing ? zones.find((zone) => zone.id === containing) : undefined;
  const zone = inside ?? nearestZone(zones, latitude, longitude);
  if (!zone) return null;
  const place: NearbyPlace = inside ? 'inside' : boundaries ? 'outside' : 'nearest';

  let closest: NearbyHotspot | null = null;
  for (const hotspot of hotspots) {
    const km = distanceKm(latitude, longitude, hotspot.latitude, hotspot.longitude);
    if (km > NEARBY_HOTSPOT_MAX_KM || (closest && km >= closest.km)) continue;
    closest = { hotspot, km, direction: cardinal(bearingDegrees(latitude, longitude, hotspot.latitude, hotspot.longitude)) };
  }
  return {
    latitude,
    longitude,
    zone,
    place,
    zoneKm: distanceKm(latitude, longitude, zone.latitude, zone.longitude),
    hotspot: closest,
  };
}
