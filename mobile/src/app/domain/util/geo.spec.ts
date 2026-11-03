import type { ZoneBoundaries } from '../model/risk';
import { bearingDegrees, cardinal, distanceKm, zoneAt } from './geo';

/** A square municipality [minLon, minLat]–[maxLon, maxLat], optionally with a square hole. */
function square(id: string, [x0, y0, x1, y1]: number[], hole?: number[]): ZoneBoundaries['features'][number] {
  const ring = (box: number[]) => [[box[0]!, box[1]!], [box[2]!, box[1]!], [box[2]!, box[3]!], [box[0]!, box[3]!], [box[0]!, box[1]!]];
  return {
    type: 'Feature',
    id,
    properties: { id, divipola: 52000, name: id },
    geometry: { type: 'Polygon', coordinates: hole ? [ring([x0!, y0!, x1!, y1!]), ring(hole)] : [ring([x0!, y0!, x1!, y1!])] },
  };
}

const BOUNDARIES: ZoneBoundaries = {
  type: 'FeatureCollection',
  source: 'test',
  features: [
    square('pasto', [-77.5, 1.0, -77.0, 1.5], [-77.3, 1.2, -77.2, 1.3]),
    // Two islands in one municipality.
    {
      type: 'Feature',
      id: 'tumaco',
      properties: { id: 'tumaco', divipola: 52835, name: 'Tumaco' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[-79, 1.5], [-78.8, 1.5], [-78.8, 1.7], [-79, 1.7], [-79, 1.5]]],
          [[[-78.6, 1.5], [-78.4, 1.5], [-78.4, 1.7], [-78.6, 1.7], [-78.6, 1.5]]],
        ],
      },
    },
    square('chachagui', [-77.3, 1.3, -77.0, 1.5]),
  ],
};

describe('distanceKm (haversine)', () => {
  it('measures along the Earth: one degree of latitude is about 111 km', () => {
    expect(distanceKm(1, -77, 2, -77)).toBeCloseTo(111.2, 0);
    expect(distanceKm(1.2136, -77.2811, 1.2136, -77.2811)).toBe(0);
    // Pasto to Ipiales seats, about 70 km.
    expect(distanceKm(1.2136, -77.2811, 0.8302, -77.6444)).toBeGreaterThan(55);
    expect(distanceKm(1.2136, -77.2811, 0.8302, -77.6444)).toBeLessThan(65);
  });
});

describe('bearingDegrees and cardinal', () => {
  it('gives 0° north, 90° east, 180° south and 270° west', () => {
    expect(bearingDegrees(1, -77, 2, -77)).toBeCloseTo(0, 5);
    expect(bearingDegrees(1, -77, 1, -76)).toBeCloseTo(90, 0);
    expect(bearingDegrees(2, -77, 1, -77)).toBeCloseTo(180, 5);
    expect(bearingDegrees(1, -77, 1, -78)).toBeCloseTo(270, 0);
    expect(bearingDegrees(1, -77, 2, -76)).toBeCloseTo(45, 0);
  });

  it('names 8 directions, each 45° wide and centered on its own', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(cardinal)).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
    expect(cardinal(22.4)).toBe('n');
    expect(cardinal(22.5)).toBe('ne');
    expect(cardinal(337.6)).toBe('n');
    expect(cardinal(359.9)).toBe('n');
    expect(cardinal(-45)).toBe('nw');
    expect(cardinal(720 + 90)).toBe('e');
  });
});

describe('zoneAt', () => {
  it('finds the municipality whose boundary holds the point', () => {
    expect(zoneAt(BOUNDARIES, 1.1, -77.4)).toBe('pasto');
    expect(zoneAt(BOUNDARIES, 1.6, -78.5)).toBe('tumaco'); // second island
  });

  it('leaves out the holes and what is outside every boundary', () => {
    expect(zoneAt(BOUNDARIES, 1.25, -77.25)).toBeNull(); // inside the hole of Pasto
    expect(zoneAt(BOUNDARIES, 1.6, -78.7)).toBeNull(); // between the islands
    expect(zoneAt(BOUNDARIES, -0.18, -78.47)).toBeNull(); // Quito
  });
});
