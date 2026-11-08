import type { ZoneRiskSummary } from '../../../domain/model/risk';
import { riskLabel } from '../../../domain/util/risk-labels';
import type { Language } from '../../../i18n/translate';

/**
 * Over Nariño a municipality is its label, centered on its seat, as long as the label does not run
 * into another one (visibleLabels); one that does not fit is a small dot without number, gone if it
 * falls under a label (coveredDots). There are no groups. Below this zoom the label is only the name
 * (light, with a dark halo); from it on it also says the score and the level, in the risk color.
 */
export const NAME_MIN_ZOOM = 8.5;

export function showsNames(zoom: number): boolean {
  return zoom >= NAME_MIN_ZOOM;
}

/** Pasto, the capital: the reference everyone looks for, so its name is always shown. */
export const PINNED_ZONE_ID = 'pasto';

/** Which label wins a collision: the selected zone, then Pasto, then the higher score. */
export function labelPriority(zoneId: string, score: number, selectedId: string | null): number {
  if (zoneId === selectedId) return Infinity;
  if (zoneId === PINNED_ZONE_ID) return Number.MAX_SAFE_INTEGER;
  return score;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

/** Inner HTML of a zone's MapLibre marker element. Which parts show depends on CSS (map-markers.css). */
export function zoneMarkerHtml(zone: ZoneRiskSummary, selected: boolean, language: Language = 'es'): string {
  return (
    `<div class="zone-marker risk-${zone.level}${selected ? ' is-selected' : ''}">` +
    `<span class="zone-dot"></span>` +
    `<span class="zone-label"><b>${escapeHtml(zone.name)}</b><small>${zone.score} · ${riskLabel(zone.level, language)}</small></span>` +
    `</div>`
  );
}

/** A rectangle on screen (px), as getBoundingClientRect gives it. */
export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Where a marker's label sits on screen and how much it matters: the higher, the sooner it shows. */
export interface LabelBox extends ScreenBox {
  readonly key: string;
  readonly priority: number;
}

/** Room (px) kept between two labels, or between a label and a dot: 1 px fits ~21 names over Nariño at 390 px. */
const LABEL_GAP = 1;

const overlaps = (a: ScreenBox, b: ScreenBox): boolean =>
  a.left < b.right + LABEL_GAP && b.left < a.right + LABEL_GAP && a.top < b.bottom + LABEL_GAP && b.top < a.bottom + LABEL_GAP;

const inside = (box: ScreenBox, area: ScreenBox): boolean =>
  box.left >= area.left && box.right <= area.right && box.top >= area.top && box.bottom <= area.bottom;

/**
 * The labels that fit without overlapping, from the highest priority down (the selected zone, then
 * the riskiest): a label that would run into one already placed stays hidden, and so does one not
 * whole inside `area` (the map between the header, the sides and the sheet), so none shows cut.
 * The selected one (priority Infinity) is always drawn, so it always takes its room.
 */
export function visibleLabels(boxes: readonly LabelBox[], area?: ScreenBox): Set<string> {
  const placed: LabelBox[] = [];
  for (const box of [...boxes].sort((a, b) => b.priority - a.priority)) {
    const fits = box.priority === Infinity || !area || inside(box, area);
    if (fits && !placed.some((other) => overlaps(other, box))) placed.push(box);
  }
  return new Set(placed.map((box) => box.key));
}

/** The dots (of municipalities without a label) that a shown label covers: those are not drawn. */
export function coveredDots(dots: readonly (ScreenBox & { readonly key: string })[], labels: readonly ScreenBox[]): Set<string> {
  return new Set(dots.filter((dot) => labels.some((label) => overlaps(label, dot))).map((dot) => dot.key));
}
