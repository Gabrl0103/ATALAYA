import { TestBed } from '@angular/core/testing';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE, SettingsStore, parseSettings, type SettingsStorage } from './settings.store';

function setup(saved: string | null, storage: Partial<SettingsStorage> = {}) {
  const written: string[] = [];
  TestBed.configureTestingModule({
    providers: [{
      provide: SETTINGS_STORAGE,
      useValue: {
        read: async () => saved,
        write: async (value: string) => void written.push(value),
        ...storage,
      } satisfies SettingsStorage,
    }],
  });
  return { store: TestBed.inject(SettingsStore), written };
}

describe('SettingsStore', () => {
  it('starts with automatic language and motion, °C, km/h, vibration on and the alerts off', async () => {
    const { store } = setup(null);
    await store.load();
    expect(store.settings()).toEqual({
      language: 'auto',
      temperature: 'c',
      wind: 'kmh',
      motion: 'auto',
      haptics: true,
      alerts: false,
      alertThreshold: 'high',
    });
  });

  it('reads what was saved', async () => {
    const { store } = setup('{"language":"en","temperature":"f","wind":"mph","motion":"reduced","haptics":false}');
    await store.load();
    expect(store.language()).toBe('en');
    expect(store.temperature()).toBe('f');
    expect(store.wind()).toBe('mph');
    expect(store.motion()).toBe('reduced');
    expect(store.haptics()).toBe(false);
  });

  it('reads the saved alerts and their threshold', async () => {
    const { store } = setup('{"alerts":true,"alertThreshold":"extreme"}');
    await store.load();
    expect(store.alerts()).toBe(true);
    expect(store.alertThreshold()).toBe('extreme');
  });

  it('saves every change with the rest of the settings', async () => {
    const { store, written } = setup('{"wind":"mph"}');
    await store.update({ language: 'en' });
    await store.update({ haptics: false });
    expect(store.settings()).toEqual({ ...DEFAULT_SETTINGS, wind: 'mph', language: 'en', haptics: false });
    expect(written.map((value) => JSON.parse(value))).toEqual([
      { ...DEFAULT_SETTINGS, wind: 'mph', language: 'en' },
      { ...DEFAULT_SETTINGS, wind: 'mph', language: 'en', haptics: false },
    ]);
  });

  it('keeps working in memory when there is no storage', async () => {
    const { store } = setup(null, {
      read: () => Promise.reject(new Error('no storage')),
      write: () => Promise.reject(new Error('no storage')),
    });
    await store.load();
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    await store.update({ temperature: 'f' });
    expect(store.temperature()).toBe('f');
  });
});

describe('parseSettings', () => {
  it('falls back to the default of each value that is missing, unknown or broken', () => {
    expect(parseSettings('{"language":"fr","temperature":"f","haptics":"yes"}')).toEqual({ ...DEFAULT_SETTINGS, temperature: 'f' });
    expect(parseSettings('{"alerts":"yes","alertThreshold":"low"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
