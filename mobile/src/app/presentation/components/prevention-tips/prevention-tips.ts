import { Component, computed, input } from '@angular/core';
import type { RiskLevel } from '../../../domain/model/risk';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import { RiskBadge } from '../risk-badge/risk-badge';

/** Two fixed, short tips for each level (es.json / en.json): no rules nor figures. */
export const PREVENTION_TIPS: Record<RiskLevel, readonly MessageKey[]> = {
  low: ['prevention.low.1', 'prevention.low.2'],
  medium: ['prevention.medium.1', 'prevention.medium.2'],
  high: ['prevention.high.1', 'prevention.high.2'],
  extreme: ['prevention.extreme.1', 'prevention.extreme.2'],
};

/** «Prevención» in the zone sheet: what to do (or not) with fire at the zone's current level. */
@Component({
  selector: 'app-prevention-tips',
  imports: [RiskBadge, TranslatePipe],
  template: `
    <section aria-labelledby="prevention-title">
      <div class="head">
        <h3 id="prevention-title">{{ 'prevention.title' | t }}</h3>
        <app-risk-badge [level]="level()" />
      </div>
      <ul>
        @for (tip of tips(); track tip) {
          <li>{{ tip | t }}</li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host { display: block; margin-top: 24px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-2); }
    ul { margin: 10px 0 0; padding-left: 20px; font-size: 15px; line-height: 1.45; }
    li + li { margin-top: 6px; }
  `,
})
export class PreventionTips {
  readonly level = input.required<RiskLevel>();
  protected readonly tips = computed(() => PREVENTION_TIPS[this.level()]);
}
