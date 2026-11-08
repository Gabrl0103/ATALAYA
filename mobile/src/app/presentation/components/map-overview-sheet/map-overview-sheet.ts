import { Component, computed, inject, input, output, signal } from '@angular/core';
import type { RiskLevel } from '../../../domain/model/risk';
import { RISK_RANGES } from '../../../domain/util/risk-labels';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import { translate, type Language } from '../../../i18n/translate';
import { RiskBadge } from '../risk-badge/risk-badge';
import { FLICK_VELOCITY } from '../zone-sheet/sheet-snap';

const LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high', 'extreme'];
/** Movement (px) below which a press on the top of the sheet is a tap, not a drag. */
const TAP_SLOP = 6;
/** A drag this long (px) opens or lowers the sheet... */
export const DRAG_DISTANCE = 40;
/** ...and while the finger moves it the sheet follows, up to this far up (it has nothing more above). */
const MAX_LIFT = 24;
/** A finger that stops this long (ms) before lifting releases with no speed. */
const STILL_MS = 100;

/**
 * Whether the sheet ends open after a drag of `dy` px (negative: up) released at `velocity` px/ms
 * (positive: down). A flick or a drag past DRAG_DISTANCE moves it; anything less leaves it as it was.
 */
export function overviewOpenAfterDrag(open: boolean, dy: number, velocity: number): boolean {
  if (velocity <= -FLICK_VELOCITY || dy <= -DRAG_DISTANCE) return true;
  if (velocity >= FLICK_VELOCITY || dy >= DRAG_DISTANCE) return false;
  return open;
}

interface DragState {
  readonly pointerId: number;
  readonly startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
}

/** "64 municipios · 12 focos de calor recientes" | "64 municipalities · 12 recent heat spots", singular for one. */
export function overviewCounts(zoneCount: number, hotspotCount: number, language: Language = 'es'): string {
  const zones = translate(language, 'overview.zones', { count: zoneCount });
  return `${zones} · ${translate(language, 'overview.hotspots', { count: hotspotCount })}`;
}

/**
 * Bottom sheet of the map while no zone is selected. Low by default (title, the four levels and a
 * way back to the whole department) so the map has room; dragged up (or the handle tapped) it adds
 * the numbers, the ranges, the hotspot key and the disclaimer. Its height only changes when it
 * settles, so the map frames Nariño again once, not on every pixel of the drag.
 */
@Component({
  selector: 'app-map-overview-sheet',
  imports: [RiskBadge, TranslatePipe],
  // While dragged the whole sheet follows the finger (the section's entry animation owns its own transform).
  host: { '[style.transform]': 'dragTransform()', '[class.is-dragging]': 'dragOffset() !== null' },
  template: `
    <section class="overview anim-sheet" [class.is-open]="open()" aria-labelledby="overview-title">
      <div
        class="drag-area"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerCancel($event)"
      >
        <button
          type="button"
          class="handle"
          [attr.aria-label]="(open() ? 'overview.hideDetails' : 'overview.showDetails') | t"
          [attr.aria-expanded]="open()"
          (click)="toggle()"
        >
          <span></span>
        </button>
        <h2 id="overview-title">{{ 'overview.title' | t }}</h2>
        @if (open()) {
          <p class="counts">{{ counts() }}</p>
        }
      </div>
      <ul class="legend" [attr.aria-label]="'overview.legend' | t">
        @for (level of levels; track level) {
          <li>
            <app-risk-badge [level]="level" />
            @if (open()) {
              <small class="range mono">{{ ranges[level] }}</small>
            }
          </li>
        }
      </ul>
      @if (open()) {
        <p class="hotspot-key"><span class="dot"></span>{{ 'overview.hotspotKey' | t }}</p>
      }
      @if (canZoom()) {
        <button type="button" class="zoom" (click)="zoomRequested.emit()">{{ 'overview.zoom' | t }}</button>
      }
      @if (open() && updatedLabel()) {
        <p class="note"><span class="mono">{{ updatedLabel() }}</span></p>
      }
    </section>
  `,
  styleUrl: './map-overview-sheet.css',
})
export class MapOverviewSheet {
  /** Zones with a score; 0 while they load. */
  readonly zoneCount = input.required<number>();
  readonly hotspotCount = input.required<number>();
  readonly updatedLabel = input<string>('');
  /** False without a map (no WebGL): then there is nothing to zoom. */
  readonly canZoom = input(true);
  readonly zoomRequested = output<void>();

  protected readonly levels = LEVELS;
  protected readonly ranges = RISK_RANGES;
  protected readonly open = signal(false);
  /** How far (px) the finger has moved the sheet; null when it rests. */
  protected readonly dragOffset = signal<number | null>(null);
  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === null ? null : `translateY(${offset}px)`;
  });
  private readonly i18n = inject(I18n);
  protected readonly counts = computed(() =>
    this.zoneCount() === 0
      ? this.i18n.t('overview.loadingZones')
      : overviewCounts(this.zoneCount(), this.hotspotCount(), this.i18n.language()),
  );

  private drag?: DragState;
  /** The click that follows a drag on the handle must not toggle the sheet. */
  private suppressClick = false;

  protected toggle(): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.open.set(!this.open());
  }

  protected onPointerDown(event: PointerEvent): void {
    this.suppressClick = false;
    if (event.button !== 0) return;
    this.drag = { pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, moved: false };
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
    // Up it only gives a little (the rest shows when it opens); down it follows the finger.
    this.dragOffset.set(Math.max(dy, -MAX_LIFT));
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = undefined;
    if (!drag.moved) return;
    this.suppressClick = true;
    const velocity = event.timeStamp - drag.lastTime > STILL_MS ? 0 : drag.velocity;
    this.dragOffset.set(null);
    this.open.set(overviewOpenAfterDrag(this.open(), event.clientY - drag.startY, velocity));
  }

  protected onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.drag?.pointerId) return;
    this.drag = undefined;
    this.dragOffset.set(null);
  }
}
