import type { Observable } from 'rxjs';
import type { FireHistory, Hotspot, HotspotHistory, ZoneBoundaries, ZoneDetail, ZoneForecast, ZoneRiskSummary } from '../model/risk';

/** Ports of the app. Abstract classes double as Angular DI tokens. */
export abstract class ZoneRepository {
  abstract list(): Observable<ZoneRiskSummary[]>;
  abstract detail(zoneId: string): Observable<ZoneDetail>;
  abstract boundaries(): Observable<ZoneBoundaries>;
}

export abstract class FireRepository {
  abstract history(zoneId?: string): Observable<FireHistory>;
}

export abstract class HotspotRepository {
  abstract list(): Observable<Hotspot[]>;
}

export abstract class ForecastRepository {
  abstract forecast(zoneId: string): Observable<ZoneForecast>;
}

/** GET /api/hotspots/history (v0.34): a backend without it answers 404, and the replay says so. */
export abstract class HotspotHistoryRepository {
  abstract history(): Observable<HotspotHistory>;
}
