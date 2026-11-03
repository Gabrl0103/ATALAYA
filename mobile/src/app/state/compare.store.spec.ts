import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import type { ZoneForecast } from '../domain/model/risk';
import { ForecastRepository } from '../domain/repository/repositories';
import { COMPARE_MAX, CompareStore } from './compare.store';

const FALLBACK = (zoneId: string): ZoneForecast => ({
  zoneId,
  source: 'fallback',
  reason: 'model_error',
  generatedAt: '2026-11-03T15:00:00Z',
  current: { score: 10, level: 'low' },
});

function setup(forecast = (id: string) => of(FALLBACK(id))) {
  const repository = { forecast: vi.fn(forecast) };
  TestBed.configureTestingModule({ providers: [{ provide: ForecastRepository, useValue: repository }] });
  return { store: TestBed.inject(CompareStore), repository };
}

describe('CompareStore', () => {
  it('builds a comparison of up to 3, without repeating a zone', () => {
    const { store } = setup();
    expect(COMPARE_MAX).toBe(3);
    expect(store.add('pasto')).toBe('added');
    expect(store.add('pasto')).toBe('present');
    expect(store.add('ipiales')).toBe('added');
    expect(store.add('tumaco')).toBe('added');
    expect(store.ids()).toEqual(['pasto', 'ipiales', 'tumaco']);
    expect(store.full()).toBe(true);
  });

  it('keeps the zone that did not fit and adds it once there is room', () => {
    const { store } = setup();
    ['pasto', 'ipiales', 'tumaco'].forEach((id) => store.add(id));
    expect(store.add('cumbal')).toBe('full');
    expect(store.pending()).toBe('cumbal');
    expect(store.ids()).not.toContain('cumbal');

    store.remove('ipiales');
    expect(store.ids()).toEqual(['pasto', 'tumaco']);
    expect(store.full()).toBe(false);
    expect(store.add('cumbal')).toBe('added');
    expect(store.pending()).toBeNull();
    expect(store.ids()).toEqual(['pasto', 'tumaco', 'cumbal']);
  });

  it('asks for each forecast once and keeps it for 10 minutes', () => {
    const { store, repository } = setup();
    store.add('pasto');
    expect(store.forecasts()['pasto']).toEqual({ status: 'ready', forecast: FALLBACK('pasto') });
    store.loadForecast('pasto');
    expect(repository.forecast).toHaveBeenCalledTimes(1);
  });

  it('says it is loading, and asks again after a failure', () => {
    const answer = new Subject<ZoneForecast>();
    const { store, repository } = setup(() => answer);
    store.add('pasto');
    expect(store.forecasts()['pasto']).toEqual({ status: 'loading' });
    store.loadForecast('pasto'); // still on its way: not asked twice
    expect(repository.forecast).toHaveBeenCalledTimes(1);
    answer.error(new Error('offline'));
    expect(store.forecasts()['pasto']).toEqual({ status: 'error' });
    store.loadForecast('pasto');
    expect(repository.forecast).toHaveBeenCalledTimes(2);
  });
});
