import { TestBed } from '@angular/core/testing';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { ApiError } from '../core/error/api-error';
import { OFFLINE_STORAGE, readZoneDetail, readZoneForecast, readZones, saveZoneDetail, saveZoneForecast, saveZones } from '../data/offline-cache';
import { memoryOfflineStorage } from '../data/offline-cache.testing';
import type { FireHistory, Hotspot, ZoneBoundaries, ZoneDetail, ZoneForecast, ZoneRiskSummary } from '../domain/model/risk';
import { FireRepository, ForecastRepository, HotspotRepository, ZoneRepository } from '../domain/repository/repositories';
import { FORECAST_TTL_MS, ZonesStore } from './zones.store';

const DETAIL = { id: 'pasto', name: 'Pasto', score: 37, level: 'medium' } as ZoneDetail;
const FORECAST: ZoneForecast = {
  zoneId: 'pasto',
  source: 'model',
  modelVersion: '1.0.0',
  generatedAt: '2026-10-18T15:00:00Z',
  horizons: [{ hours: 24, baseDate: '2026-10-18', probability: 0.24, score: 24, level: 'low' }],
};

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

const FIRES = { events: [], summary: { count: 0, totalHectares: 0, lastDate: null } };

function setup(
  forecast: ForecastRepository['forecast'],
  boundaries: ZoneRepository['boundaries'] = () => of(BOUNDARIES),
  detail: ZoneRepository['detail'] = () => of(DETAIL),
  history: FireRepository['history'] = () => of(FIRES),
) {
  const repository = { forecast: vi.fn(forecast) };
  const zoneRepository = { list: () => of([]), detail: vi.fn(detail), boundaries: vi.fn(boundaries) };
  const fireRepository = { history: vi.fn(history) };
  TestBed.configureTestingModule({
    providers: [
      { provide: ZoneRepository, useValue: zoneRepository },
      { provide: FireRepository, useValue: fireRepository },
      { provide: HotspotRepository, useValue: { list: () => of([]) } },
      { provide: ForecastRepository, useValue: repository },
    ],
  });
  return { store: TestBed.inject(ZonesStore), repository, zoneRepository, fireRepository };
}

describe('ZonesStore selection', () => {
  it('has the selected zone from the list right away, before its detail', () => {
    const { store } = setup(() => of(FORECAST));
    const pasto = { id: 'pasto', name: 'Pasto', latitude: 1.2, longitude: -77.3, score: 37, level: 'medium' } as const;
    store.zones.set([pasto]);
    expect(store.selected()).toBeNull();
    store.select('pasto');
    expect(store.selected()).toEqual(pasto);
    store.clearSelection();
    expect(store.selected()).toBeNull();
  });
});

