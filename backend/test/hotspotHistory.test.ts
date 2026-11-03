import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import {
  GetHotspotHistoryUseCase,
  HOTSPOT_HISTORY_CACHE_MS,
  HOTSPOT_HISTORY_MAX_DAYS,
  resolveHistoryRange,
} from '../src/application/useCase/GetHotspotHistoryUseCase.js';
import { ValidationError } from '../src/domain/error/DomainErrors.js';
import type { RawDetection } from '../src/domain/model/Hotspot.js';
import type { Container } from '../src/infrastructure/config/container.js';
import { InMemoryHotspotDetectionRepository } from '../src/infrastructure/persistence/InMemoryRepositories.js';
import { createApp } from '../src/presentation/http/app.js';

/** 3 Nov 2026, 10:00 in Colombia (UTC-5). */
const NOW = new Date('2026-11-03T15:00:00Z');

const detection = (source: string, detectedAt: string, latitude = 1.2, longitude = -77.3): RawDetection => ({
  source,
  latitude,
  longitude,
  detectedAt,
});

const DETECTIONS: RawDetection[] = [
  // 2 Nov, local: the same fire seen by two satellites 1 h apart (counts once) and another fire.
  detection('VIIRS_SNPP_NRT', '2026-11-02T18:00:00Z'),
  detection('VIIRS_NOAA20_NRT', '2026-11-02T19:00:00Z', 1.2003, -77.3002),
  detection('VIIRS_NOAA21_NRT', '2026-11-02T19:30:00Z', 1.5, -77.9),
  // 03:00 UTC of 3 Nov is still 2 Nov (22:00) in Colombia.
  detection('VIIRS_NOAA21_NRT', '2026-11-03T03:00:00Z', 0.9, -77.6),
  // 1 Nov, local.
  detection('VIIRS_SNPP_NRT', '2026-11-01T06:00:00Z', 2.1, -78.4),
  // Out of every range asked below.
  detection('VIIRS_SNPP_NRT', '2026-09-01T12:00:00Z', 1.8, -78.8),
];

function useCase(detections: readonly RawDetection[] = DETECTIONS, now: () => Date = () => NOW) {
  const repository = new InMemoryHotspotDetectionRepository(detections);
  let reads = 0;
  const counting = {
    ...repository,
    findSince: (since: string) => {
      reads++;
      return repository.findSince(since);
    },
  } as unknown as InMemoryHotspotDetectionRepository;
  return { history: new GetHotspotHistoryUseCase(counting, now), reads: () => reads };
}

describe('resolveHistoryRange', () => {
  it('asks for the last 35 local days up to today by default', () => {
    assert.deepEqual(resolveHistoryRange(undefined, undefined, NOW), { from: '2026-09-30', to: '2026-11-03' });
    assert.deepEqual(resolveHistoryRange(undefined, '2026-11-01', NOW), { from: '2026-09-28', to: '2026-11-01' });
  });

  it('takes «today» in Colombia, not in UTC', () => {
    // 2 Nov at 21:00 in Colombia is already 3 Nov in UTC: 3 Nov is still in the future.
    assert.throws(() => resolveHistoryRange('2026-11-01', '2026-11-03', new Date('2026-11-03T02:00:00Z')), ValidationError);
  });

  it('accepts a range of exactly 35 days and rejects 36', () => {
    assert.deepEqual(resolveHistoryRange('2026-09-30', '2026-11-03', NOW), { from: '2026-09-30', to: '2026-11-03' });
    assert.equal(HOTSPOT_HISTORY_MAX_DAYS, 35);
    assert.throws(() => resolveHistoryRange('2026-09-29', '2026-11-03', NOW), /at most 35 days/);
  });

  it('rejects from after to, a future to and dates that do not exist', () => {
    assert.throws(() => resolveHistoryRange('2026-11-02', '2026-11-01', NOW), /from must not be after to/);
    assert.throws(() => resolveHistoryRange('2026-11-01', '2026-11-04', NOW), /after today/);
    for (const bad of ['2026-02-30', '2026-13-01', '3/11/2026', '', '2026-11-1']) {
      assert.throws(() => resolveHistoryRange(bad, '2026-11-03', NOW), ValidationError, bad);
    }
  });
});

