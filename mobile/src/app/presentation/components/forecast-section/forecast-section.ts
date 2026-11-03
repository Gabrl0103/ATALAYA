import { Component, computed, inject, input, output } from '@angular/core';
import type { ForecastFallbackReason, ZoneForecast } from '../../../domain/model/risk';
import { percentLabel } from '../../../domain/util/format';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import type { ForecastStatus } from '../../../state/zones.store';
import { RiskBadge } from '../risk-badge/risk-badge';

/** Why the backend answered with the current score instead of the model (it sends a code, the app the words). */
const FALLBACK_REASONS: Record<ForecastFallbackReason, MessageKey> = {
  weather_unavailable: 'forecast.reason.weatherUnavailable',
  weather_history_incomplete: 'forecast.reason.weatherHistoryIncomplete',
  hotspot_history_incomplete: 'forecast.reason.hotspotHistoryIncomplete',
  model_error: 'forecast.reason.modelError',
};

/** The words for a fallback code; a code this app does not know yet (or none) gets a general one. */
export function fallbackReasonKey(reason: unknown): MessageKey {
  return typeof reason === 'string' && reason in FALLBACK_REASONS
    ? FALLBACK_REASONS[reason as ForecastFallbackReason]
    : 'forecast.reason.unknown';
}

/** Day at whose end each row starts its 72 h (the note under the rows explains it). */
export const WHEN_KEYS: Record<24 | 48 | 72, MessageKey> = { 24: 'when.today', 48: 'when.tomorrow', 72: 'when.dayAfter' };

/** «Pronóstico 72 h» of the zone sheet: the ML model at 24, 48 and 72 h, or why it is not available. */
@Component({
  selector: 'app-forecast-section',
  imports: [RiskBadge, TranslatePipe],
  template: `
    <section class="forecast glass-card" aria-labelledby="forecast-title">
      <h3 id="forecast-title">{{ 'forecast.title' | t }}</h3>
      <div
        class="forecast-body"
        [attr.role]="status() === 'loading' ? 'status' : null"
        [attr.aria-label]="status() === 'loading' ? ('forecast.loading' | t) : null"
      >
        <!--
          Always the room of the full forecast (three rows and the note, in this language): the
          answer, its fallback or an error never push what is below. While loading it is the placeholder.
        -->
        <div class="forecast-sizer" [class.is-loading]="status() === 'loading'" aria-hidden="true">
          @for (hours of loadingRows; track hours) {
            <div class="forecast-row">
              <div class="forecast-head">
                <span class="forecast-when"><b class="mono">{{ hours }} h</b><small>{{ whenKeys[hours] | t }}</small></span>
                <span class="skeleton skeleton-badge"></span>
                <span class="skeleton skeleton-value"></span>
              </div>
              <div class="forecast-track skeleton"></div>
            </div>
          }
          <p class="forecast-note"><span class="skeleton skeleton-text">{{ 'forecast.note' | t }}</span></p>
        </div>
      @switch (status()) {
        @case ('loading') {}
        @case ('error') {
          <div class="forecast-state is-error anim-up" role="alert">
            <p>{{ 'forecast.error' | t }}</p>
            <button type="button" (click)="retry.emit()">{{ 'common.retry' | t }}</button>
          </div>
        }
        @default {
          @if (forecast(); as data) {
            @if (data.source === 'model') {
              <!-- One child of .forecast-body: the rows and, under them, the note (as in the sizer). -->
              <div class="forecast-model">
                <ul class="forecast-rows">
                  @for (horizon of data.horizons; track horizon.hours; let i = $index) {
                    <!-- Rows come in 0.1 s apart; each bar grows once its row is there. -->
                    <li class="forecast-row anim-up" [class]="'risk-' + horizon.level" [style.--i]="i">
                      <div class="forecast-head">
                        <span class="forecast-when"><b class="mono">{{ horizon.hours }} h</b><small>{{ whenKeys[horizon.hours] | t }}</small></span>
                        <app-risk-badge [level]="horizon.level" />
                        <b class="mono forecast-value">{{ percent(horizon.probability) }}</b>
                      </div>
                      <div class="forecast-track" aria-hidden="true">
                        <span class="anim-growx" [style.--i]="i + 1" [style.width.%]="horizon.probability * 100"></span>
                      </div>
                    </li>
                  }
                </ul>
                <p class="forecast-note anim-up" [style.--i]="data.horizons.length">{{ 'forecast.note' | t }}</p>
              </div>
            } @else {
              <div class="forecast-state is-fallback anim-up" role="status">
                <p>{{ 'forecast.fallback' | t: { reason: reason() } }}</p>
                <span class="forecast-current">
                  <app-risk-badge [level]="data.current.level" /><b class="mono">{{ data.current.score }}</b>
                </span>
              </div>
            }
          }
        }
      }
      </div>
    </section>
  `,
  styleUrl: './forecast-section.css',
})
export class ForecastSection {
  readonly forecast = input<ZoneForecast | null>(null);
  readonly status = input<ForecastStatus>('idle');
  readonly retry = output<void>();

  private readonly i18n = inject(I18n);
  protected readonly reason = computed(() => {
    const data = this.forecast();
    return data?.source === 'fallback' ? this.i18n.t(fallbackReasonKey(data.reason)) : '';
  });
  protected readonly percent = (probability: number): string => percentLabel(probability, this.i18n.language());
  /** While it loads, the three rows keep their place: the sheet does not jump when the answer comes. */
  protected readonly loadingRows = [24, 48, 72] as const;
  protected readonly whenKeys = WHEN_KEYS;
}
