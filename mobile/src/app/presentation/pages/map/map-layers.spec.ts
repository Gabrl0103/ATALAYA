import type { ZoneBoundaries, ZoneRiskSummary } from '../../../domain/model/risk';
import {
  DEPARTMENT_SOURCE, DEPARTMENT_WIDTH, FILL_OPACITY, LEVEL_EDGE_WIDTH, NO_RISK_FILL, ZONE_FILL_LAYER, ZONE_SELECTED_LAYER,
  ZONE_SELECTED_LAYERS, boundariesSource, boundaryLayers, departmentOutline, departmentSource, hotspotLayers, hotspotsSource, readMapColors, selectedZoneFilter, zoneStates, type MapColors,
} from './map-layers';

const COLORS: MapColors = {
  risk: { low: '#4ade80', medium: '#facc15', high: '#ff7a1a', extreme: '#ff3b3b' },
  hotspot: '#ff8a2b',
};

const square = [[[-77.3, 1.2], [-77.2, 1.2], [-77.2, 1.3], [-77.3, 1.2]]];
const BOUNDARIES: ZoneBoundaries = {
  type: 'FeatureCollection',
  source: 'DANE, Marco Geoestadístico Nacional 2025',
  features: ['pasto', 'ipiales', 'leiva'].map((id, i) => ({
    type: 'Feature' as const,
    id,
    properties: { id, divipola: 52001 + i, name: id },
    geometry: { type: 'Polygon' as const, coordinates: square },
  })),
};
const zone = (id: string, level: ZoneRiskSummary['level']): ZoneRiskSummary => ({
  id, name: id, latitude: 1, longitude: -77, score: 40, level,
});

/** A layer as plain data: the AddLayerObject union is too wide to index in a test. */
interface LayerData {
  readonly id: string;
  readonly type: string;
  readonly filter?: unknown;
  readonly paint?: Readonly<Record<string, unknown>>;
}
const layer = (id: string): LayerData | undefined =>
  (boundaryLayers(COLORS) as readonly LayerData[]).find((candidate) => candidate.id === id);

describe('map layers: municipal polygons', () => {
  it('keys the polygons by zone id (DANE is credited by the map page, in its language)', () => {
    expect(boundariesSource(BOUNDARIES)).toEqual({ type: 'geojson', data: BOUNDARIES, promoteId: 'id' });
  });

  it('fills each level with its risk color and zones without a score with the neutral fill', () => {
    const fill = layer(ZONE_FILL_LAYER);
    expect(fill?.type).toBe('fill');
    expect(fill?.paint?.['fill-color']).toEqual([
      'match', ['to-string', ['feature-state', 'level']],
      'low', '#4ade80', 'medium', '#facc15', 'high', '#ff7a1a', 'extreme', '#ff3b3b', NO_RISK_FILL,
    ]);
  });

  it('makes the selected zone stronger, with its own white outline and glow on top', () => {
    expect(FILL_OPACITY.selected).toBeGreaterThan(FILL_OPACITY.normal);
    expect(FILL_OPACITY.normal).toBeLessThan(0.5);
    for (const id of ZONE_SELECTED_LAYERS) expect(layer(id)?.filter).toEqual(selectedZoneFilter(null));
    expect(selectedZoneFilter('pasto')).toEqual(['==', ['get', 'id'], 'pasto']);
    const ids = (boundaryLayers(COLORS) as readonly LayerData[]).map((candidate) => candidate.id);
    expect(ids.at(-1)).toBe(ZONE_SELECTED_LAYER);
  });

  it('draws thicker municipal edges the higher the risk, all below the department edge', () => {
    expect(layer('zone-outline')?.paint?.['line-width']).toEqual([
      'match', ['to-string', ['feature-state', 'level']],
      'low', LEVEL_EDGE_WIDTH.low, 'medium', LEVEL_EDGE_WIDTH.medium, 'high', LEVEL_EDGE_WIDTH.high,
      'extreme', LEVEL_EDGE_WIDTH.extreme, LEVEL_EDGE_WIDTH.none,
    ]);
    const levels = [LEVEL_EDGE_WIDTH.low, LEVEL_EDGE_WIDTH.medium, LEVEL_EDGE_WIDTH.high, LEVEL_EDGE_WIDTH.extreme];
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(4);
    expect(LEVEL_EDGE_WIDTH.extreme).toBeLessThan(DEPARTMENT_WIDTH);
    expect(layer('department-outline')?.paint?.['line-width']).toBe(DEPARTMENT_WIDTH);
    expect(DEPARTMENT_WIDTH).toBeGreaterThan(1);
    expect(departmentSource(BOUNDARIES)).toMatchObject({ type: 'geojson' });
    expect(DEPARTMENT_SOURCE).not.toBe('zone-boundaries');
  });

  it('keeps as the department edge only the edges that a single municipality has', () => {
    // Two squares side by side share the edge x = 1: the outline is the 6 outer edges.
    const box = (x: number) => [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]];
    const pair: ZoneBoundaries = {
      ...BOUNDARIES,
      features: [
        { ...BOUNDARIES.features[0]!, geometry: { type: 'Polygon', coordinates: box(0) } },
        { ...BOUNDARIES.features[1]!, geometry: { type: 'MultiPolygon', coordinates: [box(1)] } },
      ],
    };
    const [outline] = departmentOutline(pair).features;
    const segments = outline!.geometry.coordinates;
    expect(segments.length).toBe(6);
    expect(segments).not.toContainEqual([[1, 0], [1, 1]]);
    expect(segments).not.toContainEqual([[1, 1], [1, 0]]);
  });

  it('gives every polygon its level (null without a score) and the selection', () => {
    const states = zoneStates(BOUNDARIES, [zone('pasto', 'medium'), zone('ipiales', 'extreme')], 'ipiales');
    expect(states).toEqual([
      { id: 'pasto', state: { level: 'medium', selected: false } },
      { id: 'ipiales', state: { level: 'extreme', selected: true } },
      { id: 'leiva', state: { level: null, selected: false } },
    ]);
  });
});

describe('map layers: hotspots and colors', () => {
  it('turns hotspots into GeoJSON points, longitude first', () => {
    const source = hotspotsSource([{ id: 'h1', latitude: 1.21, longitude: -77.28, detectedAt: '2026-10-20T18:00:00Z' }]);
    expect(source).toEqual({
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { id: 'h1' }, geometry: { type: 'Point', coordinates: [-77.28, 1.21] } }],
      },
    });
    expect(hotspotLayers(COLORS).every((layer) => layer.type === 'circle')).toBe(true);
  });

  it('reads the colors from the CSS tokens', () => {
    const element = document.createElement('div');
    const tokens = { '--risk-low': ' #4ade80', '--risk-medium': '#facc15', '--risk-high': '#ff7a1a', '--risk-extreme': '#ff3b3b', '--primary': '#ff8a2b' };
    for (const [name, value] of Object.entries(tokens)) element.style.setProperty(name, value);
    document.body.append(element);
    expect(readMapColors(element)).toEqual(COLORS);
    element.remove();
  });
});
