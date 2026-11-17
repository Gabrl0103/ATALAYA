import { InjectionToken } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { Hotspot, RiskLevel, ZoneRiskSummary } from '../domain/model/risk';

/**
 * Last good answers of the API, kept on the phone so the app has real data without internet or while
 * Render wakes up. Only public data of the API and when it arrived: no location nor anything personal.
 * Every key starts with this, so «Borrar caché de datos» finds them all.
 */
export const OFFLINE_PREFIX = 'offline.';
const ZONES_KEY = `${OFFLINE_PREFIX}zones`;

/** Where it is kept: Preferences (native storage on the phone, localStorage in the browser). */
export interface OfflineStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
}

export const OFFLINE_STORAGE = new InjectionToken<OfflineStorage>('OFFLINE_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    read: async (key) => (await Preferences.get({ key })).value,
    write: (key, value) => Preferences.set({ key, value }),
    remove: (key) => Preferences.remove({ key }),
    keys: async () => (await Preferences.keys()).keys,
  }),
});

/** A saved answer and when it arrived from the API. */
export interface Saved<T> {
  readonly savedAt: Date;
  readonly value: T;
}

/** Zone list and heat spots: they arrive together, so they are kept together. */
export interface ZonesSnapshot {
  readonly zones: ZoneRiskSummary[];
  readonly hotspots: Hotspot[];
}

const LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high', 'extreme'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function isZone(value: unknown): value is ZoneRiskSummary {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    isFiniteNumber(value['latitude']) &&
    isFiniteNumber(value['longitude']) &&
    isFiniteNumber(value['score']) &&
    LEVELS.includes(value['level'] as RiskLevel)
  );
}

function isHotspot(value: unknown): value is Hotspot {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    isFiniteNumber(value['latitude']) &&
    isFiniteNumber(value['longitude']) &&
    typeof value['detectedAt'] === 'string'
  );
}

function isZonesSnapshot(value: unknown): value is ZonesSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value['zones']) &&
    value['zones'].length > 0 &&
    value['zones'].every(isZone) &&
    Array.isArray(value['hotspots']) &&
    value['hotspots'].every(isHotspot)
  );
}

/** What was saved under the key; missing, broken or of another shape (an older app) reads as nothing. */
export async function readSaved<T>(storage: OfflineStorage, key: string, isValue: (value: unknown) => value is T): Promise<Saved<T> | null> {
  try {
    const parsed: unknown = JSON.parse((await storage.read(key)) ?? 'null');
    if (!isRecord(parsed) || !isFiniteNumber(parsed['savedAt']) || !isValue(parsed['value'])) return null;
    return { savedAt: new Date(parsed['savedAt']), value: parsed['value'] };
  } catch {
    return null;
  }
}

/** Keeps the answer with the time it arrived; a full or missing storage only means nothing is kept. */
export async function writeSaved(storage: OfflineStorage, key: string, value: unknown, savedAt: Date = new Date()): Promise<void> {
  await storage.write(key, JSON.stringify({ savedAt: savedAt.getTime(), value })).catch(() => undefined);
}

export const readZones = (storage: OfflineStorage): Promise<Saved<ZonesSnapshot> | null> => readSaved(storage, ZONES_KEY, isZonesSnapshot);

export const saveZones = (storage: OfflineStorage, snapshot: ZonesSnapshot, savedAt?: Date): Promise<void> =>
  writeSaved(storage, ZONES_KEY, snapshot, savedAt);
