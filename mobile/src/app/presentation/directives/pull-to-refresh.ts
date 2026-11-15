import { Directive, ElementRef, computed, inject, output, signal } from '@angular/core';
import { Haptic } from '../../core/haptics';

/** Pull (px, after the resistance) that asks for the data again when the finger lets go. */
export const PULL_THRESHOLD = 64;
/** The indicator stops here however far the finger goes. */
export const PULL_MAX = 96;

/** How far the indicator comes down for a finger moved `dy` px: half, with a ceiling; nothing upwards. */
export function pullDistance(dy: number): number {
  return dy <= 0 ? 0 : Math.min(PULL_MAX, dy / 2);
}

/**
 * Pull down from the top of a scrolling screen to ask for its data again (the same as the «Actualizar»
 * button next to «Actualizado …», which TalkBack and keyboards use). It only gives the host the
 * pull as CSS variables (--pull in px, --pull-ratio 0–1) and .is-pulling; the screen draws the arrow.
 */
@Directive({
  selector: '[appPullToRefresh]',
  host: {
    '[style.--pull.px]': 'pull()',
    '[style.--pull-ratio]': 'ratio()',
    '[class.is-pulling]': 'pull() > 0',
    '[class.is-armed]': 'ratio() === 1',
    '(touchstart)': 'start($event)',
    '(touchmove)': 'move($event)',
    '(touchend)': 'end()',
    '(touchcancel)': 'cancel()',
  },
})
export class PullToRefresh {
  readonly pullRefresh = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly haptic = inject(Haptic);
  protected readonly pull = signal(0);
  protected readonly ratio = computed(() => Math.min(1, this.pull() / PULL_THRESHOLD));
  private startY: number | null = null;

  protected start(event: TouchEvent): void {
    // Only from the very top: further down the finger is scrolling the screen.
    this.startY = this.host.nativeElement.scrollTop <= 0 ? (event.touches[0]?.clientY ?? null) : null;
  }

  protected move(event: TouchEvent): void {
    if (this.startY === null) return;
    const y = event.touches[0]?.clientY;
    if (y === undefined) return;
    const wasArmed = this.ratio() === 1;
    this.pull.set(pullDistance(y - this.startY));
    if (!wasArmed && this.ratio() === 1) this.haptic.tap();
  }

  protected end(): void {
    if (this.ratio() === 1) this.pullRefresh.emit();
    this.cancel();
  }

  protected cancel(): void {
    this.startY = null;
    this.pull.set(0);
  }
}
