import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { PermissionState } from '@capacitor/core';
import { type Observable, of, throwError } from 'rxjs';
import type { RiskLevel, ZoneForecast, ZoneRiskSummary } from '../../domain/model/risk';
import { ForecastRepository } from '../../domain/repository/repositories';
import { FavoritesStore } from '../../state/favorites.store';
import { SettingsStore } from '../../state/settings.store';
import { ZonesStore } from '../../state/zones.store';
import { notificationId } from './alert-rules';
import { LocalAlerts, STALE_MS } from './local-alerts';
import { ALERTS_STORAGE, NOTIFIER } from './notifier';
import { fakeNotifier, memoryAlertsStorage } from './notifier.testing';

const ZONES: ZoneRiskSummary[] = [
  { id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 62, level: 'high' },
  { id: 'ipiales', name: 'Ipiales', latitude: 0.83, longitude: -77.64, score: 41, level: 'medium' },
  { id: 'tumaco', name: 'Tumaco', latitude: 1.8, longitude: -78.79, score: 80, level: 'extreme' },
];

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
  zoneId: 'pasto',
  source: 'fallback',
  reason: 'weather_unavailable',
  generatedAt: '2026-11-03T15:00:00Z',
  current: { score: 62, level: 'high' },
};

interface Options {
  favorites?: string[];
  answer?: PermissionState;
  current?: PermissionState;
  forecast?: Observable<ZoneForecast>;
}

function setup({ favorites = ['pasto'], answer = 'granted', current = 'prompt', forecast = of(MODEL) }: Options = {}) {
  const notifier = fakeNotifier(answer, current);
  const storage = memoryAlertsStorage();
  const zones = {
    zones: signal(ZONES),
    updatedAt: signal<Date | null>(new Date()),
    loading: signal(false),
    load: vi.fn(),
    select: vi.fn(),
  };
  const favoriteIds = signal(favorites);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: NOTIFIER, useValue: notifier },
      { provide: ALERTS_STORAGE, useValue: storage },
      { provide: ZonesStore, useValue: zones },
      { provide: FavoritesStore, useValue: { ids: favoriteIds, load: async () => undefined } },
      { provide: ForecastRepository, useValue: { forecast: vi.fn(() => forecast) } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const alerts = TestBed.inject(LocalAlerts);
  const settings = TestBed.inject(SettingsStore);
  /** The next zone list from the API, with one zone at another level. */
  const setLevel = (id: string, level: RiskLevel, score: number) =>
    zones.zones.update((list) => list.map((z) => (z.id === id ? { ...z, level, score } : z)));
  return { alerts, notifier, storage, zones, favoriteIds, settings, navigate, setLevel };
}

