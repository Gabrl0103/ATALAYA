import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import type { FireHistory, ZoneBoundaries, ZoneDetail, ZoneForecast } from '../domain/model/risk';
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
  it('marks only the zone detail as failed, keeps the map without a banner and retries it', () => {
    let fail = true;
    const { store, zoneRepository } = setup(
      () => of(FORECAST),
      undefined,
      () => (fail ? throwError(() => new Error('down')) : of(DETAIL)),
    );
    store.select('pasto');
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

  it('marks only the forecast as failed and retries it', () => {
    let fail = true;
    const { store, repository } = setup(() => (fail ? throwError(() => new Error('No se pudo conectar con el servidor.')) : of(FORECAST)));
    store.select('pasto');
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
