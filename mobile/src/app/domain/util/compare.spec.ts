import type { ZoneForecast, ZoneRiskSummary } from '../model/risk';
import { MISSING, compareRows, riskiest, type CompareForecast } from './compare';

const PASTO: ZoneRiskSummary = {
  id: 'pasto',
  name: 'Pasto',
  latitude: 1.21,
  longitude: -77.28,
  score: 42,
  level: 'medium',
  factors: { dryWeather: 40, nearbyHotspots: 20, fireHistory: 60 },
  weather: { temperatureC: 14, humidityPct: 80, windKmh: 9, daysWithoutRain: 2 },
};
/** An older backend: no weather nor factors in the list. */
const TUMACO: ZoneRiskSummary = { id: 'tumaco', name: 'Tumaco', latitude: 1.8, longitude: -78.79, score: 61, level: 'high' };

const MODEL: ZoneForecast = {
  zoneId: 'pasto',
  source: 'model',
  modelVersion: '1.0.0',
  generatedAt: '2026-11-03T15:00:00Z',
  horizons: [
    { hours: 24, baseDate: '2026-11-03', probability: 0.528, score: 53, level: 'high' },
    { hours: 48, baseDate: '2026-11-04', probability: 0.452, score: 45, level: 'medium' },
    { hours: 72, baseDate: '2026-11-05', probability: 0.004, score: 0, level: 'low' },
  ],
};
const FALLBACK: ZoneForecast = {
  zoneId: 'tumaco',
  source: 'fallback',
  reason: 'weather_unavailable',
  generatedAt: '2026-11-03T15:00:00Z',
  current: { score: 61, level: 'high' },
};

const UNITS = { temperature: 'c', wind: 'kmh', language: 'es' } as const;
const cells = (rows: ReturnType<typeof compareRows>, id: string) => rows.find((row) => row.id === id)!.cells;

describe('riskiest', () => {
  it('marks the single highest value, or the lowest when less is riskier', () => {
    expect(riskiest([10, 30, 20])).toEqual([false, true, false]);
    expect(riskiest([80, 40, 60], false)).toEqual([false, true, false]);
  });

  it('marks none on a tie at the top, or with fewer than two values', () => {
    expect(riskiest([30, 30, 10])).toEqual([false, false, false]);
    expect(riskiest([30, null])).toEqual([false, false]);
    expect(riskiest([null, null, null])).toEqual([false, false, false]);
  });

  it('compares only the values that arrived', () => {
    expect(riskiest([null, 5, 9])).toEqual([false, false, true]);
  });
});

describe('compareRows', () => {
  const forecasts: Record<string, CompareForecast> = {
    pasto: { status: 'ready', forecast: MODEL },
    tumaco: { status: 'ready', forecast: FALLBACK },
  };

  it('puts the data side by side and highlights the riskiest of each row', () => {
    const rows = compareRows([PASTO, TUMACO], forecasts, UNITS);
    expect(rows.map((row) => row.id)).toEqual([
      'level', 'score', 'h24', 'h48', 'h72', 'temperature', 'humidity', 'wind', 'dryDays', 'dryWeather', 'nearbyHotspots', 'fireHistory',
    ]);
    expect(cells(rows, 'score').map((c) => [c.text, c.riskiest])).toEqual([['42', false], ['61', true]]);
    expect(cells(rows, 'level').map((c) => c.riskiest)).toEqual([false, true]);
    expect(cells(rows, 'h24')[0]).toMatchObject({ text: '53 %', value: 0.528 });
  });

  it('shows «—» where a zone lacks the data: fallback forecast, no weather, no factors', () => {
    const rows = compareRows([PASTO, TUMACO], forecasts, UNITS);
    for (const id of ['h24', 'h48', 'h72', 'temperature', 'humidity', 'wind', 'dryDays', 'dryWeather', 'nearbyHotspots', 'fireHistory']) {
      expect(cells(rows, id)[1], id).toMatchObject({ text: MISSING, value: null, riskiest: false });
    }
    // With only one value left, nothing is highlighted.
    expect(cells(rows, 'h24')[0]!.riskiest).toBe(false);
  });

  it('shows «—» when the forecast failed, and a placeholder while it loads', () => {
    const rows = compareRows([PASTO, TUMACO], { pasto: { status: 'loading' }, tumaco: { status: 'error' } }, UNITS);
    expect(cells(rows, 'h24')[0]).toMatchObject({ loading: true, value: null });
    expect(cells(rows, 'h24')[1]).toMatchObject({ text: MISSING, loading: false });
    expect(cells(compareRows([PASTO], {}, UNITS), 'h48')[0]!.loading).toBe(true);
  });

  it('writes the weather in the units of Ajustes', () => {
    const rows = compareRows([PASTO], forecasts, { temperature: 'f', wind: 'mph', language: 'en' });
    expect(cells(rows, 'temperature')[0]!.text).toBe('57°F');
    expect(cells(rows, 'wind')[0]!.text).toBe('6 mph');
    expect(cells(rows, 'h24')[0]!.text).toBe('53%');
  });

  it('takes the lowest humidity as the riskiest', () => {
    const dry = { ...PASTO, id: 'dry', weather: { ...PASTO.weather!, humidityPct: 35 } };
    expect(cells(compareRows([PASTO, dry], {}, UNITS), 'humidity').map((c) => c.riskiest)).toEqual([false, true]);
  });
});
