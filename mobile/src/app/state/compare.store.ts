import { Injectable, computed, inject, signal } from '@angular/core';
import { ForecastRepository } from '../domain/repository/repositories';
import type { CompareForecast } from '../domain/util/compare';
import { FORECAST_TTL_MS } from './zones.store';

/** «Comparar» holds 2 or 3 municipalities (1 while the second is being picked). */
export const COMPARE_MAX = 3;

export type CompareAdd = 'added' | 'present' | 'full';

/**
 * The municipalities of «Comparar», while the app is open (nothing is saved), and their forecasts:
 * one request per zone, kept FORECAST_TTL_MS like the zone sheet does.
 */
@Injectable({ providedIn: 'root' })
export class CompareStore {
  private readonly forecastRepository = inject(ForecastRepository);

  readonly ids = signal<readonly string[]>([]);
  readonly full = computed(() => this.ids().length >= COMPARE_MAX);
  /** A zone asked for from its sheet when the comparison was full: «Comparar» offers it once there is room. */
  readonly pending = signal<string | null>(null);
  readonly forecasts = signal<Readonly<Record<string, CompareForecast>>>({});
  private readonly loadedAt = new Map<string, number>();

  has(zoneId: string): boolean {
    return this.ids().includes(zoneId);
  }

  add(zoneId: string): CompareAdd {
    if (this.has(zoneId)) return 'present';
    if (this.full()) {
      this.pending.set(zoneId);
      return 'full';
    }
    this.ids.update((ids) => [...ids, zoneId]);
    if (this.pending() === zoneId) this.pending.set(null);
    this.loadForecast(zoneId);
    return 'added';
  }

  remove(zoneId: string): void {
    this.ids.update((ids) => ids.filter((id) => id !== zoneId));
  }

  /** Asks for the forecast unless a recent answer (or a request) is there; a failure is asked again. */
  loadForecast(zoneId: string): void {
    const current = this.forecasts()[zoneId];
    const at = this.loadedAt.get(zoneId);
    if (current?.status === 'loading') return;
    if (current?.status === 'ready' && at !== undefined && Date.now() - at < FORECAST_TTL_MS) return;
    this.setForecast(zoneId, { status: 'loading' });
    this.forecastRepository.forecast(zoneId).subscribe({
      next: (forecast) => {
        this.loadedAt.set(zoneId, Date.now());
        this.setForecast(zoneId, { status: 'ready', forecast });
      },
      error: () => this.setForecast(zoneId, { status: 'error' }),
    });
  }

  private setForecast(zoneId: string, forecast: CompareForecast): void {
    this.forecasts.update((all) => ({ ...all, [zoneId]: forecast }));
  }
}
