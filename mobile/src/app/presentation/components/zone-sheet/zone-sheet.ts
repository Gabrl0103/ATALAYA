import {
  Component, ElementRef, OnDestroy, afterNextRender, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import type { ZoneDetail, ZoneForecast, ZoneRiskSummary } from '../../../domain/model/risk';
import { formatDecimal, formatPercent, formatTimeAgo, formatUpdatedDay } from '../../../domain/util/format';
import { riskLabel } from '../../../domain/util/risk-labels';
import { formatTemperature, formatWind } from '../../../domain/util/units';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey, MessageParams, PluralKey } from '../../../i18n/translate';
import { SettingsStore } from '../../../state/settings.store';
import type { ForecastStatus } from '../../../state/zones.store';
import { AppIcon, type IconName } from '../app-icon/app-icon';
import { ForecastSection } from '../forecast-section/forecast-section';
import { RiskBadge } from '../risk-badge/risk-badge';
import { FULL_HEIGHT, clampOffset, resolveSnap, snapOffset, type SheetSnap } from './sheet-snap';

/** Movement (px) below which a press on the handle is a tap, not a drag. */
const TAP_SLOP = 6;
/** A finger that stops this long (ms) before lifting releases with no speed. */
const STILL_MS = 100;
/** Same as the transform transition in sheet-frame.css. */
const SLIDE_MS = 320;
/** Score ring: 92 px wide with a 9 px stroke (zone-sheet.css). */
const RING_RADIUS = 41.5;
const RING_TOTAL = 2 * Math.PI * RING_RADIUS;

interface DragState {
  readonly pointerId: number;
  readonly startY: number;
  readonly startOffset: number;
  readonly sheetHeight: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
}

