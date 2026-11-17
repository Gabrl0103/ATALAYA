import type { Hotspot, ZoneRiskSummary } from '../domain/model/risk';
import { readZones, saveZones, type OfflineStorage } from './offline-cache';
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
