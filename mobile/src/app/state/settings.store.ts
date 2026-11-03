import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const KEY = 'settings';

export type LanguageSetting = 'auto' | 'es' | 'en';
export type TemperatureUnit = 'c' | 'f';
export type WindUnit = 'kmh' | 'mph';
/** 'auto' follows the phone's prefers-reduced-motion; 'reduced' turns the motion off whatever it says. */
export type MotionSetting = 'auto' | 'reduced';
/** «Alertas»: the lowest level of a favorite that warns. */
export type AlertThreshold = 'high' | 'extreme';

export interface Settings {
  readonly language: LanguageSetting;
  readonly temperature: TemperatureUnit;
  readonly wind: WindUnit;
  readonly motion: MotionSetting;
  readonly haptics: boolean;
  /** Local alerts about the favorites; off until turned on (it asks for the notification permission). */
  readonly alerts: boolean;
  readonly alertThreshold: AlertThreshold;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  temperature: 'c',
  wind: 'kmh',
  motion: 'auto',
  haptics: true,
  alerts: false,
  alertThreshold: 'high',
};

/** Where the settings are kept: Preferences (native storage on the phone, localStorage in the browser). */
export interface SettingsStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export const SETTINGS_STORAGE = new InjectionToken<SettingsStorage>('SETTINGS_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    read: async () => (await Preferences.get({ key: KEY })).value,
    write: (value) => Preferences.set({ key: KEY, value }),
  }),
});

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/** The saved settings; a missing, broken or unknown value falls back to its default, one by one. */
export function parseSettings(value: string | null): Settings {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch {
    // Broken data: the defaults.
  }
  return {
    language: pick(saved['language'], ['auto', 'es', 'en'], DEFAULT_SETTINGS.language),
    temperature: pick(saved['temperature'], ['c', 'f'], DEFAULT_SETTINGS.temperature),
    wind: pick(saved['wind'], ['kmh', 'mph'], DEFAULT_SETTINGS.wind),
    motion: pick(saved['motion'], ['auto', 'reduced'], DEFAULT_SETTINGS.motion),
    haptics: typeof saved['haptics'] === 'boolean' ? saved['haptics'] : DEFAULT_SETTINGS.haptics,
    alerts: typeof saved['alerts'] === 'boolean' ? saved['alerts'] : DEFAULT_SETTINGS.alerts,
    alertThreshold: pick(saved['alertThreshold'], ['high', 'extreme'], DEFAULT_SETTINGS.alertThreshold),
  };
}

/** The «Ajustes» screen's choices, read before the first screen is drawn and saved on every change. */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly storage = inject(SETTINGS_STORAGE);

  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly language = computed(() => this.settings().language);
  readonly temperature = computed(() => this.settings().temperature);
  readonly wind = computed(() => this.settings().wind);
  readonly motion = computed(() => this.settings().motion);
  readonly haptics = computed(() => this.settings().haptics);
  readonly alerts = computed(() => this.settings().alerts);
  readonly alertThreshold = computed(() => this.settings().alertThreshold);

  private loading?: Promise<void>;

  /** Reads the saved settings once; without storage the defaults stay (and changes last while the app is open). */
  load(): Promise<void> {
    this.loading ??= this.storage
      .read()
      .then((value) => this.settings.set(parseSettings(value)))
      .catch(() => undefined);
    return this.loading;
  }

  async update(change: Partial<Settings>): Promise<void> {
    await this.load();
    const next = { ...this.settings(), ...change };
    this.settings.set(next);
    await this.storage.write(JSON.stringify(next)).catch(() => undefined);
  }
}
