import { translate, type Language, type MessageKey } from '../../i18n/translate';
import type { RiskLevel, ZoneForecast } from '../model/risk';
import { formatDateTime, percentLabel } from './format';
import { riskLabel } from './risk-labels';

/** Day at whose end each forecast row starts its 72 h (as «Pronóstico 72 h» says it). */
const WHEN: Record<24 | 48 | 72, MessageKey> = { 24: 'when.today', 48: 'when.tomorrow', 72: 'when.dayAfter' };

export interface ShareableZone {
  readonly name: string;
  readonly score: number;
  readonly level: RiskLevel;
}

/**
 * What «Compartir» sends for a zone, in the language of the app, with the data on screen right now.
 * The 72 h rows go only when the model answered (not its fallback, not while loading or after a
 * failure). Nothing about the user nor links to the API.
 */
export function shareText(
  zone: ShareableZone,
  forecast: ZoneForecast | null,
  updatedAt: Date | null,
  language: Language = 'es',
): string {
  const t = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => translate(language, key, params);
  const lines = [t('share.risk', { name: zone.name, level: riskLabel(zone.level, language), score: zone.score })];
  if (forecast?.source === 'model' && forecast.horizons.length > 0) {
    lines.push(t('share.forecast'));
    for (const horizon of forecast.horizons) {
      const level = riskLabel(horizon.level, language);
      lines.push(t('share.row', { hours: horizon.hours, when: t(WHEN[horizon.hours]), level, percent: percentLabel(horizon.probability, language) }));
    }
  }
  if (updatedAt) lines.push(t('share.updated', { date: formatDateTime(updatedAt, language) }));
  lines.push('', t('share.signature'));
  return lines.join('\n');
}
