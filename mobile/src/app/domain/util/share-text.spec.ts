import type { ZoneForecast } from '../model/risk';
import { shareText } from './share-text';

const PASTO = { name: 'Pasto', score: 20, level: 'low' } as const;
const UPDATED = new Date(2026, 9, 24, 17, 7);

const MODEL: ZoneForecast = {
  zoneId: 'pasto',
  source: 'model',
  modelVersion: '1.0.0',
  generatedAt: '2026-10-24T22:00:00Z',
  horizons: [
    { hours: 24, baseDate: '2026-10-24', probability: 0.528, score: 53, level: 'high' },
    { hours: 48, baseDate: '2026-10-25', probability: 0.452, score: 45, level: 'medium' },
    { hours: 72, baseDate: '2026-10-26', probability: 0.004, score: 0, level: 'low' },
  ],
};

describe('shareText', () => {
  it('sends the current risk, the 72 h forecast, when it was updated and the signature', () => {
    expect(shareText(PASTO, MODEL, UPDATED)).toBe(
      [
        'Pasto: riesgo de incendio Bajo (20 de 100).',
        'Pronóstico 72 h:',
        '• 24 h (hoy): Alto, 53 %',
        '• 48 h (mañana): Medio, 45 %',
        '• 72 h (pasado mañana): Bajo, <1 %',
        'Actualizado: 24 oct. 2026, 5:07 p. m.',
        '',
        'Atalaya · Riesgo de incendios en Nariño',
      ].join('\n'),
    );
  });

  it('leaves the forecast out while it has not loaded or failed', () => {
    expect(shareText(PASTO, null, UPDATED)).toBe(
      [
        'Pasto: riesgo de incendio Bajo (20 de 100).',
        'Actualizado: 24 oct. 2026, 5:07 p. m.',
        '',
        'Atalaya · Riesgo de incendios en Nariño',
      ].join('\n'),
    );
  });

  it('leaves the forecast out when it is the fallback to the current score', () => {
    const fallback: ZoneForecast = {
      zoneId: 'pasto', source: 'fallback', reason: 'weather_unavailable', generatedAt: '2026-10-24T22:00:00Z',
      current: { score: 20, level: 'low' },
    };
    const text = shareText(PASTO, fallback, UPDATED);
    expect(text).not.toContain('Pronóstico');
    expect(text.split('\n')[0]).toBe('Pasto: riesgo de incendio Bajo (20 de 100).');
  });

  it('writes it in English when the app is in English', () => {
    expect(shareText(PASTO, MODEL, UPDATED, 'en')).toBe(
      [
        'Pasto: wildfire risk Low (20 of 100).',
        '72 h forecast:',
        '• 24 h (today): High, 53%',
        '• 48 h (tomorrow): Medium, 45%',
        '• 72 h (day after tomorrow): Low, <1%',
        'Updated: Oct 24, 2026, 5:07 PM',
        '',
        'Atalaya · Wildfire risk in Nariño',
      ].join('\n'),
    );
    expect(shareText(PASTO, null, null, 'en')).toBe(
      ['Pasto: wildfire risk Low (20 of 100).', '', 'Atalaya · Wildfire risk in Nariño'].join('\n'),
    );
  });

  it('carries no link nor location, and leaves the date out when there is none', () => {
    const text = shareText(PASTO, MODEL, null);
    expect(text).not.toMatch(/https?:|\/api|localhost|latitud|longitud/i);
    expect(text).not.toContain('Actualizado');
    expect(text.endsWith('Atalaya · Riesgo de incendios en Nariño')).toBe(true);
  });
});
