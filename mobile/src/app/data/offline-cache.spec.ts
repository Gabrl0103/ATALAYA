import type { Hotspot, ZoneBoundaries, ZoneDetail, ZoneForecast, ZoneRiskSummary } from '../domain/model/risk';
import {
  readBoundaries, readZoneDetail, readZoneForecast, readZones, saveBoundaries, saveZoneDetail, saveZoneForecast, saveZones,
  type OfflineStorage,
} from './offline-cache';
import { memoryOfflineStorage } from './offline-cache.testing';

const PASTO: ZoneRiskSummary = { id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 62, level: 'high' };
const SPOT: Hotspot = { id: 'h1', latitude: 1.2, longitude: -77.3, detectedAt: '2026-11-16T10:00:00Z' };
const AT = new Date('2026-11-16T22:07:00Z');

describe('offline cache: zone list', () => {
  it('saves the zones and heat spots with the time they arrived and reads them back', async () => {
    const storage = memoryOfflineStorage();
    await saveZones(storage, { zones: [PASTO], hotspots: [SPOT] }, AT);
    expect([...storage.data.keys()]).toEqual(['offline.zones']);
    expect(await readZones(storage)).toEqual({ savedAt: AT, value: { zones: [PASTO], hotspots: [SPOT] } });
  });

  it('reads nothing when nothing was saved', async () => {
    expect(await readZones(memoryOfflineStorage())).toBeNull();
  });

  it('reads broken or foreign data as nothing instead of showing it', async () => {
    const saved = (value: unknown) => memoryOfflineStorage({ 'offline.zones': JSON.stringify(value) });
    expect(await readZones(memoryOfflineStorage({ 'offline.zones': '{not json' }))).toBeNull();
    expect(await readZones(saved({ value: { zones: [PASTO], hotspots: [] } }))).toBeNull(); // no savedAt
    expect(await readZones(saved({ savedAt: AT.getTime(), value: { zones: [], hotspots: [] } }))).toBeNull(); // empty
    expect(await readZones(saved({ savedAt: AT.getTime(), value: { zones: [{ ...PASTO, level: 'huge' }], hotspots: [] } }))).toBeNull();
    expect(await readZones(saved({ savedAt: AT.getTime(), value: { zones: [PASTO] } }))).toBeNull(); // no hotspots
  });

  it('keeps working when the phone storage fails', async () => {
    const failing: OfflineStorage = {
      read: () => Promise.reject(new Error('no storage')),
      write: () => Promise.reject(new Error('full')),
      remove: () => Promise.reject(new Error('no storage')),
      keys: () => Promise.reject(new Error('no storage')),
    };
    await expect(saveZones(failing, { zones: [PASTO], hotspots: [] })).resolves.toBeUndefined();
    expect(await readZones(failing)).toBeNull();
  });
});

const DETAIL: ZoneDetail = {
  id: 'pasto',
  name: 'Pasto',
  score: 62,
  level: 'high',
  weather: { temperatureC: 19, humidityPct: 70, windKmh: 9, daysWithoutRain: 4 },
  factors: { dryWeather: 0.6, nearbyHotspots: 0.4, fireHistory: 0.3 },
};
const MODEL: ZoneForecast = {
  zoneId: 'pasto',
  source: 'model',
  modelVersion: '1.0.0',
  generatedAt: '2026-11-16T15:00:00Z',
  horizons: [{ hours: 24, baseDate: '2026-11-16', probability: 0.53, score: 53, level: 'high' }],
};

describe('offline cache: opened zones', () => {
  it('saves the detail and the forecast of each zone under its own key and reads them back', async () => {
    const storage = memoryOfflineStorage();
    await saveZoneDetail(storage, 'pasto', DETAIL, AT);
    await saveZoneForecast(storage, 'pasto', MODEL, AT);
    expect([...storage.data.keys()].sort()).toEqual(['offline.detail.pasto', 'offline.forecast.pasto']);
    expect(await readZoneDetail(storage, 'pasto')).toEqual({ savedAt: AT, value: DETAIL });
    expect(await readZoneForecast(storage, 'pasto')).toEqual({ savedAt: AT, value: MODEL });
  });

  it('has nothing for a zone never opened', async () => {
    const storage = memoryOfflineStorage();
    await saveZoneDetail(storage, 'pasto', DETAIL, AT);
    expect(await readZoneDetail(storage, 'ipiales')).toBeNull();
    expect(await readZoneForecast(storage, 'ipiales')).toBeNull();
  });

  it('does not keep a fallback forecast, nor read the data of another zone under a key', async () => {
    const storage = memoryOfflineStorage();
    const fallback: ZoneForecast = {
      zoneId: 'pasto', source: 'fallback', reason: 'model_error', generatedAt: '2026-11-16T15:00:00Z', current: { score: 62, level: 'high' },
    };
    await saveZoneForecast(storage, 'pasto', fallback, AT);
    expect(storage.data.size).toBe(0);
    storage.data.set('offline.detail.ipiales', JSON.stringify({ savedAt: AT.getTime(), value: DETAIL }));
    expect(await readZoneDetail(storage, 'ipiales')).toBeNull();
  });
});

const BOUNDARIES: ZoneBoundaries = {
  type: 'FeatureCollection',
  source: 'DANE, Marco Geoestadístico Nacional 2025',
  features: [{
    type: 'Feature',
    id: 'pasto',
    properties: { id: 'pasto', divipola: 52001, name: 'Pasto' },
    geometry: { type: 'Polygon', coordinates: [[[-77.3, 1.2], [-77.2, 1.2], [-77.2, 1.3], [-77.3, 1.2]]] },
  }],
};

describe('offline cache: map boundaries', () => {
  it('saves the boundaries and reads them back', async () => {
    const storage = memoryOfflineStorage();
    await saveBoundaries(storage, BOUNDARIES, AT);
    expect([...storage.data.keys()]).toEqual(['offline.boundaries']);
    expect(await readBoundaries(storage)).toEqual({ savedAt: AT, value: BOUNDARIES });
  });

  it('reads anything but a FeatureCollection with outlines as nothing', async () => {
    const saved = (value: unknown) => memoryOfflineStorage({ 'offline.boundaries': JSON.stringify({ savedAt: AT.getTime(), value }) });
    expect(await readBoundaries(saved({ ...BOUNDARIES, features: [] }))).toBeNull();
    expect(await readBoundaries(saved({ ...BOUNDARIES, type: 'Feature' }))).toBeNull();
    expect(await readBoundaries(memoryOfflineStorage())).toBeNull();
  });
});