describe('LocalAlerts', () => {
  it('warns once about a favorite in Alto with its real name, level, score and the 72 h forecast', async () => {
    const { alerts, notifier, settings } = setup();
    expect(await alerts.enable()).toBe('granted');
    expect(notifier.requests).toBe(1);
    expect(settings.alerts()).toBe(true);
    expect(notifier.shown).toEqual([
      {
        id: notificationId('pasto'),
        title: 'Pasto: riesgo Alto',
        body: 'Puntaje 62/100. Pronóstico: 53 % de probabilidad de focos de calor en las 72 h siguientes. Toca para verlo en el mapa.',
        zoneId: 'pasto',
      },
    ]);
  });

  it('does not repeat while the level stays, and warns again only when it goes up', async () => {
    const { alerts, notifier, setLevel } = setup();
    await alerts.enable();
    await alerts.check();
    expect(notifier.shown).toHaveLength(1);

    setLevel('pasto', 'extreme', 81);
    await alerts.check();
    expect(notifier.shown.map((n) => n.title)).toEqual(['Pasto: riesgo Alto', 'Pasto: riesgo Extremo']);

    setLevel('pasto', 'high', 60); // going down only updates what was seen
    await alerts.check();
    setLevel('pasto', 'medium', 40);
    await alerts.check();
    expect(notifier.shown).toHaveLength(2);

    setLevel('pasto', 'high', 55);
    await alerts.check();
    expect(notifier.shown.at(-1)?.body).toContain('Puntaje 55/100');
    expect(notifier.shown).toHaveLength(3);
  });

  it('with Extremo as the threshold, only favorites in Extremo warn', async () => {
    const { alerts, notifier, settings } = setup({ favorites: ['pasto', 'tumaco'] });
    await settings.update({ alertThreshold: 'extreme' });
    await alerts.enable();
    expect(notifier.shown.map((n) => n.title)).toEqual(['Tumaco: riesgo Extremo']);
  });

  it('only warns about favorites', async () => {
    const { alerts, notifier } = setup({ favorites: ['ipiales'] });
    await alerts.enable();
    expect(notifier.shown).toEqual([]); // Tumaco is in Extremo, but it is not a favorite
  });

  it('only remembers a favorite added later, and warns when it goes up', async () => {
    const { alerts, notifier, favoriteIds, setLevel } = setup({ favorites: ['ipiales'] });
    await alerts.enable();
    favoriteIds.set(['ipiales', 'pasto']); // added while looking at it: no alert for what is already on screen
    await alerts.check();
    expect(notifier.shown).toEqual([]);
    setLevel('pasto', 'extreme', 77);
    await alerts.check();
    expect(notifier.shown.map((n) => n.title)).toEqual(['Pasto: riesgo Extremo']);
  });

  it('leaves the forecast out when it is the fallback or does not load', async () => {
    const fallback = setup({ forecast: of(FALLBACK) });
    await fallback.alerts.enable();
    expect(fallback.notifier.shown[0]?.body).toBe('Puntaje 62/100. Toca para verlo en el mapa.');

    TestBed.resetTestingModule();
    const failed = setup({ forecast: throwError(() => new Error('offline')) });
    await failed.alerts.enable();
    expect(failed.notifier.shown[0]?.body).toBe('Puntaje 62/100. Toca para verlo en el mapa.');
  });

  it('stays off and shows nothing when the permission is denied', async () => {
    const { alerts, notifier, settings } = setup({ answer: 'denied' });
    expect(await alerts.enable()).toBe('denied');
    expect(settings.alerts()).toBe(false);
    expect(alerts.permission()).toBe('denied');
    expect(notifier.shown).toEqual([]);
  });

  it('turns itself off when the permission is taken away in the phone settings', async () => {
    const { alerts, notifier, settings, setLevel } = setup();
    await alerts.enable();
    notifier.setPermission('denied');
    setLevel('pasto', 'extreme', 90);
    await alerts.check();
    expect(settings.alerts()).toBe(false);
    expect(alerts.permission()).toBe('denied');
    expect(notifier.shown).toHaveLength(1);
  });

  it('opens the zone of an alert on the map when it is tapped', () => {
    const { notifier, zones, navigate } = setup();
    notifier.tap('pasto');
    expect(zones.select).toHaveBeenCalledWith('pasto');
    expect(navigate).toHaveBeenCalledWith('/map');
    notifier.tap(null); // the test notification has no zone
    expect(zones.select).toHaveBeenCalledTimes(1);
  });

  it('sends a test notification with no zone in it, only with the permission', async () => {
    const granted = setup({ current: 'granted' });
    expect(await granted.alerts.test()).toBe(true);
    expect(granted.notifier.shown).toEqual([
      { id: 0, title: 'Notificación de prueba', body: 'Así llegarán las alertas de tus municipios favoritos.' },
    ]);

    TestBed.resetTestingModule();
    const notAsked = setup();
    expect(await notAsked.alerts.test()).toBe(false);
    expect(notAsked.notifier.requests).toBe(0); // the permission is only asked from the switch
    expect(notAsked.notifier.shown).toEqual([]);
  });

  it('writes the alert in English when the app is in English', async () => {
    const { alerts, notifier, settings } = setup();
    await settings.update({ language: 'en' });
    await alerts.enable();
    expect(notifier.shown[0]).toMatchObject({
      title: 'Pasto: High risk',
      body: 'Score 62/100. Forecast: 53% probability of heat spots in the next 72 h. Tap to see it on the map.',
    });
  });

  it('checks by itself when a new zone list arrives', async () => {
    const { alerts, notifier, setLevel } = setup();
    await alerts.enable();
    setLevel('pasto', 'extreme', 85);
    TestBed.tick();
    await vi.waitFor(() => expect(notifier.shown).toHaveLength(2));
  });

  it('asks for the zones again on coming back to the app after a while', async () => {
    const { alerts, zones } = setup();
    await alerts.enable();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(zones.load).not.toHaveBeenCalled(); // the list is fresh

    zones.updatedAt.set(new Date(Date.now() - STALE_MS - 1000));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(zones.load).toHaveBeenCalledTimes(1);
  });
});
