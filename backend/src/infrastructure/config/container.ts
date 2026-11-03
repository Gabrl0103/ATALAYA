import { ZoneRiskCalculator } from '../../application/service/ZoneRiskCalculator.js';
import { GetFireHistoryUseCase } from '../../application/useCase/GetFireHistoryUseCase.js';
import { GetHotspotHistoryUseCase } from '../../application/useCase/GetHotspotHistoryUseCase.js';
import { GetHotspotsUseCase } from '../../application/useCase/GetHotspotsUseCase.js';
import { GetZoneBoundariesUseCase } from '../../application/useCase/GetZoneBoundariesUseCase.js';
import { GetZoneDetailUseCase } from '../../application/useCase/GetZoneDetailUseCase.js';
import { GetZoneForecastUseCase } from '../../application/useCase/GetZoneForecastUseCase.js';
import { GetZonesRiskUseCase } from '../../application/useCase/GetZonesRiskUseCase.js';
import { IngestDailyWeatherUseCase } from '../../application/useCase/IngestDailyWeatherUseCase.js';
import { IngestFireEventsUseCase } from '../../application/useCase/IngestFireEventsUseCase.js';
import { IngestHotspotHistoryUseCase } from '../../application/useCase/IngestHotspotHistoryUseCase.js';
import { IngestHotspotsUseCase } from '../../application/useCase/IngestHotspotsUseCase.js';
import { IngestWeatherUseCase } from '../../application/useCase/IngestWeatherUseCase.js';
import type {
  DailyWeatherRepository,
  FireEventRepository,
  HotspotDetectionRepository,
  HotspotRepository,
  WeatherRepository,
  ZoneRepository,
} from '../../domain/port/Repositories.js';
import { RiskScoringService } from '../../domain/service/RiskScoringService.js';
import { FirmsHotspotProvider } from '../external/FirmsHotspotProvider.js';
import { OpenMeteoArchiveProvider } from '../external/OpenMeteoArchiveProvider.js';
import { OpenMeteoForecastProvider } from '../external/OpenMeteoForecastProvider.js';
import { OpenMeteoWeatherProvider } from '../external/OpenMeteoWeatherProvider.js';
import { BOUNDARY_SOURCE, NARINO_BOUNDARIES } from '../geo/narinoBoundaries.js';
import {
  InMemoryDailyWeatherRepository,
  InMemoryFireEventRepository,
  InMemoryHotspotDetectionRepository,
  InMemoryHotspotRepository,
  InMemoryWeatherRepository,
  InMemoryZoneRepository,
} from '../persistence/InMemoryRepositories.js';
import {
  PostgresDailyWeatherRepository,
  PostgresFireEventRepository,
  PostgresHotspotDetectionRepository,
  PostgresHotspotRepository,
  PostgresWeatherRepository,
  PostgresZoneRepository,
} from '../persistence/PostgresRepositories.js';
import { RISK_MODEL } from '../ml/riskModel.js';
import { getPool } from '../persistence/postgresPool.js';
import { fireEvents, hotspots, weatherSnapshots, zones } from '../persistence/seedData.js';
import { createFireReportSources } from '../scraping/FireReportSourceFactory.js';
import type { IngestionJob } from '../scraping/IngestionScheduler.js';
import { env, type Env } from './env.js';

export interface Container {
  readonly getZonesRisk: GetZonesRiskUseCase;
  readonly getZoneDetail: GetZoneDetailUseCase;
  readonly getZoneForecast: GetZoneForecastUseCase;
  readonly getZoneBoundaries: GetZoneBoundariesUseCase;
  readonly getFireHistory: GetFireHistoryUseCase;
  readonly getHotspots: GetHotspotsUseCase;
  readonly getHotspotHistory: GetHotspotHistoryUseCase;
  /** Scheduled by the server (node-cron) and runnable once with `npm run ingest`. */
  readonly ingestionJobs: readonly IngestionJob[];
}

interface RepositorySet {
  readonly zones: ZoneRepository;
  readonly weather: WeatherRepository;
  readonly fireEvents: FireEventRepository;
  readonly hotspots: HotspotRepository;
  readonly dailyWeather: DailyWeatherRepository;
  readonly hotspotDetections: HotspotDetectionRepository;
}

