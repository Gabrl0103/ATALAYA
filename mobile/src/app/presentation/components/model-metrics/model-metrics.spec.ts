import { TestBed } from '@angular/core/testing';
import { MODEL_METRICS, parseModelMetrics, type ModelMetrics } from '../../../domain/model/model-metrics';
import { SettingsStore } from '../../../state/settings.store';
import { ModelMetricsCard } from './model-metrics';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** The text of each child, with a space between them (the template has none). */
const parts = (el: Element | null | undefined): string => [...(el?.children ?? [])].map(text).join(' ');

function render(metrics?: ModelMetrics) {
  if (metrics) TestBed.configureTestingModule({ providers: [{ provide: MODEL_METRICS, useValue: metrics }] });
  const fixture = TestBed.createComponent(ModelMetricsCard);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('ModelMetricsCard', () => {
  it('shows the real metrics with the adjusted Open-Meteo weather, each with its reference line', () => {
    const { host } = render();
    expect(text(host.querySelector('.model'))).toBe('Regresión logística · v1.0.0');
    expect([...host.querySelectorAll('.periods li')].map(text)).toEqual([
      'Entrenado con 1 ene 2019 – 31 dic 2023.',
      'Calibrado con 1 ene 2024 – 31 dic 2024.',
      'Evaluado con datos que no vio: 1 ene 2025 – 29 sept 2026.',
      '40.176 días-municipio evaluados.',
    ]);
    const metrics = [...host.querySelectorAll('.metric')];
    expect(metrics.map((m) => parts(m.querySelector('.metric-head')))).toEqual(['ROC-AUC 0,842', 'PR-AUC 0,496', 'Brier 0,100']);
    expect(metrics.map((m) => text(m.querySelector('.marker-label')))).toEqual(['Azar 0,5', 'Tasa base 15,6 %', 'Tasa base 0,131']);
    const fills = metrics.map((m) => parseFloat(m.querySelector<HTMLElement>('.fill')!.style.width));
    expect(fills[0]).toBeCloseTo(84.24, 6);
    expect(fills[1]).toBeCloseTo(49.6, 6);
    // Brier against the base rate's: its bar is shorter than the base rate's line.
    expect(fills[2]).toBeLessThan(parseFloat(metrics[2]!.querySelector<HTMLElement>('.marker')!.style.left));
    expect(text(host)).toContain('Tasa base: 15,6 % de los días-municipio evaluados tuvieron al menos un foco.');
    expect(text(host)).toContain('ROC-AUC 0,853 · PR-AUC 0,512 · Brier 0,100');
  });

  it('names the variables that weigh most with their real names, translated', async () => {
    const { fixture, host } = render();
    const names = () => [...host.querySelectorAll('.factor-list .metric-head span')].map(text);
    expect(names()).toEqual([
      'Historial: días con focos al año (2015–2018)',
      'Humedad del día',
      'Balance de agua de 30 días',
      'Humedad de 7 días',
      'Focos a 25–50 km en 30 días',
      'Evapotranspiración',
    ]);
    expect(text(host.querySelector('.factor-list b'))).toBe('+1,23');
    expect(text(host.querySelectorAll('.factor-list small')[1])).toBe('baja la probabilidad');

    await TestBed.inject(SettingsStore).update({ language: 'en' });
    fixture.detectChanges();
    expect(names()[1]).toBe('Humidity on the day');
    expect(text(host.querySelector('.metric .marker-label'))).toBe('Chance 0.5');
  });

  it('leaves out what the file does not have', () => {
    const { host } = render(parseModelMetrics({ version: '1.0.0', evaluation: { openMeteoMapped: { rocAuc: 0.8 } } }));
    expect([...host.querySelectorAll('.metric .metric-head span')].map(text)).toEqual(['ROC-AUC']);
    expect(host.querySelector('.periods')).toBeNull();
    expect(host.querySelector('.factor-list')).toBeNull();
    expect(text(host)).not.toContain('Tasa base');
    expect(text(host)).not.toContain('NASA POWER');
  });

  it('says so when there are no metrics at all', () => {
    const { host } = render(parseModelMetrics(null));
    expect(text(host.querySelector('.note'))).toBe('Las métricas del modelo no están en esta versión de la app.');
    expect(host.querySelector('.metric')).toBeNull();
  });
});
