import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SettingsStore } from '../../../state/settings.store';
import { HowItWorksPage } from './how-it-works.page';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** The text of each child, with a space between them (the template has none). */
const parts = (el: Element | null | undefined): string => [...(el?.children ?? [])].map(text).filter(Boolean).join(' ');

function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(HowItWorksPage);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, navigate };
}

describe('HowItWorksPage', () => {
  it('walks from the sources to the map, one step after another', () => {
    const { host } = render();
    expect(text(host.querySelector('h1'))).toBe('Cómo funciona');
    const steps = [...host.querySelectorAll<HTMLElement>('.step')];
    expect(steps.map((step) => text(step.querySelector('h3')))).toEqual([
      'Fuentes',
      'Ingesta y scraping',
      'Puntaje actual (0–100)',
      'Pronóstico a 72 h',
      'Mapa y hoja de zona',
    ]);
    expect(steps.map((step) => step.style.getPropertyValue('--i').trim())).toEqual(['3', '4', '5', '6', '7']);
    expect([...host.querySelectorAll('.chips li')].map(text)).toEqual(['NASA FIRMS', 'Open-Meteo / ERA5', 'UNGRD', 'Gobernación de Nariño', 'DANE']);
    expect([...host.querySelectorAll('.weights li')].map(parts)).toEqual(['Clima seco 50 %', 'Focos cercanos 30 %', 'Historial 20 %']);
    expect(text(steps[2])).toContain('25 km o menos de la cabecera, de los últimos 5 días');
  });

  it('explains the levels, without the sections taken out', () => {
    const { host } = render();
    expect([...host.querySelectorAll('.levels li')].map(parts)).toEqual(['Bajo 0–24', 'Medio 25–49', 'Alto 50–74', 'Extremo 75–100']);
    expect(host.querySelector('[aria-labelledby="not-title"]')).toBeNull();
    expect(host.querySelector('[aria-labelledby="limits-title"]')).toBeNull();
    expect(host.querySelector('app-model-metrics')).toBeNull();
  });

  it('is in English when the app is', async () => {
    const { fixture, host } = render();
    await TestBed.inject(SettingsStore).update({ language: 'en' });
    fixture.detectChanges();
    expect(text(host.querySelector('h1'))).toBe('How it works');
    expect(text(host.querySelector('[aria-labelledby="levels-title"] h2'))).toBe('What each level means');
  });

  it('goes back to Inicio when the app started here', () => {
    const { host, navigate } = render();
    host.querySelector<HTMLButtonElement>('.back')!.click();
    expect(navigate).toHaveBeenCalledWith('/home');
    expect(host.querySelector('.back')!.getAttribute('aria-label')).toBe('Volver');
  });
});
