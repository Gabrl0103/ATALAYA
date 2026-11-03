import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import model from '../src/infrastructure/ml/risk-model-1.0.0.json' with { type: 'json' };

/**
 * The app shows the model's metrics in «Cómo funciona» from its own copy (the app does not ask the API
 * for them). This test fails if that copy stops matching the model the backend runs.
 */
const copy = JSON.parse(
  readFileSync(new URL('../../mobile/src/app/data/model-metrics-1.0.0.json', import.meta.url), 'utf8'),
) as {
  version: string;
  label: string;
  trainedAt: string;
  periods: { test: [string, string] };
  evaluation: Record<'openMeteoMapped' | 'power', { rows: number; positiveRate: number; rocAuc: number; prAuc: number; brier: number }>;
  features: { name: string; coefficient: number }[];
};

describe('metrics of the model in the app', () => {
  it('are those of the model the backend runs', () => {
    assert.equal(copy.version, model.version);
    assert.equal(copy.label, model.label);
    assert.equal(copy.trainedAt, model.trainedAt);
    assert.deepEqual(copy.periods.test, model.evaluationTest.period);
    for (const input of ['openMeteoMapped', 'power'] as const) {
      const real = model.evaluationTest[input];
      assert.deepEqual(copy.evaluation[input], {
        rows: real.rows,
        positiveRate: real.positive_rate,
        rocAuc: real.roc_auc,
        prAuc: real.pr_auc,
        brier: real.brier,
      });
    }
  });

  it('have every variable of the model with its coefficient, in the same order', () => {
    assert.deepEqual(
      copy.features,
      model.features.map((name, i) => ({ name, coefficient: model.coefficients[i] })),
    );
  });
});
