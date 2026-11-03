import { InjectionToken } from '@angular/core';
import type { PermissionState } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

const KEY = 'alerts.seenLevels';

export interface AlertNotification {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  /** The zone the tap opens on the map; none for the test notification. */
  readonly zoneId?: string;
}

/** The phone's notifications (@capacitor/local-notifications), behind a token so the tests use a fake. */
export interface Notifier {
  checkPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  show(notifications: readonly AlertNotification[]): Promise<void>;
  onTap(handler: (zoneId: string | null) => void): void;
}

export const NOTIFIER = new InjectionToken<Notifier>('NOTIFIER', {
  providedIn: 'root',
  factory: (): Notifier => {
    let tap: ((zoneId: string | null) => void) | null = null;
    // The tap listener goes first and every other call waits for it: in the browser, two first calls at
    // once make @capacitor/core load two web plugins, and the listener was left on the one thrown away.
    const ready = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra: unknown = action.notification.extra;
      const zoneId = typeof extra === 'object' && extra !== null ? (extra as Record<string, unknown>)['zoneId'] : null;
      tap?.(typeof zoneId === 'string' ? zoneId : null);
    });
    const after = <T>(run: () => Promise<T>): Promise<T> => ready.then(run, run);
    return {
      checkPermission: () => after(async () => (await LocalNotifications.checkPermissions()).display),
      requestPermission: () => after(async () => (await LocalNotifications.requestPermissions()).display),
      show: (notifications) => after(() => schedule(notifications)),
      onTap: (handler) => {
        tap = handler;
      },
    };
  },
});

async function schedule(notifications: readonly AlertNotification[]): Promise<void> {
  await LocalNotifications.schedule({
    notifications: notifications.map(({ id, title, body, zoneId }) => ({
      id,
      title,
      body,
      largeBody: body,
      extra: zoneId ? { zoneId } : undefined,
      // Shown at once, not at a time: without this the plugin would open Android's «Alarms» screen.
      isExactNotification: false,
    })),
  });
}

/** Where the levels seen at the last check are kept: Preferences, only on this phone. */
export interface AlertsStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export const ALERTS_STORAGE = new InjectionToken<AlertsStorage>('ALERTS_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    read: async () => (await Preferences.get({ key: KEY })).value,
    write: (value) => Preferences.set({ key: KEY, value }),
  }),
});
