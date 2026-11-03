import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { ZoneForecast, ZoneRiskSummary } from '../../../domain/model/risk';
import { ForecastRepository } from '../../../domain/repository/repositories';
import { CompareStore } from '../../../state/compare.store';
import { ZonesStore } from '../../../state/zones.store';
import { ComparePage } from './compare.page';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const ZONES: ZoneRiskSummary[] = [
  {
    id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 42, level: 'medium',
    factors: { dryWeather: 40, nearbyHotspots: 20, fireHistory: 60 },
    weather: { temperatureC: 14, humidityPct: 80, windKmh: 9, daysWithoutRain: 2 },
  },
  { id: 'tumaco', name: 'Tumaco', latitude: 1.8, longitude: -78.79, score: 61, level: 'high' },
  { id: 'ipiales', name: 'Ipiales', latitude: 0.83, longitude: -77.64, score: 12, level: 'low' },
];

const forecast = (zoneId: string): ZoneForecast =>
  zoneId === 'pasto'
    ? {
        zoneId, source: 'model', modelVersion: '1.0.0', generatedAt: '2026-11-03T15:00:00Z',
        horizons: [
          { hours: 24, baseDate: '2026-11-03', probability: 0.528, score: 53, level: 'high' },
          { hours: 48, baseDate: '2026-11-04', probability: 0.452, score: 45, level: 'medium' },
          { hours: 72, baseDate: '2026-11-05', probability: 0.004, score: 0, level: 'low' },
        ],
      }
    : { zoneId, source: 'fallback', reason: 'weather_unavailable', generatedAt: '2026-11-03T15:00:00Z', current: { score: 61, level: 'high' } };

function render(ids: string[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ZonesStore, useValue: { zones: signal(ZONES), loading: signal(false), load: vi.fn() } },
      { provide: ForecastRepository, useValue: { forecast: (id: string) => of(forecast(id)) } },
    ],
  });
  const compare = TestBed.inject(CompareStore);
  ids.forEach((id) => compare.add(id));
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ComparePage);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const row = (label: string) => [...host.querySelectorAll('.row')].find((r) => text(r.querySelector('.row-label')) === label)!;
  const values = (label: string) => [...row(label).querySelectorAll('.cell .mono')].map(text);
  return { fixture, host, compare, navigate, row, values };
}

describe('ComparePage', () => {
  it('starts empty with a button that opens the picker, never a dead one', () => {
    const { fixture, host } = render();
    expect(text(host.querySelector('.empty p'))).toContain('Elige 2 o 3 municipios');
    host.querySelector<HTMLButtonElement>('.empty .action')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.picker app-search-box')).not.toBeNull();
  });

  it('adds from the picker and shows the zones side by side, the riskiest highlighted', () => {
    const { fixture, host, compare, row, values } = render(['pasto']);
    expect(text(host.querySelector('.hint'))).toBe('Agrega otro municipio para comparar.');
    host.querySelector<HTMLButtonElement>('.add')!.click();
    fixture.detectChanges();
    const input = host.querySelector<HTMLInputElement>('.picker input')!;
    input.value = 'Tumaco';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.picker .result')!.click();
    fixture.detectChanges();

    expect(compare.ids()).toEqual(['pasto', 'tumaco']);
    expect(host.querySelector('.picker')).toBeNull();
    expect([...host.querySelectorAll('.column-head b')].map(text)).toEqual(['Pasto', 'Tumaco']);
    expect(values('Puntaje (0–100)')).toEqual(['42', '61']);
    expect([...row('Puntaje (0–100)').querySelectorAll('.cell')].map((c) => c.classList.contains('is-riskiest'))).toEqual([false, true]);
    expect(values('24 h · hoy')).toEqual(['53 %', '—']);
  });

  it('shows «—» for what a zone lacks and highlights nothing with a single value', () => {
    const { values, row } = render(['pasto', 'tumaco']);
    for (const label of ['Temperatura', 'Humedad', 'Viento', 'Días sin lluvia', 'Clima seco', 'Focos cercanos', 'Historial']) {
      expect(values(label)[1], label).toBe('—');
      expect(row(label).querySelector('.is-riskiest'), label).toBeNull();
    }
  });

  it('removes a zone, back to the empty state with the last one', () => {
    const { fixture, host, compare } = render(['pasto', 'tumaco']);
    const remove = host.querySelector<HTMLButtonElement>('.column-head .round')!;
    expect(remove.getAttribute('aria-label')).toBe('Quitar Pasto de la comparación');
    remove.click();
    fixture.detectChanges();
    expect(compare.ids()).toEqual(['tumaco']);
    host.querySelector<HTMLButtonElement>('.column-head .round')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.empty')).not.toBeNull();
  });

  it('offers the zone that did not fit once there is room', () => {
    const { fixture, host, compare } = render(['pasto', 'tumaco', 'ipiales']);
    compare.add('cumbal-missing'); // full: kept as pending, but it is not a zone of the list
    compare.pending.set('ipiales');
    compare.remove('ipiales');
    fixture.detectChanges();
    const offer = host.querySelector<HTMLButtonElement>('.notice .action')!;
    expect(text(offer)).toBe('Agregar Ipiales');
    offer.click();
    fixture.detectChanges();
    expect(compare.ids()).toEqual(['pasto', 'tumaco', 'ipiales']);
  });

  it('goes back to the map when opened directly', () => {
    const { host, navigate } = render();
    host.querySelector<HTMLButtonElement>('.head .round')!.click();
    expect(navigate).toHaveBeenCalledWith('/map');
  });
});
