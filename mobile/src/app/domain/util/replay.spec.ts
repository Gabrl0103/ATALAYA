import { parseHotspotHistory } from '../../data/http-repositories';
import { historyDays, replayDays, stepMs } from './replay';

describe('historyDays', () => {
  it('lists every day of the range, both ends included', () => {
    expect(historyDays('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(historyDays('2026-11-02', '2026-11-02')).toEqual(['2026-11-02']);
  });

  it('never gives more than 35 days, and nothing for a broken range', () => {
    expect(historyDays('2026-01-01', '2026-11-03')).toHaveLength(35);
    expect(historyDays('2026-11-03', '2026-11-01')).toEqual([]);
    expect(historyDays('', '2026-11-01')).toEqual([]);
  });
});

describe('replayDays', () => {
  it('gives each day its heat spots, also the quiet ones', () => {
    const at = (date: string, latitude: number) => ({ latitude, longitude: -77, date, satellite: 'SNPP' });
    const days = replayDays({ from: '2026-11-01', to: '2026-11-03', hotspots: [at('2026-11-01', 1), at('2026-11-03', 2), at('2026-11-01', 3)] });
    expect(days.map((d) => [d.date, d.hotspots.map((h) => h.latitude)])).toEqual([
      ['2026-11-01', [1, 3]],
      ['2026-11-02', []],
      ['2026-11-03', [2]],
    ]);
  });

  it('plays one day per second at 1x and two at 2x', () => {
    expect(stepMs(1)).toBe(1000);
    expect(stepMs(2)).toBe(500);
  });
});

describe('parseHotspotHistory', () => {
  it('reads the API rows and drops any of another shape', () => {
    expect(
      parseHotspotHistory({
        from: '2026-11-01',
        to: '2026-11-03',
        hotspots: [
          { lat: 1.2, lon: -77.3, date: '2026-11-02', satellite: 'NOAA20' },
          { lat: '1.2', lon: -77.3, date: '2026-11-02' },
          { lat: 1.2, lon: -77.3, date: 'ayer' },
          null,
          { lat: 1.5, lon: -77.9, date: '2026-11-03' },
        ],
      }),
    ).toEqual({
      from: '2026-11-01',
      to: '2026-11-03',
      hotspots: [
        { latitude: 1.2, longitude: -77.3, date: '2026-11-02', satellite: 'NOAA20' },
        { latitude: 1.5, longitude: -77.9, date: '2026-11-03', satellite: '' },
      ],
    });
  });

  it('reads an answer without rows (or without a range) as no heat spots', () => {
    expect(parseHotspotHistory({ from: '2026-11-01', to: '2026-11-03' })).toEqual({ from: '2026-11-01', to: '2026-11-03', hotspots: [] });
    expect(parseHotspotHistory(null)).toEqual({ from: '', to: '', hotspots: [] });
  });
});
