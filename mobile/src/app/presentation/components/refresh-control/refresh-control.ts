import { Component, computed, inject, input, output } from '@angular/core';
import { Haptic } from '../../../core/haptics';
import { formatDateTime, formatTime } from '../../../domain/util/format';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import { AppIcon } from '../app-icon/app-icon';

/**
 * «Actualizado 05:07 p. m.» with a button that asks for the data again. While it is asking the arrow
 * turns and a second tap does nothing (the request already on its way is the answer). When the last
 * request failed and older data is shown it says «Sin conexión · datos del 15 nov. 2026, 5:07 p. m.».
 */
@Component({
  selector: 'app-refresh-control',
  imports: [AppIcon, TranslatePipe],
  template: `
    <span class="updated mono" aria-live="polite">{{ label() }}</span>
    <button
      type="button"
      class="refresh"
      [class.is-busy]="loading()"
      [attr.aria-busy]="loading()"
      [attr.aria-label]="'refresh.action' | t"
      (click)="request()"
    >
      <app-icon name="refresh" [size]="18" />
    </button>
  `,
  styleUrl: './refresh-control.css',
})
export class RefreshControl {
  /** When the data shown arrived; null while it has not. */
  readonly updatedAt = input<Date | null>(null);
  readonly loading = input(false);
  /** The data shown is older because asking for new data failed. */
  readonly offline = input(false);
  readonly refresh = output<void>();

  private readonly i18n = inject(I18n);
  private readonly haptic = inject(Haptic);

  protected readonly label = computed(() => {
    const date = this.updatedAt();
    if (!date) return this.i18n.t('map.loading');
    if (this.offline()) return this.i18n.t('offline.notice', { date: formatDateTime(date, this.i18n.language()) });
    return this.i18n.t('map.updated', { time: formatTime(date, this.i18n.language()) });
  });

  protected request(): void {
    if (this.loading()) return;
    this.haptic.tap();
    this.refresh.emit();
  }
}
