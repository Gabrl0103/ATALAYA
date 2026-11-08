import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, type Subscription } from 'rxjs';
import { apiErrorCode, type ApiErrorCode } from '../core/error/api-error';
import type { FireHistory, Hotspot, ZoneBoundaries, ZoneDetail, ZoneForecast, ZoneRiskSummary } from '../domain/model/risk';
import { FireRepository, ForecastRepository, HotspotRepository, ZoneRepository } from '../domain/repository/repositories';

/**
 * A zone's forecast (from the model), detail and fire records are reused this long (ms) when it is
 * tapped again in the same session.
 */
export const FORECAST_TTL_MS = 10 * 60_000;

interface Cached<T> {
  readonly value: T;
  readonly at: number;
}

/** The cached value of a zone while it is fresh. */
function fresh<T>(cache: ReadonlyMap<string, Cached<T>>, zoneId: string): T | undefined {
  const cached = cache.get(zoneId);
  return cached && Date.now() - cached.at < FORECAST_TTL_MS ? cached.value : undefined;
}

/** Where the 72 h forecast of the selected zone is: asking, answered, or the request failed. */
export type ForecastStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Same steps for the municipal boundaries; 'idle' again once their notice is closed. */
export type BoundariesStatus = ForecastStatus;

/** State of the map screen (zones, heat spots and the selected zone). Signals = simple and reactive. */
@Injectable({ providedIn: 'root' })
export class ZonesStore {
  private readonly zoneRepository = inject(ZoneRepository);
  private readonly hotspotRepository = inject(HotspotRepository);
  private readonly fireRepository = inject(FireRepository);
  private readonly forecastRepository = inject(ForecastRepository);

  readonly zones = signal<ZoneRiskSummary[]>([]);
  readonly hotspots = signal<Hotspot[]>([]);
  readonly selectedId = signal<string | null>(null);
  /** The selected zone as the map has it: enough to open its sheet before ZoneDetail arrives. */
  readonly selected = computed(() => this.zones().find((zone) => zone.id === this.selectedId()) ?? null);
  readonly detail = signal<ZoneDetail | null>(null);
  /** Fire records of the selected zone (its "incendios por año"); null until they arrive or if they fail. */
  readonly detailFires = signal<FireHistory | null>(null);
  /** Whether the fire records are still on their way (the sheet keeps the room of their card meanwhile). */
  readonly firesStatus = signal<ForecastStatus>('idle');
  /** 72 h forecast of the selected zone (the model, or its fallback to the current score). */
  readonly detailForecast = signal<ZoneForecast | null>(null);
  readonly forecastStatus = signal<ForecastStatus>('idle');
  /** Municipal outlines for the map; without them the map keeps working with the markers. */
  readonly boundaries = signal<ZoneBoundaries | null>(null);
  readonly boundariesStatus = signal<BoundariesStatus>('idle');
  readonly loading = signal(false);
  /** Why the zones could not load; the map and Inicio name it in the app's language. */
  readonly error = signal<ApiErrorCode | null>(null);
  readonly updatedAt = signal<Date | null>(null);

