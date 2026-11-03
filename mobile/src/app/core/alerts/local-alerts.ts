import { DOCUMENT, Injectable, InjectionToken, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { PermissionState } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom, timeout } from 'rxjs';
import type { ZoneRiskSummary } from '../../domain/model/risk';
import { ForecastRepository } from '../../domain/repository/repositories';
import { favoriteZones } from '../../domain/util/favorites';
import { percentLabel } from '../../domain/util/format';
import { riskLabel } from '../../domain/util/risk-labels';
import { I18n } from '../../i18n/i18n';
import { FavoritesStore } from '../../state/favorites.store';
import { SettingsStore } from '../../state/settings.store';
import { ZonesStore } from '../../state/zones.store';
import { notificationId, parseSeenLevels, planAlerts } from './alert-rules';

const KEY = 'alerts.seenLevels';
/** On coming back to the app, the zones are asked again if the last list is older than this. */
export const STALE_MS = 10 * 60_000;
/** The forecast only adds to the text: an alert does not wait longer than this for it. */
const FORECAST_WAIT_MS = 6000;
/** Id of «Probar notificación» (notificationId never gives 0). */
const TEST_ID = 0;

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

/**
 * Local alerts about the favorites, with no server of its own nor remote push: each time the zone list
 * arrives (opening the app, or coming back to it after STALE_MS) the level of each favorite is compared
 * with the last one seen. With the app closed nothing is checked, and Ajustes says so. Nothing leaves the
 * phone: the only requests are the zone list and, for a favorite being warned about, its forecast.
 */
@Injectable({ providedIn: 'root' })
export class LocalAlerts {
  private readonly settings = inject(SettingsStore);
  private readonly zones = inject(ZonesStore);
  private readonly favorites = inject(FavoritesStore);
  private readonly forecasts = inject(ForecastRepository);
  private readonly notifier = inject(NOTIFIER);
  private readonly storage = inject(ALERTS_STORAGE);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);

  /** The notification permission as last known ('prompt' until asked); Ajustes shows it. */
  readonly permission = signal<PermissionState>('prompt');
  /** One check at a time: two at once would warn twice. */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.notifier.onTap((zoneId) => {
      if (!zoneId) return;
      this.zones.select(zoneId);
      void this.router.navigateByUrl('/map');
    });
    void this.notifier.checkPermission().then((state) => this.permission.set(state), () => undefined);

    // A new zone list, another threshold or a change of favorites: compare again.
    effect(() => {
      if (!this.settings.alerts() || this.zones.zones().length === 0) return;
      this.settings.alertThreshold();
      this.favorites.ids();
      untracked(() => void this.check());
    });

    const document = inject(DOCUMENT);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.settings.alerts() || this.zones.loading()) return;
      const updated = this.zones.updatedAt();
      if (!updated || Date.now() - updated.getTime() > STALE_MS) this.zones.load();
    });
  }

  /**
   * Turns the alerts on after asking for the permission (Ajustes explains why first). Denied: they stay
   * off and Ajustes says how to allow it in the phone's settings. The first check warns about the
   * favorites already at the threshold.
   */
  async enable(): Promise<PermissionState> {
    let state = await this.notifier.checkPermission().catch((): PermissionState => 'denied');
    if (state !== 'granted') state = await this.notifier.requestPermission().catch((): PermissionState => 'denied');
    this.permission.set(state);
    if (state !== 'granted') {
      await this.settings.update({ alerts: false });
      return state;
    }
    await this.storage.write('{}').catch(() => undefined);
    await this.settings.update({ alerts: true });
    await this.check(true);
    return state;
  }

  async disable(): Promise<void> {
    await this.settings.update({ alerts: false });
  }

  /** «Probar notificación»: says what the alerts look like, with no made-up zone in it. */
  async test(): Promise<boolean> {
    const state = await this.notifier.checkPermission().catch((): PermissionState => 'denied');
    this.permission.set(state);
    if (state !== 'granted') return false;
    await this.notifier.show([{ id: TEST_ID, title: this.i18n.t('alerts.testTitle'), body: this.i18n.t('alerts.testBody') }]);
    return true;
  }

  /** Compares the favorites with the levels seen last time and warns (see planAlerts). */
  check(includeNew = false): Promise<void> {
    this.queue = this.queue.then(() => this.runCheck(includeNew)).catch(() => undefined);
    return this.queue;
  }

  private async runCheck(includeNew: boolean): Promise<void> {
    const zones = this.zones.zones();
    if (!this.settings.alerts() || zones.length === 0) return;
    await this.favorites.load();
    const state = await this.notifier.checkPermission().catch((): PermissionState => 'denied');
    this.permission.set(state);
    if (state !== 'granted') {
      // Taken away in the phone's settings: the switch goes off and Ajustes says why.
      await this.settings.update({ alerts: false });
      return;
    }
    const seen = parseSeenLevels(await this.storage.read().catch(() => null));
    const plan = planAlerts(favoriteZones(this.favorites.ids(), zones), seen, this.settings.alertThreshold(), includeNew);
    if (plan.notify.length > 0) await this.notifier.show(await Promise.all(plan.notify.map((zone) => this.notification(zone))));
    await this.storage.write(JSON.stringify(plan.seen)).catch(() => undefined);
  }

  /** Name, level and score from the zone list; the 72 h forecast only if the model answered. */
  private async notification(zone: ZoneRiskSummary): Promise<AlertNotification> {
    const language = this.i18n.language();
    const title = this.i18n.t('alerts.title', { name: zone.name, level: riskLabel(zone.level, language) });
    const forecast = await firstValueFrom(this.forecasts.forecast(zone.id).pipe(timeout(FORECAST_WAIT_MS))).catch(() => null);
    const first = forecast?.source === 'model' ? forecast.horizons[0] : undefined;
    const body = first
      ? this.i18n.t('alerts.bodyForecast', { score: zone.score, percent: percentLabel(first.probability, language) })
      : this.i18n.t('alerts.body', { score: zone.score });
    return { id: notificationId(zone.id), title, body, zoneId: zone.id };
  }
}