describe('GetHotspotHistoryUseCase', () => {
  it('gives each heat spot of the range with its local day and satellite, a fire seen twice once', async () => {
    const { history } = useCase();
    const result = await history.execute('2026-11-01', '2026-11-03');
    assert.deepEqual(result.from, '2026-11-01');
    assert.deepEqual(result.to, '2026-11-03');
    assert.deepEqual(
      result.hotspots.map((h) => [h.date, h.satellite, h.latitude]),
      [
        ['2026-11-01', 'SNPP', 2.1],
        ['2026-11-02', 'SNPP', 1.2],
        ['2026-11-02', 'NOAA21', 1.5],
        ['2026-11-02', 'NOAA21', 0.9],
      ],
    );
  });

  it('leaves out the days outside the range', async () => {
    const { history } = useCase();
    const result = await history.execute('2026-11-02', '2026-11-02');
    assert.deepEqual([...new Set(result.hotspots.map((h) => h.date))], ['2026-11-02']);
    assert.equal(result.hotspots.length, 3);
    assert.deepEqual((await history.execute('2026-10-01', '2026-10-31')).hotspots, []);
  });

  it('answers the same range from memory for 10 minutes', async () => {
    let now = NOW;
    const { history, reads } = useCase(DETECTIONS, () => now);
    await history.execute('2026-11-01', '2026-11-03');
    await history.execute('2026-11-01', '2026-11-03');
    assert.equal(reads(), 1);
    await history.execute('2026-11-02', '2026-11-03'); // another range: asked again
    assert.equal(reads(), 2);
    now = new Date(NOW.getTime() + HOTSPOT_HISTORY_CACHE_MS + 1);
    await history.execute('2026-11-01', '2026-11-03');
    assert.equal(reads(), 3);
  });

  it('does not keep a failure in memory', async () => {
    let fail = true;
    const repository = {
      findSince: async () => {
        if (fail) throw new Error('database down');
        return DETECTIONS;
      },
    } as unknown as InMemoryHotspotDetectionRepository;
    const history = new GetHotspotHistoryUseCase(repository, () => NOW);
    await assert.rejects(history.execute('2026-11-01', '2026-11-03'), /database down/);
    fail = false;
    assert.equal((await history.execute('2026-11-01', '2026-11-03')).hotspots.length, 4);
  });
});

describe('GET /api/hotspots/history', () => {
  async function get(path: string) {
    const container = { getHotspotHistory: useCase().history } as unknown as Container;
    const server = createApp(container).listen(0);
    await once(server, 'listening');
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      return { status: response.status, cache: response.headers.get('cache-control'), body: (await response.json()) as Record<string, unknown> };
    } finally {
      server.close();
    }
  }

  it('answers the least the replay needs, with coordinates rounded and a 10 min cache', async () => {
    const { status, cache, body } = await get('/api/hotspots/history?from=2026-11-01&to=2026-11-03');
    assert.equal(status, 200);
    assert.equal(cache, 'public, max-age=600');
    assert.equal(body['from'], '2026-11-01');
    assert.equal(body['to'], '2026-11-03');
    const hotspots = body['hotspots'] as Array<Record<string, unknown>>;
    assert.equal(hotspots.length, 4);
    assert.deepEqual(Object.keys(hotspots[0]!).sort(), ['date', 'lat', 'lon', 'satellite']);
    assert.deepEqual(hotspots[0], { lat: 2.1, lon: -78.4, date: '2026-11-01', satellite: 'SNPP' });
  });

  it('answers 400 for a range that is too long, backwards, repeated or not a date', async () => {
    for (const query of [
      '?from=2026-09-01&to=2026-11-03',
      '?from=2026-11-03&to=2026-11-01',
      '?from=2026-11-01&from=2026-11-02',
      '?to=mañana',
    ]) {
      const { status, body } = await get(`/api/hotspots/history${query}`);
      assert.equal(status, 400, query);
      assert.equal(body['error'], 'VALIDATION_ERROR', query);
    }
  });
});
