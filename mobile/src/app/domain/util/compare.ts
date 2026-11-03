import type { Language } from '../../i18n/translate';
import type { RiskLevel, ZoneDetail, ZoneForecast, ZoneRiskSummary } from '../model/risk';
import type { TemperatureUnit, WindUnit } from '../../state/settings.store';
import { formatPercent, percentLabel } from './format';
import { formatTemperature, formatWind } from './units';

/** What a cell of the comparison says when the data did not arrive: never a made-up value. */
export const MISSING = '—';

const LEVEL_RANK: Readonly<Record<RiskLevel, number>> = { low: 0, medium: 1, high: 2, extreme: 3 };

/** The forecast of a zone as the comparison has it: still loading, the model's answer, or nothing usable. */
export type CompareForecast = { readonly status: 'loading' } | { readonly status: 'ready'; readonly forecast: ZoneForecast } | { readonly status: 'error' };

export interface CompareCell {
  /** The text shown, or MISSING. */
  readonly text: string;
  /** Number compared for the highlight; null when missing. */
  readonly value: number | null;
  readonly riskiest: boolean;
  /** Still on its way (a skeleton instead of «—»). */
  readonly loading: boolean;
}

export type CompareRowId =
  | 'level' | 'score' | 'h24' | 'h48' | 'h72'
  | 'temperature' | 'humidity' | 'wind' | 'dryDays'
  | 'dryWeather' | 'nearbyHotspots' | 'fireHistory';

export interface CompareRow {
  readonly id: CompareRowId;
  readonly cells: readonly CompareCell[];
}

export interface CompareUnits {
  readonly temperature: TemperatureUnit;
  readonly wind: WindUnit;
  readonly language: Language;
}

/**
 * Which cells hold the highest risk of the row: the largest value (or the smallest, for humidity). None
 * when fewer than two values arrived or the top is shared: there is nothing to tell apart.
 */
export function riskiest(values: readonly (number | null)[], higherIsRiskier = true): boolean[] {
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return values.map(() => false);
  const top = higherIsRiskier ? Math.max(...known) : Math.min(...known);
  const winners = known.filter((value) => value === top).length;
  return values.map((value) => winners === 1 && value === top);
}

type Cell = { readonly text: string; readonly value: number | null; readonly loading?: boolean };
const missing: Cell = { text: MISSING, value: null };
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function row(id: CompareRowId, cells: readonly Cell[], higherIsRiskier = true): CompareRow {
  const flags = riskiest(cells.map((cell) => cell.value), higherIsRiskier);
  return { id, cells: cells.map((cell, i) => ({ text: cell.text, value: cell.value, riskiest: flags[i]!, loading: cell.loading ?? false })) };
}

/** The probability of one horizon: only when the model answered; the fallback has none. */
function horizonCell(forecast: CompareForecast | undefined, hours: 24 | 48 | 72, language: Language): Cell {
  if (!forecast || forecast.status === 'loading') return { text: '', value: null, loading: true };
  if (forecast.status === 'error' || forecast.forecast.source !== 'model') return missing;
  const horizon = forecast.forecast.horizons.find((h) => h.hours === hours);
  return horizon ? { text: percentLabel(horizon.probability, language), value: horizon.probability } : missing;
}

/**
 * The rows of «Comparar», one cell per zone in the order given: current risk, the 72 h forecast, the
 * weather now (in the units of Ajustes) and the three factors. What a zone lacks is MISSING.
 */
export function compareRows(
  zones: readonly ZoneRiskSummary[],
  forecasts: Readonly<Record<string, CompareForecast>>,
  units: CompareUnits,
): CompareRow[] {
  const { language } = units;
  const weather = (zone: ZoneRiskSummary): Partial<ZoneDetail['weather']> => zone.weather ?? {};
  const factor = (value: number | undefined): Cell => (isNumber(value) ? { text: String(Math.round(value)), value } : missing);
  return [
    row('level', zones.map((zone) => ({ text: zone.level, value: LEVEL_RANK[zone.level] }))),
    row('score', zones.map((zone) => ({ text: String(zone.score), value: zone.score }))),
    ...([24, 48, 72] as const).map((hours) =>
      row(`h${hours}`, zones.map((zone) => horizonCell(forecasts[zone.id], hours, language))),
    ),
    row('temperature', zones.map((zone) => {
      const value = weather(zone).temperatureC;
      return isNumber(value) ? { text: formatTemperature(value, units.temperature, language), value } : missing;
    })),
    row('humidity', zones.map((zone) => {
      const value = weather(zone).humidityPct;
      return isNumber(value) ? { text: formatPercent(Math.round(value), language), value } : missing;
    }), false),
    row('wind', zones.map((zone) => {
      const value = weather(zone).windKmh;
      return isNumber(value) ? { text: formatWind(value, units.wind, language), value } : missing;
    })),
    row('dryDays', zones.map((zone) => {
      const value = weather(zone).daysWithoutRain;
      return isNumber(value) ? { text: String(Math.round(value)), value } : missing;
    })),
    row('dryWeather', zones.map((zone) => factor(zone.factors?.dryWeather))),
    row('nearbyHotspots', zones.map((zone) => factor(zone.factors?.nearbyHotspots))),
    row('fireHistory', zones.map((zone) => factor(zone.factors?.fireHistory))),
  ];
}
