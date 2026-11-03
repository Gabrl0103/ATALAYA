import type { HistoryHotspot, HotspotHistory } from '../model/risk';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Never more days than the backend keeps (35), even if a range came wrong. */
const MAX_DAYS = 35;

/** Every day from `from` to `to` (both included), also those without heat spots. */
export function historyDays(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const count = Math.min(Math.round((end - start) / DAY_MS) + 1, MAX_DAYS);
  return Array.from({ length: count }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10));
}

/** One step of the replay: a day and its heat spots. */
export interface ReplayDay {
  readonly date: string;
  readonly hotspots: readonly HistoryHotspot[];
}

/** The days of the replay in order, each with its heat spots (none on a quiet day). */
export function replayDays(history: HotspotHistory): ReplayDay[] {
  const byDay = new Map<string, HistoryHotspot[]>();
  for (const hotspot of history.hotspots) byDay.set(hotspot.date, [...(byDay.get(hotspot.date) ?? []), hotspot]);
  return historyDays(history.from, history.to).map((date) => ({ date, hotspots: byDay.get(date) ?? [] }));
}

/** 1x: one day per second; 2x: two. */
export function stepMs(speed: 1 | 2): number {
  return 1000 / speed;
}
