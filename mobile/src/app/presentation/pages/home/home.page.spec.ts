import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ZoneRiskSummary } from '../../../domain/model/risk';
import { FavoritesStore } from '../../../state/favorites.store';
import { SettingsStore } from '../../../state/settings.store';
import { ZonesStore } from '../../../state/zones.store';
import { HomePage } from './home.page';

const ZONES: ZoneRiskSummary[] = [
  { id: 'ipiales', name: 'Ipiales', latitude: 0.83, longitude: -77.64, score: 41, level: 'medium' },
  { id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 62, level: 'high' },
];

function render(favoriteIds: string[] = []) {
  const store = {
    zones: signal(ZONES),
    hotspots: signal([]),
    loading: signal(false),
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
    host.querySelector<HTMLButtonElement>('.zone')!.click();
    expect(store.select).toHaveBeenCalledWith('pasto');
    expect(navigate).toHaveBeenCalledWith('/map');
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
    expect(step(withFavorites.querySelector('.note'))).toBe('7');

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

  it('opens Ajustes from the gear of the header', () => {
    const { host, navigate } = render();
    const gear = host.querySelector<HTMLButtonElement>('.head .settings-button')!;
    expect(gear.getAttribute('aria-label')).toBe('Ajustes');
    gear.click();
    expect(navigate).toHaveBeenCalledWith('/settings');
  });
});
