import { Component, DestroyRef, computed, effect, inject, output, signal, untracked } from '@angular/core';
import type { HistoryHotspot } from '../../../domain/model/risk';
import { HotspotHistoryRepository } from '../../../domain/repository/repositories';
import { formatDateMedium } from '../../../domain/util/format';
import { replayDays, stepMs, type ReplayDay } from '../../../domain/util/replay';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import { AppIcon } from '../app-icon/app-icon';

type Status = 'loading' | 'ready' | 'error';

/**
 * «Historial de focos»: a bar at the bottom of the map with the last ~35 days. The slider (or play) picks a
 * day and the map shows only that day's heat spots (`dayShown`); closing it brings the recent ones back.
 */
@Component({
  selector: 'app-hotspot-replay',
  imports: [AppIcon, TranslatePipe],
  template: `
    <section class="replay anim-up" aria-labelledby="replay-title">
      <header class="replay-head">
        <h2 id="replay-title">{{ 'replay.title' | t }}</h2>
        <button type="button" class="round" [attr.aria-label]="'replay.close' | t" (click)="closed.emit()">
          <app-icon name="x" [size]="20" />
        </button>
      </header>
      @switch (status()) {
        @case ('loading') {
          <p class="status" role="status">{{ 'replay.loading' | t }}</p>
        }
        @case ('error') {
          <div class="status error" role="alert">
            <p>{{ 'replay.error' | t }}</p>
            <button type="button" class="action" (click)="load()">{{ 'common.retry' | t }}</button>
          </div>
        }
        @default {
          @if (day(); as current) {
            <p class="day" aria-live="polite">
              <b class="mono">{{ dateLabel(current.date) }}</b>
              <span>{{ 'replay.count' | t: { count: current.hotspots.length } }}</span>
            </p>
            <input
              type="range"
              class="slider"
              min="0"
              [max]="days().length - 1"
              step="1"
              [value]="index()"
              [attr.aria-label]="'replay.date' | t"
              [attr.aria-valuetext]="dateLabel(current.date)"
              (input)="seek($event)"
            />
            <div class="controls">
              <button
                type="button"
                class="round play"
                [attr.aria-label]="(playing() ? 'replay.pause' : 'replay.play') | t"
                (click)="togglePlay()"
              >
                <app-icon [name]="playing() ? 'pause' : 'play'" [size]="20" />
              </button>
              <button type="button" class="action mono" [attr.aria-label]="'replay.speed' | t: { speed: nextSpeed() }" (click)="toggleSpeed()">
                {{ speed() }}x
              </button>
              <span class="range">{{ 'replay.range' | t: { from: dateLabel(days()[0]!.date), to: dateLabel(days().at(-1)!.date) } }}</span>
            </div>
          }
        }
      }
    </section>
  `,
  styleUrl: './hotspot-replay.css',
})
export class HotspotReplay {
  /** The heat spots of the day shown; the map draws them. */
  readonly dayShown = output<readonly HistoryHotspot[]>();
  readonly closed = output<void>();

  private readonly repository = inject(HotspotHistoryRepository);
  private readonly i18n = inject(I18n);

  protected readonly status = signal<Status>('loading');
  protected readonly days = signal<readonly ReplayDay[]>([]);
  /** Starts on the most recent day. */
  protected readonly index = signal(0);
  protected readonly playing = signal(false);
  protected readonly speed = signal<1 | 2>(1);
  protected readonly nextSpeed = computed(() => (this.speed() === 1 ? 2 : 1));
  protected readonly day = computed(() => this.days()[this.index()] ?? null);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    this.load();
    effect(() => {
      const day = this.day();
      if (day) untracked(() => this.dayShown.emit(day.hotspots));
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  load(): void {
    this.stop();
    this.status.set('loading');
    this.repository.history().subscribe({
      next: (history) => {
        const days = replayDays(history);
        this.days.set(days);
        this.index.set(Math.max(days.length - 1, 0));
        this.status.set(days.length > 0 ? 'ready' : 'error');
      },
      error: () => this.status.set('error'),
    });
  }

  protected dateLabel(date: string): string {
    return formatDateMedium(date, this.i18n.language());
  }

  protected seek(event: Event): void {
    this.stop();
    this.index.set(Number((event.target as HTMLInputElement).value));
  }

  /** From the last day, play starts again from the first. */
  protected togglePlay(): void {
    if (this.playing()) {
      this.stop();
      return;
    }
    if (this.index() >= this.days().length - 1) this.index.set(0);
    this.playing.set(true);
    this.schedule();
  }

  protected toggleSpeed(): void {
    this.speed.set(this.nextSpeed());
    if (this.playing()) this.schedule();
  }

  private schedule(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.index() >= this.days().length - 1) {
        this.stop();
        return;
      }
      this.index.update((i) => i + 1);
    }, stepMs(this.speed()));
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.playing.set(false);
  }
}
