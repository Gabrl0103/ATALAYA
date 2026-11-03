import { Router, type Request } from 'express';
import { ValidationError } from '../../domain/error/DomainErrors.js';
import type { Container } from '../../infrastructure/config/container.js';
import { toHotspotHistoryDto, toZoneBoundariesDto, toZoneDetailDto, toZoneForecastDto } from '../dto/dtos.js';

/** The boundaries only change with a new build, so phones may keep them a day (Express adds the ETag). */
const BOUNDARIES_CACHE_CONTROL = 'public, max-age=86400';
/** The replay's days change with each FIRMS fetch (every 3 h): ten minutes on the phone is enough. */
const HOTSPOT_HISTORY_CACHE_CONTROL = 'public, max-age=600';

/** An optional text query parameter; repeated (?from=a&from=b) or of another shape is an error. */
function optionalQuery(req: Request, name: string): string | undefined {
  const value = req.query[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`Invalid parameter: ${name}`);
  return value;
}

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`Missing parameter: ${name}`);
  }
  return value;
}

/** Controllers are thin: read the request, call one use case, answer. */
export function createRouter(container: Container): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/zones', async (_req, res) => {
    res.json(await container.getZonesRisk.execute());
  });

  // Before /zones/:id, or Express would take "boundaries" as a zone id.
  router.get('/zones/boundaries', (_req, res) => {
    res.set('Cache-Control', BOUNDARIES_CACHE_CONTROL).json(toZoneBoundariesDto(container.getZoneBoundaries.execute()));
  });

  router.get('/zones/:id', async (req, res) => {
    const detail = await container.getZoneDetail.execute(requireParam(req, 'id'));
    res.json(toZoneDetailDto(detail));
  });

  router.get('/zones/:id/forecast', async (req, res) => {
    res.json(toZoneForecastDto(await container.getZoneForecast.execute(requireParam(req, 'id'))));
  });

  router.get('/fires', async (req, res) => {
    const zoneId = typeof req.query['zoneId'] === 'string' ? req.query['zoneId'] : undefined;
    res.json(await container.getFireHistory.execute(zoneId));
  });

  router.get('/hotspots', async (_req, res) => {
    res.json(await container.getHotspots.execute());
  });

  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (local days, both optional): at most HOTSPOT_HISTORY_MAX_DAYS.
  router.get('/hotspots/history', async (req, res) => {
    const history = await container.getHotspotHistory.execute(optionalQuery(req, 'from'), optionalQuery(req, 'to'));
    res.set('Cache-Control', HOTSPOT_HISTORY_CACHE_CONTROL).json(toHotspotHistoryDto(history));
  });

  return router;
}
