import { Component, computed, inject, input, output } from '@angular/core';
import { API_ERROR_KEYS, type ApiErrorCode } from '../../../core/error/api-error';
import { ConnectionStatus } from '../../../core/network/connection-status';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import { AppIcon, type IconName } from '../app-icon/app-icon';

export type StateKind = 'loading' | 'empty' | 'error';

/** The icon of each failure: no connection is not the same as a server that broke. */
const ERROR_ICONS: Record<ApiErrorCode, IconName> = {
  network: 'wifi-off',
  notFound: 'search',
  server: 'alert',
  unexpected: 'alert',
};

/**
 * What a screen (or a part of it) shows when it has nothing to show yet: loading, empty or failed.
 * One look everywhere: a simple icon, one clear line and, for a failure, a «Reintentar» that really
 * asks again. While the server is waking up (Render sleeps) the loading state says so, so a slow
 * first load does not look stuck. TalkBack reads it as it appears (status, or alert for a failure).
 */
@Component({
  selector: 'app-state-message',
  imports: [AppIcon, TranslatePipe],
  host: {
    '[class.glass-card]': 'card()',
    '[class.is-error]': "kind() === 'error'",
    '[attr.role]': "kind() === 'error' ? 'alert' : 'status'",
  },
  template: `
    @if (kind() === 'loading') {
      <span class="spinner" aria-hidden="true"></span>
    } @else {
      <span class="icon" aria-hidden="true"><app-icon [name]="iconName()" [size]="24" /></span>
    }
    <p class="text">{{ message() }}</p>
    @if (kind() === 'loading' && connection.waking()) {
      <p class="hint">{{ 'state.waking' | t }}</p>
    }
    @if (kind() === 'error' && retryable()) {
      <button type="button" class="action" (click)="retry.emit()">{{ 'common.retry' | t }}</button>
    }
  `,
  styleUrl: './state-message.css',
})
export class StateMessage {
  readonly kind = input.required<StateKind>();
  /** The line to show; a failure without one says what its error code means. */
  readonly text = input<string>();
  /** The failure, for its text and icon. */
  readonly error = input<ApiErrorCode>();
  /** Icon of an empty state (a failure picks its own from the error). */
  readonly icon = input<IconName>('search');
  /** False when nothing can be asked again (the button would do nothing). */
  readonly retryable = input(true);
  /** Its own glass card; false inside a card that already has one. */
  readonly card = input(true);

  readonly retry = output<void>();

  protected readonly connection = inject(ConnectionStatus);
  private readonly i18n = inject(I18n);

  protected readonly iconName = computed<IconName>(() => {
    const error = this.error();
    return this.kind() === 'error' ? ERROR_ICONS[error ?? 'unexpected'] : this.icon();
  });

  protected readonly message = computed(() => {
    const text = this.text();
    if (text) return text;
    if (this.kind() === 'error') return this.i18n.t(API_ERROR_KEYS[this.error() ?? 'unexpected']);
    return this.i18n.t('common.loading');
  });
}
