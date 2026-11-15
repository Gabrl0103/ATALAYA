import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Haptic } from '../../../core/haptics';
import type { ZoneRiskSummary } from '../../../domain/model/risk';
import { FavoritesStore } from '../../../state/favorites.store';
import { SettingsStore } from '../../../state/settings.store';
import { ZonesStore } from '../../../state/zones.store';
import { HomePage } from './home.page';

const ZONES: ZoneRiskSummary[] = [
  { id: 'ipiales', name: 'Ipiales', latitude: 0.83, longitude: -77.64, score: 41, level: 'medium' },
  { id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 62, level: 'high' },
];

function render(favoriteIds: string[] = [], zones: ZoneRiskSummary[] = ZONES, loading = false) {
  const store = {
    zones: signal(zones),
    hotspots: signal([]),
    loading: signal(loading),
    error: signal<string | null>(null),
    load: vi.fn(),
    select: vi.fn(),
  };
  const favorites = { ids: signal(favoriteIds) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ZonesStore, useValue: store },
      { provide: FavoritesStore, useValue: favorites },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(HomePage);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, store, navigate, favorites };
}

/** Entry step (--i) of an element: 0.1 s apart (theme/animations.css). */
const step = (el: Element | null | undefined): string => (el as HTMLElement).style.getPropertyValue('--i').trim();

describe('HomePage', () => {
  it('lists the riskiest zones first', () => {
    const { host } = render();
    const names = [...host.querySelectorAll('.zone h3')].map((el) => el.textContent?.trim());
    expect(names).toEqual(['Pasto', 'Ipiales']);
  });

  it('opens the zone sheet on the map when a card is tapped', () => {
    const { host, store, navigate } = render();
    const tap = vi.spyOn(TestBed.inject(Haptic), 'tap').mockImplementation(() => undefined);
    host.querySelector<HTMLButtonElement>('.zone')!.click();
    expect(store.select).toHaveBeenCalledWith('pasto');
    expect(navigate).toHaveBeenCalledWith('/map');
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('shows «Mis municipios» above the riskiest zones, skipping favorites that no longer exist', () => {
    const { host, store, navigate } = render(['ipiales', 'borrado']);
    expect([...host.querySelectorAll('h2')].map((el) => el.textContent?.trim())).toEqual(['Mis municipios', 'Zonas con mayor riesgo']);
    const cards = host.querySelectorAll<HTMLButtonElement>('.favorites .zone');
    expect([...cards].map((card) => card.querySelector('h3')?.textContent?.trim())).toEqual(['Ipiales']);
    expect(cards[0]!.querySelector('.favorite-mark')).not.toBeNull();
    expect(cards[0]!.querySelectorAll('button').length).toBe(0); // the heart only marks it

    cards[0]!.click();
    expect(store.select).toHaveBeenCalledWith('ipiales');
    expect(navigate).toHaveBeenCalledWith('/map');
  });

  // jsdom has no Web Animations, so animate.leave removes at once here (the browser shrinks it first).
  it('takes out a removed favorite, and the whole section with the last one', () => {
    const { fixture, host, favorites } = render(['ipiales', 'pasto']);
    favorites.ids.set(['pasto']);
    fixture.detectChanges();
    expect([...host.querySelectorAll('.favorites .zone h3')].map((el) => el.textContent?.trim())).toEqual(['Pasto']);

    favorites.ids.set([]);
    fixture.detectChanges();
    expect(host.querySelector('.my-zones')).toBeNull();
    expect([...host.querySelectorAll('h2')].map((el) => el.textContent?.trim())).toEqual(['Zonas con mayor riesgo']);
  });

  it('brings «Zonas con mayor riesgo» in after «Mis municipios» when there are favorites', () => {
    const topTitle = (host: HTMLElement) => [...host.querySelectorAll('h2')].at(-1);
    const withFavorites = render(['ipiales']).host;
    expect(step(withFavorites.querySelector('.my-zones h2'))).toBe('2');
    expect(step(withFavorites.querySelector('.favorites .zone'))).toBe('3');
    expect(step(topTitle(withFavorites))).toBe('4');
    expect([...withFavorites.querySelectorAll('.carousel:not(.favorites) .zone')].map(step)).toEqual(['5', '6']);
    expect(step(withFavorites.querySelector('.how-link'))).toBe('7');
    expect(withFavorites.querySelector('.note')).toBeNull();

    TestBed.resetTestingModule();
    const withoutFavorites = render().host;
    expect(step(topTitle(withoutFavorites))).toBe('2');
    expect([...withoutFavorites.querySelectorAll('.zone')].map(step)).toEqual(['3', '4']);
  });

  it('leaves «Mis municipios» out when there are no favorites', () => {
    const { host } = render(['borrado']);
    expect(host.querySelector('.favorites')).toBeNull();
    expect(host.textContent).not.toContain('Mis municipios');
  });

  it('switches to English at once when the language changes', async () => {
    const { fixture, host } = render();
    expect(host.querySelector('h1')?.textContent).toBe('Nariño hoy');
    await TestBed.inject(SettingsStore).update({ language: 'en' });
    fixture.detectChanges();
    expect(host.querySelector('h1')?.textContent).toBe('Nariño today');
    expect([...host.querySelectorAll('h2')].map((el) => el.textContent?.trim())).toEqual(['Highest-risk areas']);
    expect(host.querySelector('.zone p')?.textContent).toBe('62 of 100');
    expect(host.querySelector('.average strong')?.textContent).toBe('High'); // average 52
    expect(host.querySelector('.zone .badge')?.textContent).toBe('High');
  });

  it('waits with a skeleton shaped like the summary and the carousel, without the real content', () => {
    const { host } = render([], [], true);
    const skeleton = host.querySelector('.home-skeleton');
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton?.querySelectorAll('.summary .stat-tile')).toHaveLength(2);
    expect(skeleton?.querySelectorAll('.carousel .zone')).toHaveLength(3);
    expect(host.querySelector('.loading-note')?.getAttribute('role')).toBe('status');
    expect(host.querySelector('.loading-note')?.textContent?.trim()).toBe('Cargando datos…');
    expect(host.querySelector('app-state-message')).toBeNull();
  });

  it('names a failure with an icon and asks for the zones again', () => {
    const { fixture, host, store } = render([], [], false);
    store.load.mockClear();
    store.error.set('network');
    fixture.detectChanges();
    const message = host.querySelector('app-state-message');
    expect(message?.getAttribute('role')).toBe('alert');
    expect(message?.textContent).toContain('Revisa tu conexión a internet');
    message?.querySelector<HTMLButtonElement>('button')?.click();
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it('says there is no data yet when the zone list arrived empty', () => {
    const { host } = render([], [], false);
    const message = host.querySelector('app-state-message');
    expect(message?.textContent).toContain('Todavía no hay datos de riesgo');
    expect(message?.querySelector('button')).toBeNull();
  });

  it('opens Ajustes from the gear of the header', () => {
    const { host, navigate } = render();
    const gear = host.querySelector<HTMLButtonElement>('.head .settings-button')!;
    expect(gear.getAttribute('aria-label')).toBe('Ajustes');
    gear.click();
    expect(navigate).toHaveBeenCalledWith('/settings');
  });
});
