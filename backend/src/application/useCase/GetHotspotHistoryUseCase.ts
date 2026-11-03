import { ValidationError } from '../../domain/error/DomainErrors.js';
import { FORECAST_HISTORY_DAYS } from '../../domain/model/DailyWeather.js';
import type { HotspotDetection, RawDetection } from '../../domain/model/Hotspot.js';
import type { HotspotDetectionRepository } from '../../domain/port/Repositories.js';
import { addDays, localDate } from '../../domain/service/forecastFeatures.js';
import { dedupeAcrossSatellites } from '../../domain/service/hotspotDedup.js';
import { LOCAL_UTC_OFFSET_HOURS } from './IngestDailyWeatherUseCase.js';

/** hotspot_detection keeps this many days: the longest range the app may ask for. */
export const HOTSPOT_HISTORY_MAX_DAYS = FORECAST_HISTORY_DAYS;
/** FIRMS is fetched every 3 hours: the same range is answered from memory for this long. */
export const HOTSPOT_HISTORY_CACHE_MS = 10 * 60_000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 60 * 60 * 1000;

/** One heat spot of the replay: where, which local day (Colombia) and which satellite saw it. */
export interface HistoryHotspot {
  readonly latitude: number;
  readonly longitude: number;
  readonly date: string;
  /** "SNPP", "NOAA20" or "NOAA21" (the FIRMS source without "VIIRS_" and "_NRT"). */
  readonly satellite: string;
}

export interface HotspotHistory {
  readonly from: string;
  readonly to: string;
  readonly hotspots: readonly HistoryHotspot[];
}

function validDay(value: string, name: string): string {
  const time = Date.parse(`${value}T00:00:00Z`);
  // 2026-13-01 does not parse; 2026-02-30 parses as 2 March: both are rejected.
  if (!DAY.test(value) || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${name} must be a date YYYY-MM-DD`);
  }
  return value;
}

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * HOUR_MS)) + 1;

/** `from` and `to` (local days, both included); by default the last HOTSPOT_HISTORY_MAX_DAYS up to today. */
export function resolveHistoryRange(from: string | undefined, to: string | undefined, now: Date): { from: string; to: string } {
  const today = localDate(now.toISOString(), LOCAL_UTC_OFFSET_HOURS);
  const end = to === undefined ? today : validDay(to, 'to');
  const start = from === undefined ? addDays(end, -(HOTSPOT_HISTORY_MAX_DAYS - 1)) : validDay(from, 'from');
  if (end > today) throw new ValidationError('to cannot be after today');
  if (start > end) throw new ValidationError('from must not be after to');
  if (daysBetween(start, end) > HOTSPOT_HISTORY_MAX_DAYS) {
    throw new ValidationError(`The range can be at most ${HOTSPOT_HISTORY_MAX_DAYS} days`);
  }
  return { from: start, to: end };
}

const satelliteOf = (source: string): string => source.replace(/^VIIRS_/, '').replace(/_(NRT|SP)$/, '');

/**
 * The heat spots of each local day of the range, for the map's replay. A fire seen by several satellites
 * counts once, as on the map (dedupeAcrossSatellites, within each day). The raw table keeps no confidence
 * nor FRP, so between duplicates the earliest detection stays.
 */
export class GetHotspotHistoryUseCase {
  private readonly cache = new Map<string, { readonly at: number; readonly value: Promise<HotspotHistory> }>();

  constructor(
    private readonly detections: HotspotDetectionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  execute(from?: string, to?: string): Promise<HotspotHistory> {
    const range = resolveHistoryRange(from, to, this.now());
    const key = `${range.from}|${range.to}`;
    const at = this.now().getTime();
    const cached = this.cache.get(key);
    if (cached && at - cached.at < HOTSPOT_HISTORY_CACHE_MS) return cached.value;
    for (const [other, entry] of this.cache) if (at - entry.at >= HOTSPOT_HISTORY_CACHE_MS) this.cache.delete(other);
    const value = this.load(range);
    this.cache.set(key, { at, value });
    value.catch(() => this.cache.delete(key)); // a failure is asked again next time
    return value;
  }

  private async load(range: { from: string; to: string }): Promise<HotspotHistory> {
    // Local midnight of `from`, in UTC (Colombia is UTC-5 all year).
    const since = new Date(Date.parse(`${range.from}T00:00:00Z`) - LOCAL_UTC_OFFSET_HOURS * HOUR_MS).toISOString();
    const byDay = new Map<string, RawDetection[]>();
    for (const detection of await this.detections.findSince(since)) {
      const date = localDate(detection.detectedAt, LOCAL_UTC_OFFSET_HOURS);
      if (date < range.from || date > range.to) continue;
      byDay.set(date, [...(byDay.get(date) ?? []), detection]);
    }
    const hotspots = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([date, day]) =>
        dedupeAcrossSatellites(day.map((d): HotspotDetection => ({ ...d, confidence: 'nominal' }))).map((d) => ({
          latitude: d.latitude,
          longitude: d.longitude,
          date,
          satellite: satelliteOf(d.source),
        })),
      );
    return { ...range, hotspots };
  }
}
