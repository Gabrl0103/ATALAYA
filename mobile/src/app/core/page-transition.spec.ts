import { PAGE_TRANSITION_MS, motionReduced, pageTransition } from './page-transition';
import { REDUCE_MOTION_CLASS } from './motion';

describe('pageTransition', () => {
  afterEach(() => document.documentElement.classList.remove(REDUCE_MOTION_CLASS));

  const pages = () => ({ enteringEl: document.createElement('div'), leavingEl: document.createElement('div') });

  it('fades the new screen in and the old one out, with transform and opacity only', () => {
    const animation = pageTransition(null, { ...pages(), direction: 'forward' });
    expect(animation.getDuration()).toBe(PAGE_TRANSITION_MS);
    const [entering, leaving] = animation.childAnimations;
    const properties = (keyframes: readonly object[]) => [...new Set(keyframes.flatMap((frame) => Object.keys(frame)))]
      .filter((key) => key !== 'offset').sort();
    expect(properties(entering!.getKeyframes())).toEqual(['opacity', 'transform']);
    expect(properties(leaving!.getKeyframes())).toEqual(['opacity']);
  });

  it('is instant with «Movimiento: Reducido»', () => {
    document.documentElement.classList.add(REDUCE_MOTION_CLASS);
    expect(motionReduced()).toBe(true);
    // Ionic keeps at least 1 ms: nothing a person can see.
    expect(pageTransition(null, pages()).getDuration()).toBeLessThanOrEqual(1);
  });
});
