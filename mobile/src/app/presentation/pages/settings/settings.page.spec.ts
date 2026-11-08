import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { PermissionState } from '@capacitor/core';
import { of } from 'rxjs';
import { NOTIFIER } from '../../../core/alerts/notifier';
import { fakeNotifier } from '../../../core/alerts/notifier.testing';
import { OnboardingFlag } from '../../../core/onboarding-flag';
import type { ZoneRiskSummary } from '../../../domain/model/risk';
import { ForecastRepository } from '../../../domain/repository/repositories';
import { FAVORITES_STORAGE, FavoritesStore } from '../../../state/favorites.store';
import { SettingsStore } from '../../../state/settings.store';
import { ZonesStore } from '../../../state/zones.store';
import { SettingsPage, placeThumbs } from './settings.page';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const PASTO: ZoneRiskSummary = { id: 'pasto', name: 'Pasto', latitude: 1.21, longitude: -77.28, score: 62, level: 'high' };

/** `answer` is what the notification permission dialog says. */
function render(savedFavorites: string | null = null, answer: PermissionState = 'granted') {
  // What LocalAlerts reads of the zones too: Pasto in Alto, just loaded.
  const zones = {
    clearCache: vi.fn(),
    zones: signal([PASTO]),
    updatedAt: signal(new Date()),
    loading: signal(false),
    load: vi.fn(),
    select: vi.fn(),
  };
  const notifier = fakeNotifier(answer);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ZonesStore, useValue: zones },
      { provide: FAVORITES_STORAGE, useValue: { read: async () => savedFavorites, write: async () => undefined } },
      { provide: NOTIFIER, useValue: notifier },
      { provide: ForecastRepository, useValue: { forecast: () => of() } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SettingsPage);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const settings = TestBed.inject(SettingsStore);
  const radios = (group: string) => [...host.querySelectorAll<HTMLButtonElement>(`[aria-labelledby="${group}"] [role="radio"]`)];
  const checked = (group: string) => radios(group).filter((b) => b.getAttribute('aria-checked') === 'true').map(text);
  return { fixture, host, settings, navigate, radios, checked, zones, notifier };
}

