import { Component, computed, inject } from '@angular/core';
import { MODEL_METRICS, topFactors, type DateRange, type ModelEvaluation } from '../../../domain/model/model-metrics';
import { formatDateMedium, formatPercent } from '../../../domain/util/format';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import { LOCALES, type MessageKey } from '../../../i18n/translate';

/** The variables of risk-model-1.0.0.json with their names in the app's language. */
const FEATURE_KEYS: Readonly<Record<string, MessageKey>> = {
  rain_1d_mm: 'feature.rain_1d_mm',
  rain_3d_mm: 'feature.rain_3d_mm',
  rain_7d_mm: 'feature.rain_7d_mm',
  rain_14d_mm: 'feature.rain_14d_mm',
  rain_30d_mm: 'feature.rain_30d_mm',
  dry_days: 'feature.dry_days',
  temperature_mean_c: 'feature.temperature_mean_c',
  temperature_max_c: 'feature.temperature_max_c',
  temperature_range_c: 'feature.temperature_range_c',
  temperature_trend_7d_c: 'feature.temperature_trend_7d_c',
  humidity_mean_pct: 'feature.humidity_mean_pct',
  humidity_7d_pct: 'feature.humidity_7d_pct',
  wind_max_ms: 'feature.wind_max_ms',
  wind_7d_ms: 'feature.wind_7d_ms',
  evapotranspiration_mm: 'feature.evapotranspiration_mm',
  water_balance_30d_mm: 'feature.water_balance_30d_mm',
  surface_soil_wetness: 'feature.surface_soil_wetness',
  hotspots_zone_1d: 'feature.hotspots_zone_1d',
  hotspots_zone_7d: 'feature.hotspots_zone_7d',
  hotspots_zone_30d: 'feature.hotspots_zone_30d',
  hotspots_ring_7d: 'feature.hotspots_ring_7d',
  hotspots_ring_30d: 'feature.hotspots_ring_30d',
  day_of_year_sin: 'feature.day_of_year_sin',
  day_of_year_cos: 'feature.day_of_year_cos',
  zone_hotspot_days_per_year: 'feature.zone_hotspot_days_per_year',
};

const MODEL_KEYS: Readonly<Record<string, MessageKey>> = { 'logistic-regression': 'metrics.model.logistic-regression' };

/** One metric with its bar: how full it is and, if there is one, the reference line (chance, base rate). */
interface MetricRow {
  readonly name: string;
  readonly value: string;
  readonly fill: number;
  readonly marker: { readonly at: number; readonly label: string } | null;
  readonly text: string;
}

/** «Métricas del modelo» of «Cómo funciona»: only what the metrics file has, explained in plain words. */
@Component({
  selector: 'app-model-metrics',
  imports: [TranslatePipe],
  templateUrl: './model-metrics.html',
  styleUrl: './model-metrics.css',
})
export class ModelMetricsCard {
  protected readonly metrics = inject(MODEL_METRICS);
  private readonly i18n = inject(I18n);

  protected readonly modelName = computed(() => {
    const model = this.metrics.model;
    return model && Object.hasOwn(MODEL_KEYS, model) ? this.i18n.t(MODEL_KEYS[model]!) : null;
  });

  /** Training, calibration and test periods, those the file has. */
  protected readonly periods = computed(() => {
    const language = this.i18n.language();
    const line = (key: MessageKey, range: DateRange | undefined) =>
      range ? [this.i18n.t(key, { from: formatDateMedium(range[0], language), to: formatDateMedium(range[1], language) })] : [];
    const { train, validation, test } = this.metrics.periods;
    return [...line('metrics.train', train), ...line('metrics.validation', validation), ...line('metrics.test', test)];
  });

  protected readonly rowsText = computed(() => {
    const rows = this.metrics.evaluation.openMeteoMapped?.rows;
    return rows ? this.i18n.t('metrics.rows', { rows: rows.toLocaleString(LOCALES[this.i18n.language()]) }) : null;
  });

  /** With the weather the app uses (Open-Meteo adjusted to the scale of POWER). */
  protected readonly main = computed(() => this.rows(this.metrics.evaluation.openMeteoMapped));

  protected readonly baseRate = computed(() => {
    const rate = this.metrics.evaluation.openMeteoMapped?.positiveRate;
    return rate === undefined ? null : this.i18n.t('metrics.baseRate', { value: this.percent(rate) });
  });

  /** With NASA POWER, the weather of the training: one line to compare. */
  protected readonly power = computed(() => {
    const power = this.metrics.evaluation.power;
    if (!power) return null;
    const parts = [
      power.rocAuc !== undefined ? `ROC-AUC ${this.decimal(power.rocAuc)}` : null,
      power.prAuc !== undefined ? `PR-AUC ${this.decimal(power.prAuc)}` : null,
      power.brier !== undefined ? `Brier ${this.decimal(power.brier)}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
  });

  /** Only variables with a name in the app: none is shown with a made-up label. */
  protected readonly factors = computed(() =>
    topFactors(this.metrics.features.filter((feature) => Object.hasOwn(FEATURE_KEYS, feature.name))).map((factor) => ({
      ...factor,
      label: FEATURE_KEYS[factor.name]!,
      weight: (factor.coefficient >= 0 ? '+' : '−') + this.decimal(Math.abs(factor.coefficient), 2),
    })),
  );

  protected readonly hasAny = computed(
    () => this.main().length > 0 || this.power() !== null || this.factors().length > 0 || this.periods().length > 0,
  );

  private rows(evaluation: ModelEvaluation | undefined): MetricRow[] {
    if (!evaluation) return [];
    const rows: MetricRow[] = [];
    const { rocAuc, prAuc, brier, positiveRate } = evaluation;
    if (rocAuc !== undefined) {
      rows.push({
        name: 'ROC-AUC',
        value: this.decimal(rocAuc),
        fill: rocAuc * 100,
        marker: { at: 50, label: `${this.i18n.t('metrics.chance')} ${this.decimal(0.5, 1)}` },
        text: this.i18n.t('metrics.rocAucText'),
      });
    }
    if (prAuc !== undefined) {
      rows.push({
        name: 'PR-AUC',
        value: this.decimal(prAuc),
        fill: prAuc * 100,
        marker: positiveRate === undefined ? null : { at: positiveRate * 100, label: `${this.i18n.t('metrics.baseRateMark')} ${this.percent(positiveRate)}` },
        text: this.i18n.t('metrics.prAucText'),
      });
    }
    if (brier !== undefined) {
      const baseline = this.metrics.brierBaseRate;
      // Lower is better: the bar is drawn against the base rate's Brier when the file has it.
      const scale = Math.max(brier, baseline ?? brier) * 1.25;
      rows.push({
        name: 'Brier',
        value: this.decimal(brier),
        fill: scale > 0 ? (brier / scale) * 100 : 0,
        marker: baseline === undefined ? null : { at: (baseline / scale) * 100, label: `${this.i18n.t('metrics.baseRateMark')} ${this.decimal(baseline)}` },
        text: [this.i18n.t('metrics.brierText'), baseline === undefined ? '' : this.i18n.t('metrics.brierBaseline', { value: this.decimal(baseline) })]
          .filter(Boolean)
          .join(' '),
      });
    }
    return rows;
  }

  private decimal(value: number, digits = 3): string {
    return value.toLocaleString(LOCALES[this.i18n.language()], { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  private percent(rate: number): string {
    return formatPercent((rate * 100).toLocaleString(LOCALES[this.i18n.language()], { maximumFractionDigits: 1 }), this.i18n.language());
  }
}
