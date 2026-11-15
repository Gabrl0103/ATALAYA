import { Injectable, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import { apiErrorCode, type ApiErrorCode } from '../core/error/api-error';
import type { FireHistory } from '../domain/model/risk';
import { FireRepository } from '../domain/repository/repositories';

@Injectable({ providedIn: 'root' })
export class HistoryStore {
  private readonly fireRepository = inject(FireRepository);

  readonly history = signal<FireHistory | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiErrorCode | null>(null);

  private request?: Subscription;

  /** Records of a zone (or all of Nariño); a filter tapped before this one is dropped, so its late answer is lost. */
  load(zoneId?: string): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.request = this.fireRepository.history(zoneId).subscribe({
      next: (history) => {
        this.history.set(history);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorCode(error));
        this.loading.set(false);
      },
    });
  }
}