describe('ZonesStore zone detail and fire records', () => {
  it('reuses them for 10 minutes when the zone is tapped again', () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T12:00:00Z') });
    const { store, zoneRepository, fireRepository } = setup(() => of(FORECAST));
    store.select('pasto');
    store.select('ipiales');
    store.select('pasto');
    expect(zoneRepository.detail.mock.calls.map(([zone]) => zone)).toEqual(['pasto', 'ipiales']);
    expect(fireRepository.history.mock.calls.map(([zone]) => zone)).toEqual(['pasto', 'ipiales']);
    expect(store.detail()).toEqual(DETAIL);
    expect(store.firesStatus()).toBe('ready');

    vi.advanceTimersByTime(FORECAST_TTL_MS);
    store.select('pasto');
    expect(zoneRepository.detail).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('cancels the requests of the zone tapped before and of a closed sheet', () => {
    const details: Subject<ZoneDetail>[] = [];
    const fires: Subject<FireHistory>[] = [];
    const { store } = setup(
      () => of(FORECAST),
      undefined,
      () => {
        const request = new Subject<ZoneDetail>();
        details.push(request);
        return request;
      },
      () => {
        const request = new Subject<FireHistory>();
        fires.push(request);
        return request;
      },
    );
    store.select('pasto');
    expect(store.firesStatus()).toBe('loading');
    store.select('ipiales');
    expect([details[0]!.observed, fires[0]!.observed]).toEqual([false, false]);
    expect([details[1]!.observed, fires[1]!.observed]).toEqual([true, true]);

    store.clearSelection();
    expect([details[1]!.observed, fires[1]!.observed]).toEqual([false, false]);
    expect(store.firesStatus()).toBe('idle');
  });

  it('marks the fire records as failed without touching the rest of the sheet', () => {
    const { store } = setup(() => of(FORECAST), undefined, undefined, () => throwError(() => new Error('down')));
    store.select('pasto');
    expect(store.firesStatus()).toBe('error');
    expect(store.detailFires()).toBeNull();
    expect(store.detail()).toEqual(DETAIL);
    expect(store.error()).toBeNull();
  });
});

describe('ZonesStore partial failures', () => {
  it('marks only the zone detail as failed, keeps the map without a banner and retries it', async () => {
    let fail = true;
    const { store, zoneRepository } = setup(
      () => of(FORECAST),
      undefined,
      () => (fail ? throwError(() => new Error('down')) : of(DETAIL)),
    );
    store.select('pasto');
    await flush(); // the failure waits to know that nothing was saved for the zone
    expect(store.detailStatus()).toBe('error');
    expect(store.detail()).toBeNull();
    expect(store.error()).toBeNull(); // the map banner is only for the zone list
    expect(store.forecastStatus()).toBe('ready');
    expect(store.firesStatus()).toBe('ready');

    fail = false;
    store.retryDetail();
    expect(zoneRepository.detail).toHaveBeenCalledTimes(2);
    expect(store.detailStatus()).toBe('ready');
    expect(store.detail()).toEqual(DETAIL);

    store.clearSelection();
    expect(store.detailStatus()).toBe('idle');
  });
});

describe('ZonesStore forecast', () => {
  it('asks for the forecast of the selected zone', () => {
    const { store, repository } = setup(() => of(FORECAST));
    store.select('pasto');
    expect(repository.forecast).toHaveBeenCalledWith('pasto');
    expect(store.forecastStatus()).toBe('ready');
    expect(store.detailForecast()).toEqual(FORECAST);
  });

  it('keeps a fallback answer as data (the section explains it)', () => {
    const fallback: ZoneForecast = {
      zoneId: 'pasto', source: 'fallback', reason: 'weather_unavailable', generatedAt: '2026-10-18T15:00:00Z',
      current: { score: 37, level: 'medium' },
    };
    const { store } = setup(() => of(fallback));
    store.select('pasto');
    expect(store.forecastStatus()).toBe('ready');
    expect(store.detailForecast()).toEqual(fallback);
  });

  it('marks only the forecast as failed and retries it', async () => {
    let fail = true;
    const { store, repository } = setup(() => (fail ? throwError(() => new Error('No se pudo conectar con el servidor.')) : of(FORECAST)));
    store.select('pasto');
    await flush(); // the failure waits to know that nothing was saved for the zone
    expect(store.forecastStatus()).toBe('error');
    expect(store.error()).toBeNull(); // the map banner stays for zone errors
    expect(store.detail()).toEqual(DETAIL);

    fail = false;
    store.retryForecast();
    expect(repository.forecast).toHaveBeenCalledTimes(2);
    expect(store.forecastStatus()).toBe('ready');
  });

  it('reuses a zone\'s forecast for 10 minutes, then asks again', () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T12:00:00Z') });
    const { store, repository } = setup(() => of(FORECAST));
    store.select('pasto');
    store.select('ipiales');
    store.select('pasto');
    expect(repository.forecast.mock.calls.map(([zone]) => zone)).toEqual(['pasto', 'ipiales']);
    expect(store.forecastStatus()).toBe('ready');
    expect(store.detailForecast()).toEqual(FORECAST);

    vi.advanceTimersByTime(FORECAST_TTL_MS);
    store.select('pasto');
    expect(repository.forecast).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('asks again for a fallback answer instead of keeping it', () => {
    const fallback: ZoneForecast = {
      zoneId: 'pasto', source: 'fallback', reason: 'model_error', generatedAt: '2026-10-18T15:00:00Z',
      current: { score: 37, level: 'medium' },
    };
    const { store, repository } = setup(() => of(fallback));
    store.select('pasto');
    store.select('pasto');
    expect(repository.forecast).toHaveBeenCalledTimes(2);
  });

  it('cancels the request of the zone tapped before', () => {
    const requests: Subject<ZoneForecast>[] = [];
    const { store } = setup(() => {
      const request = new Subject<ZoneForecast>();
      requests.push(request);
      return request;
    });
    store.select('pasto');
    store.select('ipiales');
    expect(requests[0]!.observed).toBe(false);
    expect(requests[1]!.observed).toBe(true);
    expect(store.forecastStatus()).toBe('loading');

    store.clearSelection();
    expect(requests[1]!.observed).toBe(false);
  });

  it('ignores a late answer for a zone that is no longer selected', () => {
    const late = new Subject<ZoneForecast>();
    const { store } = setup(() => late);
    store.select('pasto');
    store.clearSelection();
    late.next(FORECAST);
    expect(store.detailForecast()).toBeNull();
    expect(store.forecastStatus()).toBe('idle');
  });
});

describe('ZonesStore cache', () => {
  it('forgets the forecasts and the boundaries and asks for them again', () => {
    const { store, repository, zoneRepository } = setup(() => of(FORECAST));
    store.loadBoundaries();
    store.select('pasto');
    store.clearSelection();
    store.clearCache();
    expect(zoneRepository.boundaries).toHaveBeenCalledTimes(2);
    expect(store.boundariesStatus()).toBe('ready');
    store.select('pasto');
    expect(repository.forecast).toHaveBeenCalledTimes(2); // not from the cache any more
  });
});

describe('ZonesStore boundaries', () => {
  it('asks for the boundaries once', () => {
    const { store, zoneRepository } = setup(() => of(FORECAST));
    store.loadBoundaries();
    store.loadBoundaries();
    expect(zoneRepository.boundaries).toHaveBeenCalledTimes(1);
    expect(store.boundariesStatus()).toBe('ready');
    expect(store.boundaries()).toEqual(BOUNDARIES);
  });

  it('marks only the boundaries as failed, retries them and lets the notice close', () => {
    let fail = true;
    const { store, zoneRepository } = setup(
      () => of(FORECAST),
      () => (fail ? throwError(() => new Error('No se pudo conectar con el servidor.')) : of(BOUNDARIES)),
    );
    store.loadBoundaries();
    expect(store.boundariesStatus()).toBe('error');
    expect(store.error()).toBeNull(); // zones and markers keep working
    expect(store.boundaries()).toBeNull();

    store.dismissBoundariesError();
    expect(store.boundariesStatus()).toBe('idle');

    fail = false;
    store.loadBoundaries();
    expect(zoneRepository.boundaries).toHaveBeenCalledTimes(2);
    expect(store.boundariesStatus()).toBe('ready');
  });
});

const PASTO: ZoneRiskSummary = { id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 62, level: 'high' };
const IPIALES: ZoneRiskSummary = { id: 'ipiales', name: 'Ipiales', latitude: 0.83, longitude: -77.64, score: 30, level: 'medium' };
const SPOT: Hotspot = { id: 'h1', latitude: 1.2, longitude: -77.3, detectedAt: '2026-11-16T10:00:00Z' };
const SAVED_AT = new Date('2026-11-15T22:07:00Z');
const NO_NETWORK = () => throwError(() => new ApiError('network', 0));

/** A store whose zone list answers with `list`, on a phone that may have zones saved from before. */
async function setupLoad(list: () => Observable<ZoneRiskSummary[]>, saved?: readonly ZoneRiskSummary[]) {
  const storage = memoryOfflineStorage();
  if (saved) await saveZones(storage, { zones: [...saved], hotspots: [SPOT] }, SAVED_AT);
  TestBed.configureTestingModule({
    providers: [
      { provide: ZoneRepository, useValue: { list: vi.fn(list), detail: () => of(DETAIL), boundaries: () => of(BOUNDARIES) } },
      { provide: FireRepository, useValue: { history: () => of(FIRES) } },
      { provide: HotspotRepository, useValue: { list: () => of([SPOT]) } },
      { provide: ForecastRepository, useValue: { forecast: () => of(FORECAST) } },
      { provide: OFFLINE_STORAGE, useValue: storage },
    ],
  });
  return { store: TestBed.inject(ZonesStore), storage };
}

/** Lets the phone storage (promises) answer. */
const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
};

describe('ZonesStore without connection', () => {
  it('saves a good answer with the time it arrived', async () => {
    const { store, storage } = await setupLoad(() => of([PASTO]));
    store.load();
    await flush();
    expect(store.zones()).toEqual([PASTO]);
    expect(await readZones(storage)).toEqual({ savedAt: store.updatedAt(), value: { zones: [PASTO], hotspots: [SPOT] } });
  });

  it('shows the saved zones at once while the server wakes up, without «Conectando…» in their place', async () => {
    const answer = new Subject<ZoneRiskSummary[]>();
    const { store } = await setupLoad(() => answer, [IPIALES]);
    store.load();
    await flush();
    expect(store.zones()).toEqual([IPIALES]);
    expect(store.hotspots()).toEqual([SPOT]);
    expect(store.updatedAt()).toEqual(SAVED_AT);
    expect(store.fromSaved()).toBe(true);
    expect(store.loading()).toBe(true); // still asking, in the background
    expect(store.offline()).toBe(false);

    answer.next([PASTO]);
    answer.complete();
    expect(store.zones()).toEqual([PASTO]);
    expect(store.fromSaved()).toBe(false);
    expect(store.updatedAt()!.getTime()).toBeGreaterThan(SAVED_AT.getTime());
  });

  it('keeps the saved zones on a network error and says it is offline, not an error', async () => {
    const { store } = await setupLoad(NO_NETWORK, [IPIALES]);
    store.load();
    await flush();
    expect(store.zones()).toEqual([IPIALES]);
    expect(store.updatedAt()).toEqual(SAVED_AT);
    expect(store.offline()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('is the usual error, with nothing made up, when nothing was saved', async () => {
    const { store } = await setupLoad(NO_NETWORK);
    store.load();
    await flush();
    expect(store.zones()).toEqual([]);
    expect(store.error()).toBe('network');
    expect(store.offline()).toBe(false);
  });

  it('keeps the zones of this session when a later refresh fails, and clears the notice when one works', async () => {
    let fail = false;
    const { store } = await setupLoad(() => (fail ? NO_NETWORK() : of([PASTO])));
    store.load();
    await flush();
    const arrived = store.updatedAt();
    fail = true;
    store.load();
    await flush();
    expect(store.zones()).toEqual([PASTO]);
    expect(store.updatedAt()).toBe(arrived);
    expect(store.offline()).toBe(true);
    fail = false;
    store.load();
    await flush();
    expect(store.offline()).toBe(false);
  });

  it('does not put the saved zones over an answer that came first', async () => {
    const { store } = await setupLoad(() => of([PASTO]), [IPIALES]);
    store.load();
    await flush();
    expect(store.zones()).toEqual([PASTO]);
    expect(store.fromSaved()).toBe(false);
  });
});

const FULL_DETAIL: ZoneDetail = {
  ...DETAIL,
  weather: { temperatureC: 19, humidityPct: 70, windKmh: 9, daysWithoutRain: 4 },
  factors: { dryWeather: 0.6, nearbyHotspots: 0.4, fireHistory: 0.3 },
};

/** A store whose detail and forecast answer as given, on a phone that may have Pasto saved from before. */
async function setupZone(answers: { detail: () => Observable<ZoneDetail>; forecast: () => Observable<ZoneForecast> }, savedPasto = false) {
  const storage = memoryOfflineStorage();
  if (savedPasto) {
    await saveZoneDetail(storage, 'pasto', FULL_DETAIL, SAVED_AT);
    await saveZoneForecast(storage, 'pasto', FORECAST, SAVED_AT);
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: ZoneRepository, useValue: { list: () => of([PASTO]), detail: vi.fn(answers.detail), boundaries: () => of(BOUNDARIES) } },
      { provide: FireRepository, useValue: { history: () => of(FIRES) } },
      { provide: HotspotRepository, useValue: { list: () => of([]) } },
      { provide: ForecastRepository, useValue: { forecast: vi.fn(answers.forecast) } },
      { provide: OFFLINE_STORAGE, useValue: storage },
    ],
  });
  return { store: TestBed.inject(ZonesStore), storage };
}

describe('ZonesStore opened zones without connection', () => {
  it('saves the detail and the model forecast of a zone when it is opened', async () => {
    const { store, storage } = await setupZone({ detail: () => of(FULL_DETAIL), forecast: () => of(FORECAST) });
    store.select('pasto');
    await flush();
    expect((await readZoneDetail(storage, 'pasto'))?.value).toEqual(FULL_DETAIL);
    expect((await readZoneForecast(storage, 'pasto'))?.value).toEqual(FORECAST);
  });

  it('shows the saved ones at once while the new ones are on their way, with no notice yet', async () => {
    const { store } = await setupZone({ detail: () => new Subject<ZoneDetail>(), forecast: () => new Subject<ZoneForecast>() }, true);
    store.select('pasto');
    await flush();
    expect(store.detail()).toEqual(FULL_DETAIL);
    expect(store.detailForecast()).toEqual(FORECAST);
    expect(store.detailStatus()).toBe('ready');
    expect(store.forecastStatus()).toBe('ready');
    expect(store.detailSavedAt()).toBeNull();
    expect(store.forecastSavedAt()).toBeNull();
  });

  it('keeps the saved ones on a network error and says when they are from', async () => {
    const { store } = await setupZone({ detail: NO_NETWORK, forecast: NO_NETWORK }, true);
    store.select('pasto');
    await flush();
    expect(store.detail()).toEqual(FULL_DETAIL);
    expect(store.detailForecast()).toEqual(FORECAST);
    expect(store.detailSavedAt()).toEqual(SAVED_AT);
    expect(store.forecastSavedAt()).toEqual(SAVED_AT);

    store.clearSelection();
    expect(store.detailSavedAt()).toBeNull();
    expect(store.forecastSavedAt()).toBeNull();
  });

  it("shows the sheet's own failure for a zone never opened, with nothing made up", async () => {
    const { store } = await setupZone({ detail: NO_NETWORK, forecast: NO_NETWORK });
    store.select('pasto');
    await flush();
    expect(store.detail()).toBeNull();
    expect(store.detailForecast()).toBeNull();
    expect(store.detailStatus()).toBe('error');
    expect(store.forecastStatus()).toBe('error');
    expect(store.detailSavedAt()).toBeNull();
  });
});

describe('ZonesStore date of the saved data in the zone sheet', () => {
  it('is the oldest of the saved data shown because a request failed, and none while everything is new', async () => {
    const { store } = await setupZone({ detail: NO_NETWORK, forecast: () => of(FORECAST) }, true);
    store.select('pasto');
    await flush();
    expect(store.selectedOfflineAt()).toEqual(SAVED_AT); // the detail is the saved one

    const older = new Date('2026-11-14T08:00:00Z');
    store.updatedAt.set(older);
    store.offline.set(true); // the zone list is older still
    expect(store.selectedOfflineAt()).toEqual(older);

    store.offline.set(false);
    store.clearSelection();
    expect(store.selectedOfflineAt()).toBeNull();
  });
});
