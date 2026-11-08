import {
  GLOBE_MARGIN, GLOBE_START_CENTER, GLOBE_TOP, GLOW_END_ZOOM, INTRO_KEY, MAX_BOUNDS, NARINO_BOUNDS, NARINO_PADDING, PITCH,
  SPIN_DEGREES_PER_SECOND, followContainerSize, globeHalo, globeStart, hasWebGL, introPlan, narinoPadding, readIntroPlayed,
  TAP_FLY_MS, ZONE_FLY_MS, ZONE_ZOOM, rememberIntroPlayed, spinCenter,
} from './map-camera';
import { NAME_MIN_ZOOM } from './zone-marker';

const globeRadius = (zoom: number): number => (512 * 2 ** zoom) / (2 * Math.PI);

describe('map camera: opening', () => {
  const base = { hasSelection: false, reducedMotion: false, firstVisit: true };

  it('spins the globe and flies to Nariño on the first visit', () => {
    expect(introPlan(base)).toBe('spin-fly');
  });

  it('jumps straight to Nariño with reduced motion and on later visits', () => {
    expect(introPlan({ ...base, reducedMotion: true })).toBe('jump');
    expect(introPlan({ ...base, firstVisit: false })).toBe('jump');
  });

  it('goes to the selected zone when arriving from Inicio, without spinning', () => {
    expect(introPlan({ ...base, hasSelection: true })).toBe('zone');
    expect(introPlan({ ...base, hasSelection: true, reducedMotion: true })).toBe('zone');
  });

  it('turns the globe west from its start', () => {
    expect(spinCenter(0)).toEqual(GLOBE_START_CENTER);
    expect(spinCenter(1000)).toEqual([GLOBE_START_CENTER[0] - SPIN_DEGREES_PER_SECOND, GLOBE_START_CENTER[1]]);
  });

  it('starts with the whole globe between the title and the sheet, as large as fits', () => {
    // Phone 390 × 844 with a 360 px sheet: the width limits the globe.
    const start = globeStart({ width: 390, height: 844, bottom: 360 });
    expect(globeRadius(start.zoom)).toBeCloseTo(390 / 2 - GLOBE_MARGIN);
    expect(start.padding).toEqual({ top: GLOBE_TOP, bottom: 360, left: 0, right: 0 });
    expect(start.pitch).toBe(0);
    // A tall sheet leaves less height than width: then the height limits it.
    const short = globeStart({ width: 390, height: 844, bottom: 500 });
    expect(globeRadius(short.zoom)).toBeCloseTo((844 - GLOBE_TOP - 500) / 2 - GLOBE_MARGIN);
  });

  it('starts east of Nariño so the spin brings it into view', () => {
    const [[west], [east]] = NARINO_BOUNDS;
    expect(GLOBE_START_CENTER[0]).toBeGreaterThan(east);
    expect(spinCenter(3000)[0]).toBeGreaterThan(west);
  });

  it('remembers the intro for the session, and plays it when there is no storage', () => {
    const store = new Map<string, string>();
    const win = {
      sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) },
    } as unknown as Window;
    expect(readIntroPlayed(win)).toBe(false);
    rememberIntroPlayed(win);
    expect(store.get(INTRO_KEY)).toBe('1');
    expect(readIntroPlayed(win)).toBe(true);

    const blocked = {
      get sessionStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as Window;
    expect(readIntroPlayed(blocked)).toBe(false);
    expect(() => rememberIntroPlayed(blocked)).not.toThrow();
  });

  it('frames Nariño tilted about 35°, above the sheet', () => {
    expect(PITCH).toBe(35);
    expect(narinoPadding(180)).toEqual({ ...NARINO_PADDING, bottom: NARINO_PADDING.bottom + 180 });
    expect(narinoPadding(0).top).toBe(NARINO_PADDING.top);
  });

  it('flies short to a tapped municipality, where the names already show', () => {
    expect(TAP_FLY_MS).toBeLessThan(ZONE_FLY_MS);
    expect(ZONE_ZOOM).toBeGreaterThanOrEqual(NAME_MIN_ZOOM);
  });

  it('keeps Nariño inside the bounds the camera may move in', () => {
    const [[west, south], [east, north]] = MAX_BOUNDS as [[number, number], [number, number]];
    const [[nWest, nSouth], [nEast, nNorth]] = NARINO_BOUNDS;
    expect(west < nWest && south < nSouth && east > nEast && north > nNorth).toBe(true);
  });
});

describe('map camera: globe halo', () => {
  const view = { zoom: 1.4, centerLatitude: 0, width: 390, height: 844, padding: {} };

  it('circles the globe at its radius, fully visible when far', () => {
    const halo = globeHalo(view)!;
    expect(halo.radius).toBeCloseTo((512 * 2 ** 1.4) / (2 * Math.PI));
    expect([halo.x, halo.y, halo.opacity]).toEqual([195, 422, 1]);
  });

  it('moves the circle down when looking north of the equator', () => {
    expect(globeHalo({ ...view, centerLatitude: 10 })!.y).toBeGreaterThan(422);
  });

  it('follows the padding that lifts the globe above the sheet', () => {
    expect(globeHalo({ ...view, padding: { top: 64, bottom: 360 } })!.y).toBe(422 + (64 - 360) / 2);
  });

  it('fades out when zooming in', () => {
    expect(globeHalo({ ...view, zoom: 3.75 })!.opacity).toBeCloseTo(0.5);
    expect(globeHalo({ ...view, zoom: GLOW_END_ZOOM })).toBeNull();
  });
});

describe('map camera: environment', () => {
  it('detects WebGL', () => {
    const canvas = { getContext: (kind: string) => (kind === 'webgl' ? {} : null) };
    expect(hasWebGL({ createElement: () => canvas } as unknown as Document)).toBe(true);
    expect(hasWebGL({ createElement: () => ({ getContext: () => null }) } as unknown as Document)).toBe(false);
  });
});

describe('followContainerSize', () => {
  /** A ResizeObserver the test triggers by hand. */
  function fakeObserver() {
    const state: { callback?: () => void; observed?: Element; disconnected: boolean } = { disconnected: false };
    class Observer {
      constructor(callback: () => void) {
        state.callback = callback;
      }
      observe(target: Element): void {
        state.observed = target;
      }
      disconnect(): void {
        state.disconnected = true;
      }
    }
    return { Observer, state };
  }

  it('resizes the map when its container changes size, e.g. with the system bars or the keyboard', () => {
    const element = { clientWidth: 412, clientHeight: 915 } as HTMLElement;
    const map = { resize: vi.fn() };
    const { Observer, state } = fakeObserver();
    const stop = followContainerSize(element, map, Observer);
    expect(state.observed).toBe(element);

    state.callback!();
    expect(map.resize).not.toHaveBeenCalled(); // same size: nothing to do

    (element as { clientHeight: number }).clientHeight = 600;
    state.callback!();
    expect(map.resize).toHaveBeenCalledTimes(1);

    stop();
    expect(state.disconnected).toBe(true);
  });
});