/** Lets the switch's promises (permission, saving, first check) finish and draws again. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  for (let i = 0; i < 3; i++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

describe('SettingsPage', () => {
  it('starts on the defaults and goes back to Inicio', () => {
    const { host, navigate, checked } = render();
    expect(text(host.querySelector('h1'))).toBe('Ajustes');
    expect(checked('language-title')).toEqual(['Automático']);
    expect(checked('temperature-label')).toEqual(['°C']);
    expect(checked('wind-label')).toEqual(['km/h']);
    expect(host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
    host.querySelector<HTMLButtonElement>('.back')!.click();
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('switches the whole screen to English at once and saves the choice', async () => {
    const { fixture, host, settings, radios, checked } = render();
    radios('language-title')[2]!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(settings.language()).toBe('en');
    expect(text(host.querySelector('h1'))).toBe('Settings');
    expect(checked('language-title')).toEqual(['English']);
    expect(host.querySelector('.back')!.getAttribute('aria-label')).toBe('Back');
  });

  it('changes the units and the vibration', async () => {
    const { fixture, host, settings, radios } = render();
    radios('temperature-label')[1]!.click();
    radios('wind-label')[1]!.click();
    host.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(settings.settings()).toMatchObject({ temperature: 'f', wind: 'mph', haptics: false });
    expect(host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false');
  });

  it('reduces the motion of the whole app', async () => {
    const { fixture, settings, radios, checked } = render();
    expect(checked('motion-title')).toEqual(['Automático']);
    radios('motion-title')[1]!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(settings.motion()).toBe('reduced');
    expect(checked('motion-title')).toEqual(['Reducido']);
  });

  it('brings each row in after its card, 0.1 s apart', () => {
    const { host } = render();
    const steps = (selector: string) =>
      [...host.querySelectorAll<HTMLElement>(selector)].map((el) => el.style.getPropertyValue('--i').trim());
    expect(steps('[aria-labelledby="language-title"] > .segmented.anim-up')).toEqual(['2']);
    expect(steps('[aria-labelledby="units-title"] > .row.anim-up')).toEqual(['3', '4']);
    expect(steps('[aria-labelledby="motion-title"] > .segmented.anim-up')).toEqual(['4']);
    expect(steps('[aria-labelledby="data-title"] > .row.anim-up')).toEqual(['6', '7']);
  });

  it('keeps each option named once, with its dark copy only for the pill', () => {
    const { radios } = render();
    expect(radios('language-title').map(text)).toEqual(['Automático', 'Español', 'English']);
    expect(radios('language-title').map((button) => button.dataset['label'])).toEqual(['Automático', 'Español', 'English']);
  });

  it('leaves the pill unplaced while the options are not laid out: the chosen one keeps its background', () => {
    const { host } = render();
    expect(host.querySelectorAll('.segmented-thumb').length).toBe(4);
    expect(host.querySelector('.segmented.has-thumb')).toBeNull();
  });

  it('slides the pill under the chosen option, its first place without sliding', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="segmented"><span class="segmented-thumb"></span><button aria-checked="false"></button><button aria-checked="true"></button></div>';
    const layout = (el: Element, left: number, width: number) =>
      Object.defineProperties(el, {
        offsetLeft: { value: left, configurable: true },
        offsetTop: { value: 4 },
        offsetWidth: { value: width },
        offsetHeight: { value: 44 },
      });
    const [first, second] = root.querySelectorAll('button');
    layout(first!, 4, 109); // «Automático» is wider than the others
    layout(second!, 117, 90);
    const group = root.querySelector('.segmented')!;
    const thumb = root.querySelector<HTMLElement>('.segmented-thumb')!;

    placeThumbs(root);
    expect(thumb.style.transform).toBe('translateX(117px)');
    expect([thumb.style.top, thumb.style.width, thumb.style.height]).toEqual(['4px', '90px', '44px']);
    expect(group.classList).toContain('has-thumb');

    second!.setAttribute('aria-checked', 'false');
    first!.setAttribute('aria-checked', 'true');
    placeThumbs(root);
    expect(thumb.style.transform).toBe('translateX(4px)');
    expect(thumb.style.width).toBe('109px');
  });

  describe('Alertas', () => {
    const card = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-labelledby="alerts-title"]')!;
    const toggle = (host: HTMLElement) => card(host).querySelector<HTMLButtonElement>('[role="switch"]')!;

    it('explains them, and does not let them on, without favorites', async () => {
      const { fixture, host } = render();
      await settle(fixture);
      expect(toggle(host).disabled).toBe(true);
      expect(toggle(host).getAttribute('aria-checked')).toBe('false');
      expect(text(card(host).querySelector('.hint'))).toBe('Marca municipios con el corazón de su hoja para recibir alertas de ellos.');
      expect(text(card(host).querySelector('.limits'))).toContain('con la app cerrada no llegan');
    });

    it('asks for the permission only after explaining it, and then warns about a favorite in Alto', async () => {
      const { fixture, host, settings, notifier } = render('["pasto"]');
      await settle(fixture);
      toggle(host).click();
      fixture.detectChanges();
      expect(notifier.requests).toBe(0); // first the explanation
      expect(text(card(host).querySelector('.confirm p'))).toContain('Atalaya te pedirá permiso para mostrar notificaciones');

      card(host).querySelector<HTMLButtonElement>('.confirm .primary')!.click();
      await settle(fixture);
      expect(notifier.requests).toBe(1);
      expect(settings.alerts()).toBe(true);
      expect(toggle(host).getAttribute('aria-checked')).toBe('true');
      expect(notifier.shown.map((n) => n.title)).toEqual(['Pasto: riesgo Alto']);
      const thresholds = [...card(host).querySelectorAll('[aria-labelledby="threshold-label"] [role="radio"]')];
      expect(thresholds.map(text)).toEqual(['Alto', 'Extremo']);
      expect(thresholds[0]!.getAttribute('aria-checked')).toBe('true');
    });

    it('goes back off and says how to allow it when the permission is denied', async () => {
      const { fixture, host, settings, notifier } = render('["pasto"]', 'denied');
      await settle(fixture);
      toggle(host).click();
      fixture.detectChanges();
      card(host).querySelector<HTMLButtonElement>('.confirm .primary')!.click();
      await settle(fixture);
      expect(settings.alerts()).toBe(false);
      expect(toggle(host).getAttribute('aria-checked')).toBe('false');
      expect(text(card(host).querySelector('.notice'))).toContain('Aplicaciones > Atalaya > Notificaciones');
      expect(notifier.shown).toEqual([]);
    });

    it('sends the test notification and changes the threshold', async () => {
      const { fixture, host, settings, notifier } = render('["pasto"]');
      await settle(fixture);
      toggle(host).click();
      fixture.detectChanges();
      card(host).querySelector<HTMLButtonElement>('.confirm .primary')!.click();
      await settle(fixture);

      const testRow = [...card(host).querySelectorAll('.row')].find((row) => text(row).includes('Probar notificación'))!;
      testRow.querySelector<HTMLButtonElement>('button')!.click();
      await settle(fixture);
      expect(notifier.shown.at(-1)?.title).toBe('Notificación de prueba');
      expect(text(testRow.querySelector('.hint'))).toBe('Enviada: revisa tus notificaciones.');

      card(host).querySelectorAll<HTMLButtonElement>('[aria-labelledby="threshold-label"] button')[1]!.click();
      await settle(fixture);
      expect(settings.alertThreshold()).toBe('extreme');
    });

    it('turns them off when the favorites are cleared', async () => {
      const { fixture, host, settings } = render('["pasto"]');
      await settle(fixture);
      await settings.update({ alerts: true });
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[aria-labelledby="data-title"] .row .action')!.click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[aria-labelledby="data-title"] .confirm .danger')!.click();
      await settle(fixture);
      expect(settings.alerts()).toBe(false);
    });
  });

  it('opens «Cómo funciona» from Acerca de, without the model metrics', () => {
    const { host, navigate } = render();
    expect(host.querySelector('.about .model-summary')).toBeNull();
    host.querySelector<HTMLButtonElement>('.about .how-row button')!.click();
    expect(navigate).toHaveBeenCalledWith('/how-it-works');
  });

  it('asks before clearing the favorites, in the same row', async () => {
    const { fixture, host } = render('["pasto","tumaco"]');
    const favorites = TestBed.inject(FavoritesStore);
    await favorites.load();
    fixture.detectChanges();
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('[aria-labelledby="data-title"] button')];
    expect(text(host.querySelector('[aria-labelledby="data-title"] .row .hint'))).toBe('2 municipios guardados');

    buttons()[0]!.click(); // «Borrar»
    fixture.detectChanges();
    expect(text(host.querySelector('.confirm p'))).toBe('¿Borrar tus 2 municipios favoritos?');
    host.querySelector<HTMLButtonElement>('.confirm .action:not(.danger)')!.click(); // «Cancelar»
    fixture.detectChanges();
    expect(favorites.ids()).toEqual(['pasto', 'tumaco']);

    buttons()[0]!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.confirm .danger')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(favorites.ids()).toEqual([]);
    expect(text(host.querySelector('[aria-labelledby="data-title"] .row .hint'))).toBe('Ningún municipio guardado');
  });

  it('clears the data cache and says it is done', () => {
    const { fixture, host, zones } = render();
    const clearCache = zones.clearCache;
    const rows = host.querySelectorAll('[aria-labelledby="data-title"] .row');
    rows[1]!.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(text(rows[1]!.querySelector('.hint'))).toBe('Listo: se volverán a pedir.');
  });

  it('opens the introduction again without clearing anything', () => {
    const { host } = render();
    const onboarding = TestBed.inject(OnboardingFlag);
    host.querySelector<HTMLButtonElement>('[aria-labelledby="help-title"] button')!.click();
    expect(onboarding.replayRequested()).toBe(true);
  });

  it('shows the version, how the risk is calculated and every source with its license', () => {
    const { host } = render();
    const about = host.querySelector('[aria-labelledby="about-title"]')!;
    expect(text(about.querySelector('.version'))).toBe('Versión 0.30.0');
    expect(text(about)).toContain('clima seco (50 %)');
    expect(text(about)).toContain('Es un indicador, no una predicción exacta.');
    expect([...about.querySelectorAll('.sources b')].map(text)).toEqual([
      'NASA FIRMS', 'Open-Meteo', 'ERA5 · Copernicus', 'NASA POWER', 'Gobernación de Nariño', 'OpenStreetMap',
    ]);
    expect(text(about)).toContain('Weather data by Open-Meteo.com');
    expect(text(about)).toContain('ODbL');
    expect(text(about)).toContain('Sin licencia abierta declarada.');
    expect(text(about)).toContain(`Copernicus ${new Date().getFullYear()}`);
    // UNGRD and DANE, with DANE's citation word for word.
    expect(text(host.querySelector('app-data-attribution'))).toContain('Fuente: Departamento Administrativo Nacional de Estadística');
  });

  it('says which language «Automático» is using', () => {
    const { host } = render();
    expect(text(host.querySelector('.hint'))).toBe('Usa el idioma del teléfono: Español.');
  });
  it('has «¿Ves fuego? Avisa» with the call buttons, between Alertas and Datos', () => {
    const { host } = render();
    const card = host.querySelector('app-emergency-help')!;
    expect(card.querySelector('[role="heading"]')!.getAttribute('aria-level')).toBe('2');
    expect([...card.querySelectorAll('a.call')].map((a) => a.getAttribute('href'))).toEqual(['tel:123', 'tel:119', 'tel:132', 'tel:144']);
    expect(card.previousElementSibling!.getAttribute('aria-labelledby')).toBe('alerts-title');
    expect(card.nextElementSibling!.getAttribute('aria-labelledby')).toBe('data-title');
  });
});
