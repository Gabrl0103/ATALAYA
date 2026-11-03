import type { FeatureCollection, MultiLineString, Point, Position } from 'geojson';
import type { AddLayerObject, Map as MapLibreMap } from 'maplibre-gl';
import type { Hotspot, RiskLevel, ZoneBoundaries, ZoneRiskSummary } from '../../../domain/model/risk';

type SourceSpecification = Parameters<MapLibreMap['addSource']>[1];
type LayerOf<T extends AddLayerObject['type']> = Extract<AddLayerObject, { type: T }>;
type FilterSpecification = NonNullable<LayerOf<'line'>['filter']>;

export const BOUNDARIES_SOURCE = 'zone-boundaries';
export const ZONE_FILL_LAYER = 'zone-fill';
const ZONE_OUTLINE_LAYER = 'zone-outline';
export const DEPARTMENT_SOURCE = 'department-outline';
const DEPARTMENT_LAYER = 'department-outline';
const ZONE_SELECTED_GLOW_LAYER = 'zone-selected-glow';
export const ZONE_SELECTED_LAYER = 'zone-selected';
/** The layers that only draw the selected zone: map.page.ts filters them all by its id. */
export const ZONE_SELECTED_LAYERS = [ZONE_SELECTED_GLOW_LAYER, ZONE_SELECTED_LAYER] as const;
export const HOTSPOTS_SOURCE = 'hotspots';
/** The heat spot «Cerca de mí» points at: a ring around it while the card is open. */
export const HIGHLIGHT_SOURCE = 'hotspot-highlight';

/** Colors the GL layers need as values: they come from the CSS tokens (theme/tokens.css). */
export interface MapColors {
  readonly risk: Readonly<Record<RiskLevel, string>>;
  /** --primary: hotspots. */
  readonly hotspot: string;
}

const LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high', 'extreme'];

export function readMapColors(element: Element): MapColors {
  const style = getComputedStyle(element);
  const token = (name: string): string => style.getPropertyValue(name).trim();
  return {
    risk: Object.fromEntries(LEVELS.map((level) => [level, token(`--risk-${level}`)])) as Record<RiskLevel, string>,
    hotspot: token('--primary'),
  };
}

/** Light 1 px outline shared by neighbours, so two risk colors never fight on the same edge. */
const OUTLINE = 'rgba(255, 243, 234, 0.6)';
/** The department's own edge, thicker than the municipal ones. */
const DEPARTMENT_OUTLINE = '#fff3ea';
export const DEPARTMENT_WIDTH = 2.5;
/** Zones without a score yet (the weather has not arrived): the prototype's Nariño fill. */
export const NO_RISK_FILL = '#35655c';
export const FILL_OPACITY = { normal: 0.42, selected: 0.62, noRisk: 0.35 } as const;

/**
 * The municipal polygons from GET /api/zones/boundaries; feature-state is keyed by zone id. DANE's
 * credit goes in the map's credits (map.page.ts), so it can change language.
 */
export function boundariesSource(boundaries: ZoneBoundaries): SourceSpecification {
  return { type: 'geojson', data: boundaries, promoteId: 'id' };
}

/**
 * The edge of the department: the polygon edges that only one municipality has (an edge between two
 * neighbours appears in both). mapshaper keeps the shared edges vertex for vertex, so they match.
 */
export function departmentOutline(boundaries: ZoneBoundaries): FeatureCollection<MultiLineString> {
  const edges = new Map<string, { segment: [Position, Position]; count: number }>();
  for (const feature of boundaries.features) {
    const { geometry } = feature;
    const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        const key = [String(a), String(b)].sort().join('|');
        const edge = edges.get(key);
        if (edge) edge.count++;
        else edges.set(key, { segment: [a, b], count: 1 });
      }
    }
  }
  const outer = [...edges.values()].filter((edge) => edge.count === 1).map((edge) => edge.segment);
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: outer } }],
  };
}

export function departmentSource(boundaries: ZoneBoundaries): SourceSpecification {
  return { type: 'geojson', data: departmentOutline(boundaries) };
}

/**
 * Fill by risk level, translucent so the terrain and the markers on top still read; a light 1 px
 * outline between municipalities and a thicker one around the department. The selected zone is
 * stronger and gets a white outline with a glow on top of everything. Level and selection live in
 * feature-state (zoneStates), so a new score or a tap never re-uploads the polygons.
 */
