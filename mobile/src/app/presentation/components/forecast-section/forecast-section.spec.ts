import { TestBed } from '@angular/core/testing';
import type { ZoneForecast } from '../../../domain/model/risk';
import { SettingsStore } from '../../../state/settings.store';
import type { ForecastStatus } from '../../../state/zones.store';
import { ForecastSection, fallbackReasonKey } from './forecast-section';

const MODEL: ZoneForecast = {
  zoneId: 'el-rosario',
  source: 'model',
  modelVersion: '1.0.0',
  generatedAt: '2026-10-18T15:00:00Z',
  horizons: [
    { hours: 24, baseDate: '2026-10-18', probability: 0.528, score: 53, level: 'high' },
    { hours: 48, baseDate: '2026-10-19', probability: 0.452, score: 45, level: 'medium' },
    { hours: 72, baseDate: '2026-10-20', probability: 0.004, score: 0, level: 'low' },
  ],
};

const FALLBACK: ZoneForecast = {
  zoneId: 'pasto',
  source: 'fallback',
  reason: 'hotspot_history_incomplete',
  generatedAt: '2026-10-18T15:00:00Z',
  current: { score: 37, level: 'medium' },
};

function render(forecast: ZoneForecast | null, status: ForecastStatus) {
  const fixture = TestBed.createComponent(ForecastSection);
  fixture.componentRef.setInput('forecast', forecast);
  fixture.componentRef.setInput('status', status);
  const retries = vi.fn();
  fixture.componentInstance.retry.subscribe(retries);
  fixture.detectChanges();
  return { host: fixture.nativeElement as HTMLElement, retries };
}

const text = (host: HTMLElement, selector: string): string[] =>
  [...host.querySelectorAll(selector)].map((el) => el.textContent!.replace(/\s+/g, ' ').trim());

/** First class of each child of .forecast-body: all of them share one grid cell (forecast-section.css). */
const bodyChildren = (host: HTMLElement): string[] =>
  [...host.querySelector('.forecast-body')!.children].map((el) => el.classList[0]!);

/** Entry step (--i) of each element: 0.1 s apart (theme/animations.css). */
const steps = (host: HTMLElement, selector: string): string[] =>
  [...host.querySelectorAll<HTMLElement>(selector)].map((el) => el.style.getPropertyValue('--i').trim());

describe('ForecastSection', () => {
  it('shows the 24, 48 and 72 h rows with level, bar and percentage', () => {
    const { host } = render(MODEL, 'ready');
    expect(text(host, 'h3')).toEqual(['Pronóstico 72 h']);
    expect(text(host, '.forecast-rows .forecast-when b')).toEqual(['24 h', '48 h', '72 h']);
    expect(text(host, '.forecast-rows .forecast-row app-risk-badge')).toEqual(['Alto', 'Medio', 'Bajo']);
    expect(text(host, '.forecast-value')).toEqual(['53 %', '45 %', '<1 %']);
    const bars = [...host.querySelectorAll<HTMLElement>('.forecast-rows .forecast-track span')].map((bar) => parseFloat(bar.style.width));
    expect(bars).toHaveLength(3);
    [52.8, 45.2, 0.4].forEach((width, i) => expect(bars[i]).toBeCloseTo(width, 6));
    expect(host.querySelector('.forecast-rows .forecast-row')!.classList).toContain('risk-high');
    expect(host.querySelector('.forecast-sizer')!.classList).not.toContain('is-loading');
  });

  it('says it is an estimate', () => {
    expect(text(render(MODEL, 'ready').host, '.forecast-note')[0]).toContain('estimación');
  });

  // The note was a second child of the body, so it fell in the sizer's cell on top of the 24 h row.
  it('keeps the note under the rows, inside the one child of the body, in Spanish and English', async () => {
    const { host } = render(MODEL, 'ready');
    expect(bodyChildren(host)).toEqual(['forecast-sizer', 'forecast-model']);
    expect([...host.querySelector('.forecast-model')!.children].map((el) => el.classList[0])).toEqual(['forecast-rows', 'forecast-note']);

    await TestBed.inject(SettingsStore).update({ language: 'en' });
    const english = render(MODEL, 'ready').host;
    expect(bodyChildren(english)).toEqual(['forecast-sizer', 'forecast-model']);
    expect(text(english, '.forecast-model > .forecast-rows + .forecast-note')[0]).toContain('model estimate');
  });

  it('puts the loading, fallback and error states in a single child of the body too', () => {
    expect(bodyChildren(render(null, 'loading').host)).toEqual(['forecast-sizer']);
    expect(bodyChildren(render(FALLBACK, 'ready').host)).toEqual(['forecast-sizer', 'forecast-state']);
    expect(bodyChildren(render(null, 'error').host)).toEqual(['forecast-sizer', 'forecast-state']);
  });

  it('brings the rows in 0.1 s apart, each bar after its row, and the note last', () => {
    const { host } = render(MODEL, 'ready');
    expect(steps(host, '.forecast-rows .forecast-row.anim-up')).toEqual(['0', '1', '2']);
    expect(steps(host, '.forecast-rows .forecast-track .anim-growx')).toEqual(['1', '2', '3']);
    expect(steps(host, '.forecast-model .forecast-note.anim-up')).toEqual(['3']);
  });

  it('explains the fallback in Spanish and shows the current risk, without buttons', () => {
    const { host } = render(FALLBACK, 'ready');
    expect(text(host, '.is-fallback p')).toEqual([
      'Pronóstico no disponible: faltan días recientes de focos de calor. Mostramos el riesgo actual.',
    ]);
    expect(text(host, '.forecast-current app-risk-badge')).toEqual(['Medio']);
    expect(text(host, '.forecast-current b')).toEqual(['37']);
    expect(host.querySelector('.forecast-rows')).toBeNull();
    expect(host.querySelectorAll('button').length).toBe(0);
  });

  it('offers a retry that works when the request failed', () => {
    const { host, retries } = render(null, 'error');
    expect(text(host, '.is-error p')).toEqual(['No pudimos cargar el pronóstico.']);
    host.querySelector<HTMLButtonElement>('.is-error button')!.click();
    expect(retries).toHaveBeenCalledTimes(1);
  });

  it('names a fallback reason this app does not know, or a missing one, in general words', () => {
    expect(fallbackReasonKey('model_error')).toBe('forecast.reason.modelError');
    expect(fallbackReasonKey('new_backend_reason')).toBe('forecast.reason.unknown');
    expect(fallbackReasonKey(undefined)).toBe('forecast.reason.unknown');
    const unknown = { ...FALLBACK, reason: 'new_backend_reason' } as unknown as ZoneForecast;
    expect(text(render(unknown, 'ready').host, '.is-fallback p')).toEqual([
      'Pronóstico no disponible: el modelo no está disponible. Mostramos el riesgo actual.',
    ]);
  });

  it('keeps the three rows as placeholders while it loads', () => {
    const { host } = render(null, 'loading');
    expect(host.querySelector('[role="status"]')!.getAttribute('aria-label')).toBe('Calculando el pronóstico…');
    expect(host.querySelector('.forecast-sizer')!.classList).toContain('is-loading');
    expect(text(host, '.forecast-sizer .forecast-when b')).toEqual(['24 h', '48 h', '72 h']);
    expect(host.querySelectorAll('.forecast-sizer .forecast-track.skeleton').length).toBe(3);
    expect(host.querySelector('.forecast-sizer .forecast-note .skeleton-text')).not.toBeNull();
    expect(host.querySelector('.forecast-rows')).toBeNull();
  });
});
