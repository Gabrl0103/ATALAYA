import raw from '../../data/model-metrics-1.0.0.json';
import { parseModelMetrics, topFactors } from './model-metrics';

describe('parseModelMetrics', () => {
  it('reads the real metrics of the model v1.0.0', () => {
    const metrics = parseModelMetrics(raw);
    expect(metrics.version).toBe('1.0.0');
    expect(metrics.model).toBe('logistic-regression');
    expect(metrics.periods).toEqual({
      train: ['2019-01-01', '2023-12-31'],
      validation: ['2024-01-01', '2024-12-31'],
      test: ['2025-01-01', '2026-09-29'],
    });
    expect(metrics.evaluation.openMeteoMapped).toEqual({ rows: 40176, positiveRate: 0.1561, rocAuc: 0.8424, prAuc: 0.496, brier: 0.1004 });
    expect(metrics.evaluation.power).toEqual({ rows: 40768, positiveRate: 0.1555, rocAuc: 0.8531, prAuc: 0.5116, brier: 0.0996 });
    expect(metrics.brierBaseRate).toBe(0.131);
    expect(metrics.features).toHaveLength(25);
  });

  it('leaves out what is missing, of another type or out of range, never filling it in', () => {
    const metrics = parseModelMetrics({
      version: '',
      periods: { train: ['2019-01-01'], test: ['2025-01-01', 'mañana'] },
      evaluation: { openMeteoMapped: { rocAuc: 1.4, prAuc: '0,5', brier: 0.1, rows: 2.5 }, power: { rocAuc: null } },
      brierBaseRate: -1,
      features: [{ name: 'rain_1d_mm', coefficient: 'x' }, { name: '', coefficient: 1 }, { name: 'dry_days', coefficient: 0.03 }],
    });
    expect(metrics).toEqual({
      version: undefined,
      model: undefined,
      trainedAt: undefined,
      periods: { train: undefined, validation: undefined, test: undefined },
      evaluation: {
        openMeteoMapped: { rows: undefined, positiveRate: undefined, rocAuc: undefined, prAuc: undefined, brier: 0.1 },
        power: undefined,
      },
      brierBaseRate: undefined,
      features: [{ name: 'dry_days', coefficient: 0.03 }],
    });
  });

  it('reads no file (or a broken one) as no metrics', () => {
    for (const value of [undefined, null, 'metrics', [1, 2], {}]) {
      const metrics = parseModelMetrics(value);
      expect(metrics.evaluation).toEqual({ openMeteoMapped: undefined, power: undefined });
      expect(metrics.features).toEqual([]);
    }
  });
});

describe('topFactors', () => {
  it('orders the variables by the size of their coefficient, with the sign and a share of the largest', () => {
    const factors = topFactors(parseModelMetrics(raw).features);
    expect(factors.map((f) => f.name)).toEqual([
      'zone_hotspot_days_per_year',
      'humidity_mean_pct',
      'water_balance_30d_mm',
      'humidity_7d_pct',
      'hotspots_ring_30d',
      'evapotranspiration_mm',
    ]);
    expect(factors.map((f) => f.direction)).toEqual(['up', 'down', 'up', 'down', 'up', 'up']);
    expect(factors[0]!.share).toBe(1);
    expect(factors[1]!.share).toBeCloseTo(0.482 / 1.231, 2);
  });

  it('gives nothing without variables', () => {
    expect(topFactors([])).toEqual([]);
  });
});
