import { TestBed } from '@angular/core/testing';
import type { ZoneDetail, ZoneRiskSummary } from '../../../domain/model/risk';
import { SettingsStore } from '../../../state/settings.store';
import { ZoneSheet } from './zone-sheet';

const text = (host: HTMLElement, selector: string): string[] =>
  [...host.querySelectorAll(selector)].map((el) => el.textContent!.replace(/\s+/g, ' ').trim());

const DETAIL: ZoneDetail = {
  id: 'pasto',
  name: 'Pasto',
  score: 42,
  level: 'medium',
  weather: { temperatureC: 18, humidityPct: 70, windKmh: 9, daysWithoutRain: 3 },
  factors: { dryWeather: 40, nearbyHotspots: 20, fireHistory: 60 },
};

/** What the map has of the same zone: the sheet opens with it. */
const ZONE: ZoneRiskSummary = {
  id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 42, level: 'medium', factors: DETAIL.factors,
};

function render(
  detail: ZoneDetail | null = DETAIL,
  inputs: { firesPerYear?: number | null; updatedAt?: Date | null; firesLoading?: boolean } = {},
  zone: ZoneRiskSummary = ZONE,
) {
  const fixture = TestBed.createComponent(ZoneSheet);
  fixture.componentRef.setInput('zone', zone);
  fixture.componentRef.setInput('detail', detail);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const sheet = host.querySelector<HTMLElement>('.zone-sheet')!;
  const handle = host.querySelector<HTMLButtonElement>('.sheet-handle')!;
  return { fixture, host, sheet, handle };
}

