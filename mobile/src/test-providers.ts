import type { Provider } from '@angular/core';
import { ALERTS_STORAGE, NOTIFIER } from './app/core/alerts/notifier';
import { fakeNotifier, memoryAlertsStorage } from './app/core/alerts/notifier.testing';
import { DEVICE_LANGUAGES } from './app/i18n/i18n';
import { FAVORITES_STORAGE } from './app/state/favorites.store';
import { SETTINGS_STORAGE } from './app/state/settings.store';

/**
 * Every spec starts on a Spanish phone with no saved settings nor favorites (jsdom says en-US and has
 * its own localStorage); a spec that needs English or saved data provides its own. No spec reaches the
 * real notification plugin: the alerts get a phone that was never asked for the permission.
 */
export default [
  { provide: DEVICE_LANGUAGES, useValue: ['es-CO'] },
  { provide: SETTINGS_STORAGE, useValue: { read: async () => null, write: async () => undefined } },
  { provide: FAVORITES_STORAGE, useValue: { read: async () => null, write: async () => undefined } },
  { provide: NOTIFIER, useFactory: () => fakeNotifier() },
  { provide: ALERTS_STORAGE, useFactory: () => memoryAlertsStorage() },
] satisfies Provider[];