  /** Model forecasts by zone, with when they arrived (fallbacks are asked again: the model may be back). */
  private readonly forecasts = new Map<string, Cached<ZoneForecast>>();
  private readonly details = new Map<string, Cached<ZoneDetail>>();
  private readonly fires = new Map<string, Cached<FireHistory>>();
  /** The requests in flight for the selected zone, cancelled when another zone is tapped or the sheet closes. */
  private forecastRequest?: Subscription;
  private detailRequest?: Subscription;
  private firesRequest?: Subscription;

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      zones: this.zoneRepository.list(),
      hotspots: this.hotspotRepository.list(),
    }).subscribe({
      next: ({ zones, hotspots }) => {
        this.zones.set(zones);
        this.hotspots.set(hotspots);
        this.updatedAt.set(new Date());
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorCode(error));
        this.loading.set(false);
      },
    });
  }

  /** Asks for the boundaries once; again only after a failure (the notice's "Reintentar"). */
  loadBoundaries(): void {
    const status = this.boundariesStatus();
    if (status === 'loading' || status === 'ready') return;
    this.boundariesStatus.set('loading');
    this.zoneRepository.boundaries().subscribe({
      next: (boundaries) => {
        this.boundaries.set(boundaries);
        this.boundariesStatus.set('ready');
      },
      // Only the boundaries notice shows it: zones and markers do not depend on them.
      error: () => this.boundariesStatus.set('error'),
    });
  }

  dismissBoundariesError(): void {
    if (this.boundariesStatus() === 'error') this.boundariesStatus.set('idle');
  }

  /**
   * Asks for everything the zone sheet shows the moment the zone is tapped, in parallel with the
   * flight and the sheet opening (which do not wait for any of it).
   */
  select(zoneId: string): void {
    this.selectedId.set(zoneId);
    // First: it is the slowest answer (the model runs on the server).
    this.loadForecast(zoneId);
    this.loadDetail(zoneId);
    this.loadFires(zoneId);
  }

  /** Hotspots, factors and the weather (when the zone list did not bring them), from the cache if fresh. */
  private loadDetail(zoneId: string): void {
    this.detailRequest?.unsubscribe();
    const cached = fresh(this.details, zoneId);
    this.detail.set(cached ?? null);
    if (cached) return;
    this.detailRequest = this.zoneRepository.detail(zoneId).subscribe({
      next: (detail) => {
        this.details.set(zoneId, { value: detail, at: Date.now() });
        if (this.selectedId() === zoneId) this.detail.set(detail);
      },
      error: (error: unknown) => this.error.set(apiErrorCode(error)),
    });
  }

  private loadFires(zoneId: string): void {
    this.firesRequest?.unsubscribe();
    const cached = fresh(this.fires, zoneId);
    this.detailFires.set(cached ?? null);
    this.firesStatus.set(cached ? 'ready' : 'loading');
    if (cached) return;
    this.firesRequest = this.fireRepository.history(zoneId).subscribe({
      next: (history) => {
        this.fires.set(zoneId, { value: history, at: Date.now() });
        if (this.selectedId() !== zoneId) return;
        this.detailFires.set(history);
        this.firesStatus.set('ready');
      },
      // Without the records the sheet only leaves out its "incendios por año" card.
      error: () => {
        if (this.selectedId() === zoneId) this.firesStatus.set('error');
      },
    });
  }

  /** Asks again for the forecast of the selected zone (the sheet's "Reintentar"). */
  retryForecast(): void {
    const zoneId = this.selectedId();
    if (zoneId) this.loadForecast(zoneId);
  }

  /** From the session cache if fresh; otherwise asks, dropping the request of the zone tapped before. */
  private loadForecast(zoneId: string): void {
    this.forecastRequest?.unsubscribe();
    const cached = fresh(this.forecasts, zoneId);
    if (cached) {
      this.detailForecast.set(cached);
      this.forecastStatus.set('ready');
      return;
    }
    this.detailForecast.set(null);
    this.forecastStatus.set('loading');
    this.forecastRequest = this.forecastRepository.forecast(zoneId).subscribe({
      next: (forecast) => {
        if (forecast.source === 'model') this.forecasts.set(zoneId, { value: forecast, at: Date.now() });
        if (this.selectedId() !== zoneId) return;
        this.detailForecast.set(forecast);
        this.forecastStatus.set('ready');
      },
      // Only the forecast section shows the failure (with its own retry); the rest of the sheet stays.
      error: () => {
        if (this.selectedId() === zoneId) this.forecastStatus.set('error');
      },
    });
  }

  /**
   * «Borrar caché de datos» in Ajustes: forgets the forecasts, zone details, fire records and boundaries
   * kept in memory and asks for the boundaries again (the rest, the next time a zone is tapped).
   */
  clearCache(): void {
    this.forecasts.clear();
    this.details.clear();
    this.fires.clear();
    this.boundaries.set(null);
    this.boundariesStatus.set('idle');
    this.loadBoundaries();
    const zoneId = this.selectedId();
    if (zoneId) this.select(zoneId);
  }

  clearSelection(): void {
    this.forecastRequest?.unsubscribe();
    this.detailRequest?.unsubscribe();
    this.firesRequest?.unsubscribe();
    this.selectedId.set(null);
    this.detail.set(null);
    this.detailFires.set(null);
    this.firesStatus.set('idle');
    this.detailForecast.set(null);
    this.forecastStatus.set('idle');
  }

  dismissError(): void {
    this.error.set(null);
  }
}
