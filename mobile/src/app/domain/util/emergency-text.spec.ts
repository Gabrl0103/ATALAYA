import type { ZoneBoundaries, ZoneRiskSummary } from '../model/risk';
import { emergencyText, mapLink, placeOf } from './emergency-text';

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

const POSITION = { latitude: 1.2136123, longitude: -77.2811456 };

describe('emergencyText', () => {
  it('with the location: municipality, coordinates and a map link, in Spanish', () => {
    const text = emergencyText({ position: POSITION, place: { name: 'Pasto', place: 'inside' } }, 'es');
    expect(text.split('\n')).toEqual([
      'Aviso de posible incendio forestal.',
      'Municipio: Pasto',
      'Coordenadas: 1.21361, -77.28115',
      'Mapa: https://www.openstreetmap.org/?mlat=1.21361&mlon=-77.28115#map=16/1.21361/-77.28115',
      '',
      'Atalaya · Riesgo de incendios en Nariño',
    ]);
  });

  it('keeps a dot in the coordinates in English too', () => {
    const text = emergencyText({ position: POSITION, place: { name: 'Pasto', place: 'outside' } }, 'en');
    expect(text).toContain('Outside Nariño, near Pasto');
    expect(text).toContain('Coordinates: 1.21361, -77.28115');
    expect(text).toContain('Map: https://www.openstreetmap.org/');
  });

  it('without the location: the municipality viewed and that the location is not available', () => {
    const text = emergencyText({ position: null, place: { name: 'Chachagüí', place: 'viewed' } }, 'es');
    expect(text).toContain('Municipio consultado: Chachagüí');
    expect(text).toContain('Ubicación: no disponible');
    expect(text).not.toContain('Coordenadas');
    expect(text).not.toContain('http');
  });

  it('leaves the municipality out when it is not known', () => {
    const text = emergencyText({ position: POSITION, place: null }, 'en');
    expect(text).not.toContain('Municipality');
    expect(text).toContain('Coordinates:');
  });
});

describe('mapLink', () => {
  it('pins the point on OpenStreetMap', () => {
    expect(mapLink({ latitude: 1, longitude: -77.5 })).toBe(
      'https://www.openstreetmap.org/?mlat=1.00000&mlon=-77.50000#map=16/1.00000/-77.50000',
    );
  });
});

describe('placeOf', () => {
  it('names the municipality that holds the point', () => {
    expect(placeOf({ latitude: 1.29, longitude: -77.28 }, ZONES, BOUNDARIES)).toEqual({ name: 'Pasto', place: 'inside' });
  });

  it('gives the closest seat when the boundaries did not load', () => {
    expect(placeOf({ latitude: 1.36, longitude: -77.28 }, ZONES, null)).toEqual({ name: 'Chachagüí', place: 'nearest' });
  });

  it('is null without zones', () => {
    expect(placeOf(POSITION, [], null)).toBeNull();
  });
});
