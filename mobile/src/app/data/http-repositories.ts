import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, map } from 'rxjs';
import { API_BASE_URL } from '../core/config/api-config';
import type { FireHistory, HistoryHotspot, Hotspot, HotspotHistory, ZoneBoundaries, ZoneDetail, ZoneForecast, ZoneRiskSummary } from '../domain/model/risk';
import {
  FireRepository, ForecastRepository, HotspotHistoryRepository, HotspotRepository, ZoneRepository,
} from '../domain/repository/repositories';

@Injectable()
export class HttpZoneRepository extends ZoneRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(): Observable<ZoneRiskSummary[]> {
    return this.http.get<ZoneRiskSummary[]>(`${this.baseUrl}/zones`);
  }

  detail(zoneId: string): Observable<ZoneDetail> {
    return this.http.get<ZoneDetail>(`${this.baseUrl}/zones/${encodeURIComponent(zoneId)}`);
  }

  boundaries(): Observable<ZoneBoundaries> {
    return this.http.get<ZoneBoundaries>(`${this.baseUrl}/zones/boundaries`);
  }
}

@Injectable()
export class HttpFireRepository extends FireRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  history(zoneId?: string): Observable<FireHistory> {
    const query = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : '';
    return this.http.get<FireHistory>(`${this.baseUrl}/fires${query}`);
  }
}

@Injectable()
export class HttpHotspotRepository extends HotspotRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(): Observable<Hotspot[]> {
    return this.http.get<Hotspot[]>(`${this.baseUrl}/hotspots`);
  }
}

@Injectable()
export class HttpForecastRepository extends ForecastRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  forecast(zoneId: string): Observable<ZoneForecast> {
    return this.http.get<ZoneForecast>(`${this.baseUrl}/zones/${encodeURIComponent(zoneId)}/forecast`);
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The API's { lat, lon, date, satellite } as the app's HistoryHotspot; a row of another shape is dropped. */
export function parseHotspotHistory(body: unknown): HotspotHistory {
  const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const rows = Array.isArray(data['hotspots']) ? (data['hotspots'] as unknown[]) : [];
  const hotspots = rows.flatMap((row): HistoryHotspot[] => {
    if (typeof row !== 'object' || row === null) return [];
    const { lat, lon, date, satellite } = row as Record<string, unknown>;
    return finite(lat) && finite(lon) && typeof date === 'string' && DAY.test(date)
      ? [{ latitude: lat, longitude: lon, date, satellite: typeof satellite === 'string' ? satellite : '' }]
      : [];
  });
  const from = typeof data['from'] === 'string' && DAY.test(data['from']) ? data['from'] : (hotspots[0]?.date ?? '');
  const to = typeof data['to'] === 'string' && DAY.test(data['to']) ? data['to'] : (hotspots.at(-1)?.date ?? from);
  return { from, to, hotspots };
}

@Injectable()
export class HttpHotspotHistoryRepository extends HotspotHistoryRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** The last 35 days up to today (the backend's default range). */
  history(): Observable<HotspotHistory> {
    return this.http.get<unknown>(`${this.baseUrl}/hotspots/history`).pipe(map(parseHotspotHistory));
  }
}