describe('ZoneSheet', () => {
  afterEach(() => vi.useRealTimers());

  it('is 85 % tall and toggles between mid and expanded from the handle', () => {
    const { fixture, sheet, handle } = render();
    expect(sheet.style.height).toBe('85%');

    handle.click();
    fixture.detectChanges();
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    expect(sheet.classList).toContain('is-expanded');
    expect(sheet.style.transform).toBe('translateY(0%)');

    handle.click();
    fixture.detectChanges();
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    expect(sheet.style.transform).toMatch(/^translateY\(47\.05/);
  });

  it('slides down before telling the page it closed', () => {
    vi.useFakeTimers();
    const { fixture, host, sheet } = render();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    host.querySelector<HTMLButtonElement>('.sheet-back')!.click();
    fixture.detectChanges();
    expect(sheet.style.transform).toBe('translateY(100%)');
    expect(closed).toBe(0);

    vi.advanceTimersByTime(400);
    expect(closed).toBe(1);
  });

  it('fills the score ring up to the score', () => {
    const { host } = render();
    const ring = host.querySelector<SVGCircleElement>('.ring-value')!;
    const total = 2 * Math.PI * 41.5;
    expect(Number(ring.style.getPropertyValue('--ring-total'))).toBeCloseTo(total, 3);
    expect(Number(ring.style.getPropertyValue('--ring-value'))).toBeCloseTo(total * 0.42, 3);
    expect(text(host, '.score-ring strong, .score-ring span')).toEqual(['42', 'Medio']);
  });

  it('lists the three factors with their weight and value', () => {
    const { host } = render();
    expect(text(host, '.factor-head > *')).toEqual([
      'Clima seco · 50 %', '40', 'Focos cercanos · 30 %', '20', 'Historial · 20 %', '60',
    ]);
    const widths = [...host.querySelectorAll<HTMLElement>('.factor-track span')].map((bar) => bar.style.width);
    expect(widths).toEqual(['40%', '20%', '60%']);
  });

  it('shows the nearby hotspots and when the newest one was detected', () => {
    const latestDetectedAt = new Date(Date.now() - 3.5 * 24 * 3_600_000).toISOString();
    const { host } = render({ ...DETAIL, hotspots: { count: 4, latestDetectedAt } });
    expect(text(host, '.hotspots-stat > *')).toEqual(['4', 'focos a menos de 25 km', 'el último, hace 3 días']);

    const none = render({ ...DETAIL, hotspots: { count: 0, latestDetectedAt: null } }).host;
    expect(text(none, '.hotspots-stat > *')).toEqual(['0', 'focos a menos de 25 km', '']); // keeps its line
  });

  it('shows the fires per year only when the records arrived', () => {
    expect(text(render(DETAIL, { firesPerYear: 2.08 }).host, '.fires-stat > *')).toEqual(['2,1', 'incendios por año']);
    const { host } = render(DETAIL, { firesPerYear: null });
    expect(host.querySelector('.fires-stat')).toBeNull();
    // Backends older than v0.20 do not send hotspots: no cards at all.
    expect(host.querySelector('.stats')).toBeNull();
  });

  it('opens with what the map has, the hotspots waiting as a placeholder', () => {
    const { fixture, host } = render(null);
    expect(text(host, '.zone-title h2')).toEqual(['Pasto']);
    expect(text(host, '.score-ring strong')).toEqual(['42']);
    expect(text(host, '.factor-head b')).toEqual(['40', '20', '60']);
    expect(host.querySelector('.stat-skeleton')).not.toBeNull();

    fixture.componentRef.setInput('detail', { ...DETAIL, hotspots: { count: 2, latestDetectedAt: null } });
    fixture.detectChanges();
    expect(host.querySelector('.stat-skeleton')).toBeNull();
    expect(text(host, '.hotspots-stat b')).toEqual(['2']);
  });

  it('keeps the factors as placeholders until the detail brings them (backends before v0.28)', () => {
    const { fixture, host } = render(null, {}, { ...ZONE, factors: undefined });
    expect(host.querySelectorAll('.factor-value-skeleton').length).toBe(3);
    expect(host.querySelectorAll('.factor-track.skeleton').length).toBe(3);

    fixture.componentRef.setInput('detail', DETAIL);
    fixture.detectChanges();
    expect(host.querySelector('.factor-value-skeleton')).toBeNull();
    expect(text(host, '.factor-head b')).toEqual(['40', '20', '60']);
  });

  it('marks the favorite with the heart and asks the page to change it', () => {
    const { fixture, host } = render();
    const heart = host.querySelector<HTMLButtonElement>('.favorite-toggle')!;
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    expect(heart.getAttribute('aria-label')).toBe('Agregar a mis municipios');
    let toggled = 0;
    fixture.componentInstance.favoriteToggled.subscribe(() => toggled++);
    heart.click();
    expect(toggled).toBe(1);

    fixture.componentRef.setInput('favorite', true);
    fixture.detectChanges();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect(heart.getAttribute('aria-label')).toBe('Quitar de mis municipios');
    expect(heart.classList).toContain('is-on');
  });

  it('beats the heart only after a tap: one animation to mark, another to unmark', () => {
    const { fixture, host } = render();
    fixture.componentRef.setInput('favorite', true);
    fixture.detectChanges();
    const heart = host.querySelector<HTMLButtonElement>('.favorite-toggle')!;
    expect(heart.classList).not.toContain('is-touched'); // opening the sheet of a favorite does not beat

    heart.click();
    fixture.componentRef.setInput('favorite', false);
    fixture.detectChanges();
    expect(heart.classList).toContain('is-touched');
    expect(heart.classList).not.toContain('is-on');
  });

  it('asks the page to compare the zone, and says when it is already compared', () => {
    const { fixture, host } = render();
    const button = host.querySelector<HTMLButtonElement>('.compare-button')!;
    expect(button.getAttribute('aria-label')).toBe('Comparar Pasto con otros municipios');
    let requested = 0;
    fixture.componentInstance.compareRequested.subscribe(() => requested++);
    button.click();
    expect(requested).toBe(1);

    fixture.componentRef.setInput('compared', true);
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Pasto ya está en la comparación: verla');
    expect(button.classList).toContain('is-on');
  });

  it('lifts the share arrow again on every tap', () => {
    const { fixture, host } = render();
    const share = host.querySelector<HTMLButtonElement>('.share-button')!;
    const lift = () => ['is-shared-a', 'is-shared-b'].filter((name) => share.classList.contains(name));
    expect(lift()).toEqual([]);
    for (const expected of ['is-shared-a', 'is-shared-b', 'is-shared-a']) {
      share.click();
      fixture.detectChanges();
      expect(lift()).toEqual([expected]);
    }
  });

  it('brings «Clima ahora» in tile by tile and then the factors, each bar after its row', () => {
    const { host } = render();
    const steps = (selector: string) =>
      [...host.querySelectorAll<HTMLElement>(selector)].map((el) => el.style.getPropertyValue('--i').trim());
    expect(steps('.weather-row .stat-tile.anim-up')).toEqual(['0', '1', '2', '3']);
    expect(steps('.factor.anim-up')).toEqual(['2', '3', '4']);
    expect(steps('.factor-track .anim-growx')).toEqual(['3', '4', '5']);
  });

  it('asks the page to share and shows its short notice', () => {
    const { fixture, host } = render();
    const share = host.querySelector<HTMLButtonElement>('.share-button')!;
    expect(share.getAttribute('aria-label')).toBe('Compartir');
    let requested = 0;
    fixture.componentInstance.shareRequested.subscribe(() => requested++);
    share.click();
    expect(requested).toBe(1);

    expect(host.querySelector('.notice-pill')).toBeNull();
    fixture.componentRef.setInput('notice', 'Copiado');
    fixture.detectChanges();
    expect(host.querySelector('.sheet-notice')!.getAttribute('role')).toBe('status');
    expect(host.querySelector('.notice-pill')?.textContent).toBe('Copiado');
  });

  it('shows «Clima ahora» in the units of Ajustes, leaving out what did not arrive', async () => {
    const { fixture, host } = render();
    const row = () => [...host.querySelectorAll('.weather-row li')].map((li) => `${li.querySelector('b')?.textContent} ${li.querySelector('small')?.textContent}`);
    expect(text(host, '.weather h3')).toEqual(['Clima ahora']);
    expect(row()).toEqual(['18 °C Temperatura', '70 % Humedad', '9 km/h Viento', '3 días sin lluvia']);

    await TestBed.inject(SettingsStore).update({ temperature: 'f', wind: 'mph', language: 'en' });
    fixture.detectChanges();
    expect(row()).toEqual(['64°F Temperature', '70% Humidity', '6 mph Wind', '3 days without rain']);

    const partial = { ...DETAIL, weather: { temperatureC: 18, daysWithoutRain: 1 } } as unknown as ZoneDetail;
    fixture.componentRef.setInput('detail', partial);
    fixture.detectChanges();
    expect(row()).toEqual(['64°F Temperature', '1 day without rain']);
  });

  it('shows «Clima ahora» at once when the zone list brings the weather', () => {
    const { host } = render(null, {}, { ...ZONE, weather: { temperatureC: 14.1, humidityPct: 97, windKmh: 3.9, daysWithoutRain: 0 } });
    expect(host.querySelector('.weather-row .skeleton-text')).toBeNull();
    const values = [...host.querySelectorAll('.weather-row b')].map((b) => b.textContent);
    expect(values).toEqual(['14 °C', '97 %', '4 km/h', '0']);
  });

  it('keeps «Clima ahora» shaped like itself until the weather arrives', () => {
    const { host } = render(null);
    expect(host.querySelector('.weather')!.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelectorAll('.weather-row .skeleton-text').length).toBe(4);
    expect(text(host, '.weather-row small')).toEqual(['Temperatura', 'Humedad', 'Viento', 'días sin lluvia']);
  });

  it('keeps the cards of hotspots and fires shaped like themselves while they load', () => {
    const { fixture, host } = render(null, { firesLoading: true });
    expect(host.querySelectorAll('.stat-skeleton').length).toBe(2);
    expect(text(host, '.hotspots-stat.stat-skeleton span')).toEqual(['focos a menos de 25 km']);

    fixture.componentRef.setInput('detail', { ...DETAIL, hotspots: { count: 1, latestDetectedAt: null } });
    fixture.componentRef.setInput('firesLoading', false);
    fixture.componentRef.setInput('firesPerYear', 2);
    fixture.detectChanges();
    expect(host.querySelectorAll('.stat-skeleton').length).toBe(0);
    expect(text(host, '.fires-stat b')).toEqual(['2']);
  });

  it('says when the data was updated', () => {
    expect(text(render(DETAIL, { updatedAt: new Date() }).host, '.zone-title p')).toEqual(['Nariño · actualizado hoy']);
    expect(text(render().host, '.zone-title p')).toEqual(['Nariño']);
  });
});
