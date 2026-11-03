import { Component, computed, inject, input, output } from '@angular/core';
import { NEARBY_HOTSPOT_MAX_KM, type NearbySummary } from '../../../domain/util/nearby';
import { formatTimeAgo } from '../../../domain/util/format';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import { LOCALES, type MessageKey } from '../../../i18n/translate';
import { AppIcon } from '../app-icon/app-icon';
import { RiskBadge } from '../risk-badge/risk-badge';

const PLACE_KEYS: Record<NearbySummary['place'], MessageKey> = {
  inside: 'nearby.inside',
  outside: 'nearby.outside',
  nearest: 'nearby.nearest',
};

/** «Cerca de mí»: shown after «Mi ubicación», over the bottom of the map (only on this phone). */
@Component({
  selector: 'app-nearby-card',
  imports: [AppIcon, RiskBadge, TranslatePipe],
  template: `
    <section class="nearby anim-up" aria-labelledby="nearby-title" [attr.aria-live]="'polite'">
      <header class="nearby-head">
        <h2 id="nearby-title">{{ 'nearby.title' | t }}</h2>
        <button type="button" class="icon-button" [attr.aria-label]="'nearby.close' | t" (click)="closed.emit()">
          <app-icon name="x" [size]="20" />
        </button>
      </header>
      <p class="place">{{ placeText() }}</p>
      <div class="risk">
        <app-risk-badge [level]="summary().zone.level" />
        <b class="mono">{{ 'common.scoreOf100' | t: { score: summary().zone.score } }}</b>
      </div>
      <p class="hotspot">{{ hotspotText() }}</p>
      <p class="note">{{ 'nearby.note' | t }}</p>
      <div class="actions">
        <button type="button" class="action primary" (click)="openZone.emit(summary().zone.id)">{{ 'nearby.openZone' | t }}</button>
        @if (summary().hotspot) {
          <button type="button" class="action" (click)="showHotspot.emit()">{{ 'nearby.showHotspot' | t }}</button>
        }
      </div>
    </section>
  `,
  styleUrl: './nearby-card.css',
})
export class NearbyCard {
  readonly summary = input.required<NearbySummary>();
  readonly openZone = output<string>();
  readonly showHotspot = output<void>();
  readonly closed = output<void>();

  private readonly i18n = inject(I18n);

  /** Under 10 km with one decimal («1,5»), farther in whole kilometres («12»). */
  private km(value: number): string {
    return value.toLocaleString(LOCALES[this.i18n.language()], { maximumFractionDigits: value < 10 ? 1 : 0 });
  }

  protected readonly placeText = computed(() => {
    const { place, zone, zoneKm } = this.summary();
    return this.i18n.t(PLACE_KEYS[place], { name: zone.name, km: this.km(zoneKm) });
  });

  protected readonly hotspotText = computed(() => {
    const nearest = this.summary().hotspot;
    if (!nearest) return this.i18n.t('nearby.noHotspot', { km: NEARBY_HOTSPOT_MAX_KM });
    return this.i18n.t('nearby.hotspot', {
      km: this.km(nearest.km),
      direction: this.i18n.t(`dir.${nearest.direction}`),
      ago: formatTimeAgo(nearest.hotspot.detectedAt, this.i18n.language()),
    });
  });
}