/** Neon when DATABASE_URL exists; otherwise the in-memory test data (handy for local work and tests). */
function buildRepositories(config: Env): RepositorySet {
  if (config.databaseUrl) {
    const pool = getPool(config.databaseUrl);
    console.log('Persistence: PostgreSQL (Neon)');
    return {
      zones: new PostgresZoneRepository(pool),
      weather: new PostgresWeatherRepository(pool),
      fireEvents: new PostgresFireEventRepository(pool),
      hotspots: new PostgresHotspotRepository(pool),
      dailyWeather: new PostgresDailyWeatherRepository(pool),
      hotspotDetections: new PostgresHotspotDetectionRepository(pool),
    };
  }
  console.log('Persistence: in-memory test data (DATABASE_URL is not set)');
  return {
    zones: new InMemoryZoneRepository(zones),
    weather: new InMemoryWeatherRepository(weatherSnapshots),
    fireEvents: new InMemoryFireEventRepository(fireEvents),
    hotspots: new InMemoryHotspotRepository(hotspots),
    dailyWeather: new InMemoryDailyWeatherRepository(),
    hotspotDetections: new InMemoryHotspotDetectionRepository(),
  };
}

/** Composition root: the only place that knows which implementation is used. */
export function buildContainer(config: Env = env): Container {
  const repositories = buildRepositories(config);

  const riskCalculator = new ZoneRiskCalculator(
    repositories.weather,
    repositories.fireEvents,
    repositories.hotspots,
    new RiskScoringService(),
  );

  return {
    getZonesRisk: new GetZonesRiskUseCase(repositories.zones, riskCalculator),
    getZoneDetail: new GetZoneDetailUseCase(repositories.zones, riskCalculator),
    getZoneForecast: new GetZoneForecastUseCase(
      repositories.zones,
      riskCalculator,
      repositories.dailyWeather,
      repositories.hotspotDetections,
      new OpenMeteoForecastProvider(),
      RISK_MODEL,
    ),
    getZoneBoundaries: new GetZoneBoundariesUseCase({ source: BOUNDARY_SOURCE, boundaries: NARINO_BOUNDARIES.boundaries }),
    getFireHistory: new GetFireHistoryUseCase(repositories.fireEvents, repositories.zones),
    getHotspots: new GetHotspotsUseCase(repositories.hotspots),
    getHotspotHistory: new GetHotspotHistoryUseCase(repositories.hotspotDetections),
    ingestionJobs: buildIngestionJobs(repositories, config),
  };
}

function buildIngestionJobs(repositories: RepositorySet, config: Env): IngestionJob[] {
  const ingestWeather = new IngestWeatherUseCase(repositories.zones, new OpenMeteoWeatherProvider(), repositories.weather);
  const ingestDailyWeather = new IngestDailyWeatherUseCase(
    repositories.zones,
    new OpenMeteoArchiveProvider(),
    repositories.dailyWeather,
  );

  const jobs: IngestionJob[] = [
    {
      name: 'weather',
      schedule: '0 * * * *', // every hour
      runOnStart: true,
      run: async () => `${await ingestWeather.execute()} weather snapshots saved`,
    },
    {
      // Daily weather of the last 35 days for the 72 h forecast (Open-Meteo historical weather).
      name: 'weather-daily',
      schedule: '20 2 * * *', // once a day
      runOnStart: true,
      run: async () => `${await ingestDailyWeather.execute()} zone-days of daily weather saved`,
    },
  ];

  if (config.firmsMapKey) {
    const firms = new FirmsHotspotProvider(config.firmsMapKey);
    const ingestHotspots = new IngestHotspotsUseCase(firms, repositories.hotspots, repositories.hotspotDetections);
    const ingestHotspotHistory = new IngestHotspotHistoryUseCase(firms, repositories.hotspotDetections);
    jobs.push(
      {
        name: 'hotspots',
        schedule: '15 */3 * * *', // every 3 hours
        runOnStart: true,
        run: async () => {
          const { detected, stored } = await ingestHotspots.execute();
          return `${detected} detections, ${stored} hotspots stored after removing satellite duplicates`;
        },
      },
      {
        // The 35 days of raw detections the forecast needs; daily, so days missed while asleep come back.
        name: 'hotspots-history',
        schedule: '40 2 * * *', // once a day
        runOnStart: true,
        run: async () => `${await ingestHotspotHistory.execute()} detections of the last 35 days saved`,
      },
    );
  } else {
    console.log('Hotspots: MAP_KEY is not set, NASA FIRMS ingestion is off');
  }

  const ingestFires = new IngestFireEventsUseCase(repositories.zones, createFireReportSources(), repositories.fireEvents);
  jobs.push({
    name: 'fires',
    schedule: '30 3 * * *', // once a day, at night: scraping is slow on purpose
    runOnStart: false,
    run: async () => {
      const results = await ingestFires.execute();
      if (results.every((result) => result.error)) {
        throw new Error(results.map((result) => `${result.source}: ${result.error}`).join('; '));
      }
      return results
        .map((r) =>
          r.error
            ? `${r.source}: failed (${r.error})`
            : `${r.source}: ${r.read} read, ${r.wildfires} wildfires, ${r.found} in known zones, ${r.grouped} grouped into the same fire, ${r.inserted} saved`,
        )
        .join('; ');
    },
  });

  return jobs;
}