/** One value of «Clima ahora»: its icon, the value in the chosen unit (null while it loads) and what it is. */
interface WeatherItem {
  readonly icon: IconName;
  readonly value: string | null;
  readonly label: MessageKey | PluralKey;
  readonly params?: MessageParams;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** «Clima ahora» while neither the zone list nor the detail has it: the same four tiles, values pending. */
const WEATHER_PLACEHOLDERS: readonly WeatherItem[] = [
  { icon: 'thermometer', value: null, label: 'weather.temperature' },
  { icon: 'droplet', value: null, label: 'weather.humidity' },
  { icon: 'wind', value: null, label: 'weather.wind' },
  { icon: 'calendar', value: null, label: 'weather.dryDays', params: { count: 2 } },
];

@Component({
  selector: 'app-zone-sheet',
  imports: [AppIcon, ForecastSection, RiskBadge, TranslatePipe],
  template: `
    <div class="sheet-layer" [class.is-closing]="snap() === 'closed'">
      <button type="button" class="sheet-backdrop" [attr.aria-label]="'sheet.close' | t" (click)="close()"></button>
      <button type="button" class="sheet-back" [attr.aria-label]="'sheet.back' | t" (click)="close()">
        <app-icon name="chevron-left" [size]="22" /><span>Nariño</span>
      </button>
      <p class="sheet-notice" role="status">
        @if (notice(); as text) {
          <span class="notice-pill">{{ text }}</span>
        }
      </p>
      <section
        #sheet
        class="zone-sheet"
        [class.is-dragging]="dragOffset() !== null"
        [class.is-expanded]="snap() === 'full'"
        [style.height.%]="fullHeightPct"
        [style.transform]="transform()"
        [attr.aria-label]="'sheet.label' | t"
      >
        <div
          class="sheet-drag-area"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointercancel)="onPointerCancel($event)"
        >
          <button
            type="button"
            class="sheet-handle"
            [attr.aria-label]="(snap() === 'full' ? 'sheet.collapse' : 'sheet.expand') | t"
            [attr.aria-expanded]="snap() === 'full'"
            (click)="toggle()"
          >
            <span></span>
          </button>

          <header class="zone-heading">
            <div class="zone-title">
              <h2>{{ risk().name }}</h2>
              <p>Nariño{{ updated() }}</p>
              <div class="zone-meta">
                <app-risk-badge [level]="risk().level" />
                <!-- is-touched: the heart only beats after a tap (not when the sheet opens on a favorite). -->
                <button
                  type="button"
                  class="icon-action favorite-toggle"
                  [class.is-on]="favorite()"
                  [class.is-touched]="favoriteTouched()"
                  [attr.aria-pressed]="favorite()"
                  [attr.aria-label]="(favorite() ? 'sheet.removeFavorite' : 'sheet.addFavorite') | t"
                  (click)="toggleFavorite()"
                >
                  <app-icon [name]="favorite() ? 'heart-filled' : 'heart'" [size]="22" />
                </button>
                <!-- Two classes in turn: each tap changes the animation, so it plays again. -->
                <button
                  type="button"
                  class="icon-action share-button"
                  [class.is-shared-a]="shareTaps() % 2 === 1"
                  [class.is-shared-b]="shareTaps() > 0 && shareTaps() % 2 === 0"
                  [attr.aria-label]="'sheet.share' | t"
                  (click)="share()"
                >
                  <app-icon name="share" [size]="20" />
                </button>
              </div>
            </div>
            <div
              class="score-ring"
              [class]="'risk-' + risk().level"
              role="img"
              [attr.aria-label]="'sheet.scoreAria' | t: { score: risk().score, level: riskLabel() }"
            >
              <svg viewBox="0 0 92 92" aria-hidden="true">
                <circle class="ring-track" cx="46" cy="46" [attr.r]="ringRadius" />
                <circle
                  class="ring-value anim-ring"
                  cx="46"
                  cy="46"
                  [attr.r]="ringRadius"
                  [attr.stroke-dasharray]="ringValue() + ' ' + ringTotal"
                  [style.--ring-value]="ringValue()"
                  [style.--ring-total]="ringTotal"
                />
              </svg>
              <strong class="mono">{{ risk().score }}</strong>
              <span>{{ riskLabel() }}</span>
            </div>
          </header>
        </div>

        <div class="zone-content">
          @if (weather().length > 0) {
            <section class="weather" aria-labelledby="weather-title" [attr.aria-busy]="weatherPending()">
              <h3 id="weather-title" class="factors-title">{{ 'weather.title' | t }}</h3>
              <ul class="weather-row">
                <!-- Tiles come in 0.1 s apart; tracked by label, so a value that arrives does not replay it. -->
                @for (item of weather(); track item.label; let i = $index) {
                  <li class="stat-tile anim-up" [style.--i]="i">
                    <app-icon [name]="item.icon" [size]="16" />
                    @if (item.value !== null) {
                      <b class="mono">{{ item.value }}</b>
                    } @else {
                      <b class="mono skeleton skeleton-text" aria-hidden="true">00</b>
                    }
                    <small>{{ item.label | t: item.params }}</small>
                  </li>
                }
              </ul>
            </section>
          }
          <h3 class="factors-title">{{ 'sheet.factorsTitle' | t }}</h3>
          @for (factor of factors(); track factor.label; let i = $index) {
            <!-- After «Clima ahora»: each factor comes in, then its bar grows. -->
            <div class="factor anim-up" [style.--i]="i + 2">
              <div class="factor-head">
                <span>{{ factor.label | t }} <small>· <span class="mono">{{ factor.weight }} %</span></small></span>
                @if (factor.value !== null) {
                  <b class="mono">{{ factor.value }}</b>
                } @else {
                  <span class="skeleton factor-value-skeleton" aria-hidden="true"></span>
                }
              </div>
              <div class="factor-track" [class.skeleton]="factor.value === null">
                @if (factor.value !== null) {
                  <span class="anim-growx" [style.--i]="i + 3" [style.width.%]="factor.value"></span>
                }
              </div>
            </div>
          }

          <!-- Each card waits shaped like itself (same lines), so the forecast below never moves. -->
          @if (!detail() || detail()?.hotspots || perYear() !== null || firesLoading()) {
            <div class="stats">
              @if (detail(); as loaded) {
                @if (loaded.hotspots; as hotspots) {
                  <div class="stat-tile hotspots-stat">
                    <b class="mono">{{ hotspots.count }}</b>
                    <span>{{ 'sheet.hotspotsNear' | t: { count: hotspots.count } }}</span>
                    <!-- Kept without a detection too: the card keeps the height it had while loading. -->
                    <small>{{ latestHotspot() ? ('sheet.latest' | t: { ago: latestHotspot() }) : '\u00a0' }}</small>
                  </div>
                }
              } @else {
                <div class="stat-tile hotspots-stat stat-skeleton" aria-hidden="true">
                  <b class="mono skeleton skeleton-text">00</b>
                  <span>{{ 'sheet.hotspotsNear' | t: { count: 2 } }}</span>
                  <small class="skeleton skeleton-text">{{ 'sheet.latest' | t: { ago: ('time.daysAgo' | t: { count: 3 }) } }}</small>
                </div>
              }
              @if (perYear(); as perYear) {
                <div class="stat-tile fires-stat">
                  <b class="mono">{{ perYear }}</b>
                  <span>{{ 'sheet.firesPerYear' | t }}</span>
                </div>
              } @else if (firesLoading()) {
                <div class="stat-tile fires-stat stat-skeleton" aria-hidden="true">
                  <b class="mono skeleton skeleton-text">0,0</b>
                  <span>{{ 'sheet.firesPerYear' | t }}</span>
                </div>
              }
            </div>
          }

          <app-forecast-section [forecast]="forecast()" [status]="forecastStatus()" (retry)="forecastRetry.emit()" />

          <button type="button" class="history-cta" (click)="historyRequested.emit()">
            {{ 'sheet.history' | t: { name: risk().name } }}
          </button>
          <p class="disclaimer">{{ 'sheet.disclaimer' | t }}</p>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['./sheet-frame.css', './zone-sheet.css'],
})
export class ZoneSheet implements OnDestroy {
  /** The zone as the map has it: the sheet opens with it at once, without waiting for the network. */
  readonly zone = input.required<ZoneRiskSummary>();
  /** Arrives a moment later (GET /zones/:id): the nearby hotspots, and the factors if the zone had none. */
  readonly detail = input<ZoneDetail | null>(null);
  /** When the zones were loaded; null leaves the "actualizado" text out. */
  readonly updatedAt = input<Date | null>(null);
  /** Average fires per year of the zone (from its records); null leaves the card out. */
  readonly firesPerYear = input<number | null>(null);
  /** The fire records are still on their way: their card waits as a placeholder. */
  readonly firesLoading = input(false);
  /** 72 h forecast of the zone (ML model or its fallback) and whether it is still loading or failed. */
  readonly forecast = input<ZoneForecast | null>(null);
  readonly forecastStatus = input<ForecastStatus>('idle');
  readonly forecastRetry = output<void>();
  /** Whether the zone is among «Mis municipios»; the heart only asks the page to change it. */
  readonly favorite = input(false);
  readonly favoriteToggled = output<void>();
  /** «Compartir»: the page builds the text with the data on screen and sends it. */
  readonly shareRequested = output<void>();
  /** A short notice over the map («Copiado»); null hides it. */
  readonly notice = input<string | null>(null);
  readonly closed = output<void>();
  readonly historyRequested = output<void>();

  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');
  /** Starts hidden and slides up to mid once rendered. */
  protected readonly snap = signal<SheetSnap>('closed');
  /** Offset (px) while the finger moves the sheet; null when it rests on a snap position. */
  protected readonly dragOffset = signal<number | null>(null);
  protected readonly fullHeightPct = FULL_HEIGHT * 100;
  protected readonly transform = computed(() => {
    const offset = this.dragOffset();
    if (offset !== null) return `translateY(${offset}px)`;
    // Percentages of the sheet's own height, so no measuring is needed at rest.
    return `translateY(${snapOffset(this.snap(), 100)}%)`;
  });

  private drag?: DragState;
  /** The click that follows a drag on the handle must not toggle the sheet. */
  private suppressClick = false;
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => requestAnimationFrame(() => this.snap.set('mid')));
  }

  ngOnDestroy(): void {
    clearTimeout(this.closeTimer);
  }

  /** The heart was tapped in this sheet: from now on marking and unmarking animate it. */
  protected readonly favoriteTouched = signal(false);
  /** Taps on «Compartir», for its short lift. */
  protected readonly shareTaps = signal(0);

  protected toggleFavorite(): void {
    this.favoriteTouched.set(true);
    this.favoriteToggled.emit();
  }

  protected share(): void {
    this.shareTaps.update((taps) => taps + 1);
    this.shareRequested.emit();
  }

  protected toggle(): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.snap.set(this.snap() === 'full' ? 'mid' : 'full');
  }

  /** Slides the sheet down, then tells the page to remove it. */
  protected close(): void {
    if (this.closeTimer) return;
    this.snap.set('closed');
    this.closeTimer = setTimeout(() => this.closed.emit(), SLIDE_MS);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.suppressClick = false;
    if (event.button !== 0) return;
    const sheetHeight = this.sheet().nativeElement.offsetHeight;
    this.drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: snapOffset(this.snap(), sheetHeight),
      sheetHeight,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dy) < TAP_SLOP) return;
      drag.moved = true;
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }
    const dt = event.timeStamp - drag.lastTime;
    if (dt > 0) drag.velocity = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    this.dragOffset.set(clampOffset(drag.startOffset + dy, drag.sheetHeight));
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = undefined;
    if (!drag.moved) return;
    this.suppressClick = true;
    const offset = this.dragOffset() ?? drag.startOffset;
    const velocity = event.timeStamp - drag.lastTime > STILL_MS ? 0 : drag.velocity;
    this.dragOffset.set(null);
    const target = resolveSnap(offset, velocity, drag.sheetHeight);
    if (target === 'closed') this.close();
    else this.snap.set(target);
  }

  protected onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.drag?.pointerId) return;
    this.drag = undefined;
    this.dragOffset.set(null);
  }

  protected readonly ringRadius = RING_RADIUS;
  protected readonly ringTotal = RING_TOTAL;
  /** Name, score and level: the detail's once it arrives, the map's until then. */
  protected readonly risk = computed(() => this.detail() ?? this.zone());
  protected readonly ringValue = computed(() => (Math.min(Math.max(this.risk().score, 0), 100) / 100) * RING_TOTAL);
  private readonly i18n = inject(I18n);
  protected readonly riskLabel = computed(() => riskLabel(this.risk().level, this.i18n.language()));
  protected readonly updated = computed(() => {
    const date = this.updatedAt();
    return date ? ` · ${this.i18n.t('sheet.updated', { day: formatUpdatedDay(date, this.i18n.language()) })}` : '';
  });
  protected readonly latestHotspot = computed(() => {
    const hotspots = this.detail()?.hotspots;
    return hotspots?.count && hotspots.latestDetectedAt ? formatTimeAgo(hotspots.latestDetectedAt, this.i18n.language()) : '';
  });
  private readonly settings = inject(SettingsStore);
  /** Neither the zone list nor the detail has brought the weather yet (an older backend, or on its way). */
  protected readonly weatherPending = computed(() => !this.detail() && !this.zone().weather);
  /**
   * «Clima ahora» from the zone list (or the detail), in the units of Ajustes (the API sends °C and
   * km/h). A value the API did not send is left out; while pending, the four tiles wait with their labels.
   */
  protected readonly weather = computed((): readonly WeatherItem[] => {
    if (this.weatherPending()) return WEATHER_PLACEHOLDERS;
    // The zone list brings it (v0.31); an older backend only in the detail.
    const source = this.detail()?.weather ?? this.zone().weather;
    const weather: Partial<ZoneDetail['weather']> = source ?? {};
    const language = this.i18n.language();
    const items: WeatherItem[] = [];
    if (isNumber(weather.temperatureC)) {
      const value = formatTemperature(weather.temperatureC, this.settings.temperature(), language);
      items.push({ icon: 'thermometer', value, label: 'weather.temperature' });
    }
    if (isNumber(weather.humidityPct)) {
      items.push({ icon: 'droplet', value: formatPercent(Math.round(weather.humidityPct), language), label: 'weather.humidity' });
    }
    if (isNumber(weather.windKmh)) {
      items.push({ icon: 'wind', value: formatWind(weather.windKmh, this.settings.wind(), language), label: 'weather.wind' });
    }
    if (isNumber(weather.daysWithoutRain)) {
      const count = Math.round(weather.daysWithoutRain);
      items.push({ icon: 'calendar', value: String(count), label: 'weather.dryDays', params: { count } });
    }
    return items;
  });
  /** 2.08 -> "2,1" | "2.1"; null leaves the card out. */
  protected readonly perYear = computed(() => {
    const value = this.firesPerYear();
    return value === null ? null : formatDecimal(value, this.i18n.language());
  });

  /**
   * Weights from backend/src/domain/service/RiskScoringService.ts (SCORE_WEIGHTS). A null value is a
   * placeholder: an older backend sends no factors in the zone list, so they wait for the detail.
   */
  protected readonly factors = computed((): { label: MessageKey; weight: number; value: number | null }[] => {
    const f = this.detail()?.factors ?? this.zone().factors;
    return [
      { label: 'factor.dryWeather', weight: 50, value: f?.dryWeather ?? null },
      { label: 'factor.nearbyHotspots', weight: 30, value: f?.nearbyHotspots ?? null },
      { label: 'factor.fireHistory', weight: 20, value: f?.fireHistory ?? null },
    ];
  });
}
