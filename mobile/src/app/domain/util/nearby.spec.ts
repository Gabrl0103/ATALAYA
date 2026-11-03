import type { Hotspot, ZoneBoundaries, ZoneRiskSummary } from '../model/risk';
import { NEARBY_HOTSPOT_MAX_KM, nearbySummary } from './nearby';

const ZONES: ZoneRiskSummary[] = [
  { id: 'pasto', name: 'Pasto', latitude: 1.2136, longitude: -77.2811, score: 20, level: 'low' },
  { id: 'chachagui', name: 'Chachagüí', latitude: 1.3605, longitude: -77.2819, score: 62, level: 'high' },
];

const BOUNDARIES: ZoneBoundaries = {
  type: 'FeatureCollection',
  source: 'test',
  features: [
    {
      type: 'Feature',
      id: 'pasto',
      properties: { id: 'pasto', divipola: 52001, name: 'Pasto' },
      geometry: { type: 'Polygon', coordinates: [[[-77.4, 1.0], [-77.1, 1.0], [-77.1, 1.3], [-77.4, 1.3], [-77.4, 1.0]]] },
    },
  ],
};

const hotspot = (id: string, latitude: number, longitude: number): Hotspot => ({
  id,
  latitude,
  longitude,
  detectedAt: '2026-11-02T18:00:00Z',
});

describe('nearbySummary', () => {
  it('names the municipality that holds the point, even when another seat is closer', () => {
    // 1.29 N is inside Pasto's boundary but closer to Chachagüí's seat.
    const summary = nearbySummary(1.29, -77.28, ZONES, [], BOUNDARIES)!;
    expect(summary.zone.id).toBe('pasto');
    expect(summary.place).toBe('inside');
  });

  it('says it is outside Nariño and gives the closest seat when no boundary holds it', () => {
    const summary = nearbySummary(1.36, -77.28, ZONES, [], BOUNDARIES)!;
    expect(summary.place).toBe('outside');
    expect(summary.zone.id).toBe('chachagui');
    expect(summary.zoneKm).toBeLessThan(1);
  });

  it('falls back to the closest seat when the boundaries did not load', () => {
    const summary = nearbySummary(1.29, -77.28, ZONES, [], null)!;
    expect(summary.place).toBe('nearest');
    expect(summary.zone.id).toBe('chachagui');
  });

  it('gives the closest heat spot with its distance and direction', () => {
    const near = hotspot('near', 1.3, -77.2); // ~12 km to the northeast of Pasto's seat
    const far = hotspot('far', 1.9, -76.6);
    const summary = nearbySummary(1.2136, -77.2811, ZONES, [far, near], BOUNDARIES)!;
    expect(summary.hotspot?.hotspot.id).toBe('near');
    expect(summary.hotspot?.direction).toBe('ne');
    expect(summary.hotspot?.km).toBeGreaterThan(11);
    expect(summary.hotspot?.km).toBeLessThan(14);
  });

  it(`has no heat spot when the closest is farther than ${NEARBY_HOTSPOT_MAX_KM} km`, () => {
    const summary = nearbySummary(1.2136, -77.2811, ZONES, [hotspot('quito', -0.18, -78.47)], BOUNDARIES)!;
    expect(summary.hotspot).toBeNull();
    expect(nearbySummary(1.2136, -77.2811, ZONES, [], BOUNDARIES)!.hotspot).toBeNull();
  });

  it('has nothing to say without zones', () => {
    expect(nearbySummary(1.2, -77.3, [], [], null)).toBeNull();
  });
});
