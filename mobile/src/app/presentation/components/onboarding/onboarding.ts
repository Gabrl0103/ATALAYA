import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { Motion } from '../../../core/motion';
import { OnboardingFlag } from '../../../core/onboarding-flag';
import type { RiskLevel } from '../../../domain/model/risk';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import { AppIcon, type IconName } from '../app-icon/app-icon';
import { LavaBg } from '../lava-bg/lava-bg';
import { RiskBadge } from '../risk-badge/risk-badge';

/** Municipalities of the sample map (a sketch, not Nariño's real outline); three of them get their badge. */
const MAP_ZONES: readonly SampleZone[] = [
  { name: 'Tumaco', level: 'high', score: 62, path: 'M8 70 L70 40 L112 64 L98 128 L40 150 L10 118 Z', badge: true },
  { name: 'Barbacoas', level: 'medium', score: 44, path: 'M70 40 L132 20 L170 52 L150 98 L112 64 Z' },
  { name: 'Pasto', level: 'medium', score: 31, path: 'M150 98 L170 52 L226 46 L248 92 L206 122 Z', badge: true },
  { name: 'La Unión', level: 'extreme', score: 81, path: 'M226 46 L252 10 L292 30 L288 74 L248 92 Z' },
  { name: 'Ipiales', level: 'low', score: 18, path: 'M98 128 L112 64 L150 98 L206 122 L184 162 L118 164 Z', badge: true },
  { name: 'Túquerres', level: 'low', score: 22, path: 'M206 122 L248 92 L288 74 L294 140 L232 160 L184 162 Z' },
];

/** The three horizons of the sample forecast (the zone sheet shows the real ones). */
const FORECAST_ROWS = [
  { when: 'when.today', level: 'medium', score: 41 },
  { when: 'when.tomorrow', level: 'high', score: 58 },
  { when: 'when.dayAfter', level: 'high', score: 63 },
] as const satisfies readonly { when: MessageKey; level: RiskLevel; score: number }[];

const FEATURES = [
  { icon: 'heart', title: 'onboarding.favorites', text: 'onboarding.favoritesText' },
  { icon: 'bell', title: 'onboarding.alerts', text: 'onboarding.alertsText' },
  { icon: 'map-pin', title: 'onboarding.location', text: 'onboarding.locationText' },
] as const satisfies readonly { icon: IconName; title: MessageKey; text: MessageKey }[];

interface SampleZone {
  readonly name: string;
  readonly level: RiskLevel;
  readonly score: number;
  /** Outline in the 300 × 170 sketch. */
  readonly path: string;
  /** Named with its badge under the map. */
  readonly badge?: boolean;
}

const PAGE_COUNT = 3;
const FADE_OUT_MS = 400;

/**
 * Introducción de 3 pantallas (mapa de riesgo, pronóstico a 72 h, favoritos y alertas). Sale la primera vez
 * y se reabre desde Ajustes; «Omitir» está en todas.
 */
@Component({
  selector: 'app-onboarding',
  imports: [AppIcon, LavaBg, RiskBadge, TranslatePipe],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
  host: { '[class.leaving]': 'leaving()' },
})
export class Onboarding {
  private readonly flag = inject(OnboardingFlag);
  private readonly motion = inject(Motion);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  readonly finished = output<void>();
  protected readonly mapZones = MAP_ZONES;
  protected readonly badgeZones = MAP_ZONES.filter((zone) => zone.badge);
  protected readonly forecast = FORECAST_ROWS;
  protected readonly features = FEATURES;
  protected readonly pages = Array.from({ length: PAGE_COUNT }, (_, i) => i);
  protected readonly index = signal(0);
  protected readonly leaving = signal(false);

  protected isLast(): boolean {
    return this.index() === PAGE_COUNT - 1;
  }

  protected onScroll(): void {
    const el = this.track().nativeElement;
    this.index.set(Math.round(el.scrollLeft / el.clientWidth));
  }

  protected next(): void {
    if (this.isLast()) {
      this.finish();
      return;
    }
    this.goTo(this.index() + 1);
  }

  protected goTo(page: number): void {
    const el = this.track().nativeElement;
    el.scrollTo({ left: page * el.clientWidth, behavior: this.motion.reduced() ? 'auto' : 'smooth' });
    this.index.set(page);
  }

  protected finish(): void {
    if (this.leaving()) return;
    this.leaving.set(true);
    void this.flag.markDone();
    setTimeout(() => this.finished.emit(), FADE_OUT_MS);
  }
}
