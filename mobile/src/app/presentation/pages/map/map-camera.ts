import type { LngLatBoundsLike } from 'maplibre-gl';

/** Extent of the 64 municipal polygons (DANE MGN 2025), rounded out a little. */
export const NARINO_BOUNDS: [[number, number], [number, number]] = [[-79.05, 0.33], [-76.8, 2.72]];
/**
 * How far the camera may go once over Nariño: the department plus a margin, so a seat on the edge
 * (Tumaco, Ipiales) can still sit above the bottom sheet with the map tilted.
 */
export const MAX_BOUNDS: LngLatBoundsLike = [[-80.8, -0.9], [-75.0, 4.0]];
export const MIN_ZOOM_OVER_NARINO = 6;
export const MAX_ZOOM = 14;
/** Tilt of the view over Nariño and of the flight to a seat: enough for relief, flat enough to read. */
export const PITCH = 35;
/** Room around the department when framing it: the header on top; the sheet's height adds to the bottom. */
export const NARINO_PADDING = { top: 84, bottom: 12, left: 8, right: 8 } as const;
/** Zoom of the flight to a seat: past NAME_MIN_ZOOM (zone-marker.ts), so its neighbours' names show too. */
export const ZONE_ZOOM = 9.5;

/** Opening view: South America in front, east of Nariño so it spins into view (globeStart sizes it). */
export const GLOBE_START_CENTER: [number, number] = [-50, -4];
/** Room above the globe for the «Mapa» title... */
export const GLOBE_TOP = 64;
/** ...and between the globe and the sides or the sheet. */
export const GLOBE_MARGIN = 20;
/** The globe turns west this many degrees per second... */
export const SPIN_DEGREES_PER_SECOND = 8;
/** ...for this long, then flies to Nariño. */
export const SPIN_MS = 3000;
export const FLY_MS = 2600;
/** Flight to a seat from afar (search, «Mi ubicación», coming from Inicio)... */
export const ZONE_FLY_MS = 1200;
/** ...and the short one after tapping a municipality already on screen. */
export const TAP_FLY_MS = 700;
/** Flights over Nariño frame with cameraForBounds, so the view itself keeps no padding. */
export const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };

export interface Padding {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Opening camera: the whole globe between the title and the sheet (`bottom`, px), as large as fits.
 * The padding moves the globe's center up, above the sheet; MapLibre draws the globe with radius
 * worldSize / 2π, worldSize = 512 · 2^zoom.
 */
export function globeStart(view: { readonly width: number; readonly height: number; readonly bottom: number }) {
  const radius = Math.max(
    40,
    Math.min(view.width / 2 - GLOBE_MARGIN, (view.height - GLOBE_TOP - view.bottom) / 2 - GLOBE_MARGIN),
  );
  return {
    center: GLOBE_START_CENTER,
    zoom: Math.log2((radius * 2 * Math.PI) / 512),
    pitch: 0,
    bearing: 0,
    padding: { top: GLOBE_TOP, bottom: view.bottom, left: 0, right: 0 },
  };
}

/**
 * How the map opens:
 * - 'zone': a zone is already selected (from Inicio): straight to its seat, no spin.
 * - 'spin-fly': the globe turns and then flies to Nariño (first visit of the session).
 * - 'jump': already over Nariño, without animation (later visits or reduced motion).
 */
export type IntroPlan = 'zone' | 'spin-fly' | 'jump';

export function introPlan(options: {
  readonly hasSelection: boolean;
  readonly reducedMotion: boolean;
  readonly firstVisit: boolean;
}): IntroPlan {
  if (options.hasSelection) return 'zone';
  if (options.reducedMotion || !options.firstVisit) return 'jump';
  return 'spin-fly';
}

/** Padding that frames Nariño as large as fits between the header and a sheet `sheetHeight` px tall. */
export function narinoPadding(sheetHeight: number): Padding {
  return { ...NARINO_PADDING, bottom: NARINO_PADDING.bottom + sheetHeight };
}

/** sessionStorage key: the intro already played in this session (it survives a reload of the page). */
export const INTRO_KEY = 'willay.mapIntroPlayed';

/** What followContainerSize needs of ResizeObserver (a parameter so tests can trigger it). */
export type ResizeObserverLike = new (callback: () => void) => { observe(target: Element): void; disconnect(): void };

/**
 * Keeps the map the size of its container. MapLibre only follows the window, but the container also changes
 * without it: the system bars or the keyboard of the phone. Returns the function that stops following it.
 */
export function followContainerSize(
  element: HTMLElement,
  map: { resize(): void },
  Observer: ResizeObserverLike = ResizeObserver,
): () => void {
  const sizeOf = (): string => `${element.clientWidth}x${element.clientHeight}`;
  let last = sizeOf();
  const observer = new Observer(() => {
    const size = sizeOf();
    if (size === last) return;
    last = size;
    map.resize();
  });
  observer.observe(element);
  return () => observer.disconnect();
}

/** False when the storage is unavailable (private mode, blocked site data): the intro then plays. */
export function readIntroPlayed(win: Window): boolean {
  try {
    return win.sessionStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberIntroPlayed(win: Window): void {
  try {
    win.sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Without storage the page's own flag still keeps it to once per app run.
  }
}

/** Center of the opening view after `elapsedMs` of spin (the globe turns west). */
export function spinCenter(elapsedMs: number): [number, number] {
  const [longitude, latitude] = GLOBE_START_CENTER;
  return [longitude - (SPIN_DEGREES_PER_SECOND * elapsedMs) / 1000, latitude];
}

/** The orange halo around the globe fades out from this zoom to GLOW_END_ZOOM. */
export const GLOW_START_ZOOM = 3;
export const GLOW_END_ZOOM = 4.5;

/**
 * Screen circle of the globe (radius worldSize / 2π, worldSize = 512 · 2^zoom) and how visible its
 * halo is. The view's padding moves the globe's center; null once zoomed in, where there is no globe edge.
 */
export function globeHalo(view: {
  readonly zoom: number;
  readonly centerLatitude: number;
  readonly width: number;
  readonly height: number;
  readonly padding: Partial<Padding>;
}): { x: number; y: number; radius: number; opacity: number } | null {
  if (view.zoom >= GLOW_END_ZOOM) return null;
  const { top = 0, bottom = 0, left = 0, right = 0 } = view.padding;
  const radius = (512 * 2 ** view.zoom) / (2 * Math.PI);
  // Looking at latitude φ, the globe's center sits r·sin(φ) below the center of the padded view.
  const y = (view.height + top - bottom) / 2 + radius * Math.sin((view.centerLatitude * Math.PI) / 180);
  const opacity = Math.min(1, Math.max(0, (GLOW_END_ZOOM - view.zoom) / (GLOW_END_ZOOM - GLOW_START_ZOOM)));
  return { x: (view.width + left - right) / 2, y, radius, opacity };
}

/** MapLibre draws with WebGL, globe or flat: without it there is no map at all. */
export function hasWebGL(doc: Document): boolean {
  try {
    const canvas = doc.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

