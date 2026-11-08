import { translate, type Language, type MessageKey } from '../../i18n/translate';
import type { ZoneBoundaries, ZoneRiskSummary } from '../model/risk';
import { nearbySummary, type NearbyPlace } from './nearby';

/** Where the person said they are, only after they tapped to share it. */
export interface EmergencyPosition {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * The municipality of the report: the one of the position (inside it, outside Nariño near it, or the
 * closest when the boundaries did not load) or, without a position, the zone the person was viewing.
 */
export interface EmergencyPlace {
  readonly name: string;
  readonly place: NearbyPlace | 'viewed';
}

export interface EmergencyReport {
  /** null when the location could not be read (the text says it is not available). */
  readonly position: EmergencyPosition | null;
  readonly place: EmergencyPlace | null;
}

const PLACE_KEYS: Record<EmergencyPlace['place'], MessageKey> = {
  inside: 'emergency.share.inside',
  outside: 'emergency.share.outside',
  nearest: 'emergency.share.nearest',
  viewed: 'emergency.share.viewed',
};

/** Degrees with 5 decimals (about 1 m) and a dot in both languages, so the link and a dispatcher read it alike. */
const coordinate = (degrees: number): string => degrees.toFixed(5);

/** A map anyone can open, with a pin on the point (OpenStreetMap, the same map the app uses). */
export function mapLink(position: EmergencyPosition): string {
  const lat = coordinate(position.latitude);
  const lon = coordinate(position.longitude);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

/** The municipality of a position, from the zones and boundaries the app already has (null without zones). */
export function placeOf(
  position: EmergencyPosition,
  zones: readonly ZoneRiskSummary[],
  boundaries: ZoneBoundaries | null,
): EmergencyPlace | null {
  const summary = nearbySummary(position.latitude, position.longitude, zones, [], boundaries);
  return summary ? { name: summary.zone.name, place: summary.place } : null;
}

/**
 * What «Compartir mi ubicación» sends, in the language of the app: the municipality, the coordinates and a
 * map link, or that the location is not available. Nothing about the person and no link to the API.
 */
export function emergencyText(report: EmergencyReport, language: Language = 'es'): string {
  const t = (key: MessageKey, params?: Readonly<Record<string, string>>) => translate(language, key, params);
  const lines = [t('emergency.share.heading')];
  if (report.place) lines.push(t(PLACE_KEYS[report.place.place], { name: report.place.name }));
  if (report.position) {
    const { latitude, longitude } = report.position;
    lines.push(t('emergency.share.coordinates', { latitude: coordinate(latitude), longitude: coordinate(longitude) }));
    lines.push(t('emergency.share.map', { url: mapLink(report.position) }));
  } else {
    lines.push(t('emergency.share.noLocation'));
  }
  lines.push('', t('share.signature'));
  return lines.join('\n');
}
