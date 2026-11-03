import { InjectionToken } from '@angular/core';
import raw from '../../data/model-metrics-1.0.0.json';

/** How the model did on the test period with one weather input (docs/ML.md, sections 5.1 and 7.2). */
export interface ModelEvaluation {
  /** Zone-days evaluated. */
  readonly rows?: number;
  /** Share of zone-days with a hotspot: what a model that guesses at random gets as PR-AUC. */
  readonly positiveRate?: number;
  readonly rocAuc?: number;
  readonly prAuc?: number;
  /** Mean squared error of the probability: lower is better. */
  readonly brier?: number;
}

/** A variable of the model with its standardized coefficient (one standard deviation of the variable). */
export interface ModelFeature {
  readonly name: string;
  readonly coefficient: number;
}

export type DateRange = readonly [from: string, to: string];

/**
 * What «Cómo funciona» and «Acerca de» say about the forecast model. Every field is optional: what the
 * file does not have (or has broken) is left out of the screen, never filled in.
 */
export interface ModelMetrics {
  readonly version?: string;
  readonly model?: string;
  readonly trainedAt?: string;
  readonly periods: { readonly train?: DateRange; readonly validation?: DateRange; readonly test?: DateRange };
  readonly evaluation: { readonly openMeteoMapped?: ModelEvaluation; readonly power?: ModelEvaluation };
  /** Brier of always predicting the base rate (docs/ML.md 5.1): the line a useful model must stay under. */
  readonly brierBaseRate?: number;
  readonly features: readonly ModelFeature[];
}

/** A variable among those that weigh most, with its share of the largest weight (0–1) for the bar. */
export interface ModelFactor extends ModelFeature {
  readonly direction: 'up' | 'down';
  readonly share: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** ROC-AUC, PR-AUC, Brier and rates are between 0 and 1. */
const unit = (value: unknown): number | undefined => (finite(value) && value >= 0 && value <= 1 ? value : undefined);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function range(value: unknown): DateRange | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [from, to] = value as unknown[];
  return typeof from === 'string' && typeof to === 'string' && DAY.test(from) && DAY.test(to) ? [from, to] : undefined;
}

function evaluation(value: unknown): ModelEvaluation | undefined {
  if (!isRecord(value)) return undefined;
  const rows = value['rows'];
  const result: ModelEvaluation = {
    rows: finite(rows) && Number.isInteger(rows) && rows > 0 ? rows : undefined,
    positiveRate: unit(value['positiveRate']),
    rocAuc: unit(value['rocAuc']),
    prAuc: unit(value['prAuc']),
    brier: unit(value['brier']),
  };
  return Object.values(result).some((field) => field !== undefined) ? result : undefined;
}

/** Reads the metrics file; anything missing, of another type or out of range is left out. */
export function parseModelMetrics(value: unknown): ModelMetrics {
  const data = isRecord(value) ? value : {};
  const periods = isRecord(data['periods']) ? data['periods'] : {};
  const evaluations = isRecord(data['evaluation']) ? data['evaluation'] : {};
  const features = Array.isArray(data['features']) ? data['features'] : [];
  return {
    version: text(data['version']),
    model: text(data['model']),
    trainedAt: text(data['trainedAt']),
    periods: { train: range(periods['train']), validation: range(periods['validation']), test: range(periods['test']) },
    evaluation: { openMeteoMapped: evaluation(evaluations['openMeteoMapped']), power: evaluation(evaluations['power']) },
    brierBaseRate: unit(data['brierBaseRate']),
    features: features.flatMap((feature): ModelFeature[] =>
      isRecord(feature) && text(feature['name']) && finite(feature['coefficient'])
        ? [{ name: feature['name'] as string, coefficient: feature['coefficient'] }]
        : [],
    ),
  };
}

/**
 * The variables that weigh most in the model, by the size of their standardized coefficient. Several are
 * correlated (rain, humidity), so a sign says how the model uses it, not a cause on its own.
 */
export function topFactors(features: readonly ModelFeature[], count = 6): ModelFactor[] {
  const sorted = [...features].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient)).slice(0, count);
  const largest = Math.abs(sorted[0]?.coefficient ?? 0);
  return sorted.map((feature) => ({
    ...feature,
    direction: feature.coefficient >= 0 ? 'up' : 'down',
    share: largest > 0 ? Math.abs(feature.coefficient) / largest : 0,
  }));
}

/** The metrics of the model the backend runs (v1.0.0), copied in the app: a test of the backend keeps them equal. */
export const MODEL_METRICS = new InjectionToken<ModelMetrics>('MODEL_METRICS', {
  providedIn: 'root',
  factory: () => parseModelMetrics(raw),
});