export function boundaryLayers(colors: MapColors): AddLayerObject[] {
  const fill: LayerOf<'fill'> = {
    id: ZONE_FILL_LAYER,
    type: 'fill',
    source: BOUNDARIES_SOURCE,
    paint: {
      'fill-color': ['match', levelState(), 'low', colors.risk.low, 'medium', colors.risk.medium, 'high', colors.risk.high, 'extreme', colors.risk.extreme, NO_RISK_FILL],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], FILL_OPACITY.selected,
        ['==', levelState(), ''], FILL_OPACITY.noRisk,
        FILL_OPACITY.normal,
      ],
    },
  };
  const outline: LayerOf<'line'> = {
    id: ZONE_OUTLINE_LAYER,
    type: 'line',
    source: BOUNDARIES_SOURCE,
    paint: { 'line-color': OUTLINE, 'line-width': 1 },
  };
  const department: LayerOf<'line'> = {
    id: DEPARTMENT_LAYER,
    type: 'line',
    source: DEPARTMENT_SOURCE,
    // The edge comes as loose segments: round ends join them.
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': DEPARTMENT_OUTLINE, 'line-width': DEPARTMENT_WIDTH, 'line-opacity': 0.85 },
  };
  const selectedGlow: LayerOf<'line'> = {
    id: ZONE_SELECTED_GLOW_LAYER,
    type: 'line',
    source: BOUNDARIES_SOURCE,
    filter: selectedZoneFilter(null),
    paint: { 'line-color': '#fff3ea', 'line-width': 9, 'line-opacity': 0.35, 'line-blur': 6 },
  };
  const selected: LayerOf<'line'> = {
    id: ZONE_SELECTED_LAYER,
    type: 'line',
    source: BOUNDARIES_SOURCE,
    filter: selectedZoneFilter(null),
    layout: { 'line-join': 'round' },
    paint: { 'line-color': '#fff3ea', 'line-width': 3 },
  };
  return [fill, outline, department, selectedGlow, selected];
}

/** The zone's level from feature-state as text; '' when it has none (no score yet). */
function levelState(): ['to-string', ['feature-state', string]] {
  return ['to-string', ['feature-state', 'level']];
}

/** Only the selected zone's outline (none when nothing is selected). */
export function selectedZoneFilter(selectedId: string | null): FilterSpecification {
  return ['==', ['get', 'id'], selectedId ?? ''];
}

export interface ZoneFeatureState {
  readonly id: string;
  readonly state: { readonly level: RiskLevel | null; readonly selected: boolean };
}

/** feature-state for every polygon: its level (null = no score yet) and whether it is selected. */
export function zoneStates(
  boundaries: ZoneBoundaries,
  zones: readonly ZoneRiskSummary[],
  selectedId: string | null,
): ZoneFeatureState[] {
  const levels = new Map(zones.map((zone) => [zone.id, zone.level]));
  return boundaries.features.map(({ properties: { id } }) => ({
    id,
    state: { level: levels.get(id) ?? null, selected: id === selectedId },
  }));
}

/** NASA FIRMS hotspots as GeoJSON points. */
export function hotspotPoints(hotspots: readonly Hotspot[]): FeatureCollection<Point, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: hotspots.map((hotspot) => ({
      type: 'Feature',
      properties: { id: hotspot.id },
      geometry: { type: 'Point', coordinates: [hotspot.longitude, hotspot.latitude] },
    })),
  };
}

export function hotspotsSource(hotspots: readonly Hotspot[]): SourceSpecification {
  return { type: 'geojson', data: hotspotPoints(hotspots) };
}

/** A small orange dot with a halo, drawn by the GPU (not DOM markers): they never take a tap. */
export function hotspotLayers(colors: MapColors): AddLayerObject[] {
  const halo: LayerOf<'circle'> = {
    id: 'hotspot-halo',
    type: 'circle',
    source: HOTSPOTS_SOURCE,
    paint: { 'circle-radius': 7.5, 'circle-color': colors.hotspot, 'circle-opacity': 0.3, 'circle-blur': 0.4 },
  };
  const dot: LayerOf<'circle'> = {
    id: 'hotspot-dot',
    type: 'circle',
    source: HOTSPOTS_SOURCE,
    paint: { 'circle-radius': 3.5, 'circle-color': colors.hotspot, 'circle-stroke-width': 1, 'circle-stroke-color': '#f9f9f4' },
  };
  return [halo, dot];
}

/** One point (or none) for the highlight ring. */
export function highlightPoint(point: { readonly latitude: number; readonly longitude: number } | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: point
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] } }]
      : [],
  };
}

/** A ring in the text color, wider than the halo, so the heat spot stands out among the others. */
export function highlightLayers(): AddLayerObject[] {
  const ring: LayerOf<'circle'> = {
    id: 'hotspot-highlight',
    type: 'circle',
    source: HIGHLIGHT_SOURCE,
    paint: {
      'circle-radius': 14,
      'circle-color': 'rgba(0, 0, 0, 0)',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#f9f9f4',
    },
  };
  return [ring];
}
