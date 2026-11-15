import { createAnimation, type Animation } from '@ionic/angular';
import { REDUCE_MOTION_CLASS } from './motion';

/** Length (ms) of the change of screen: short, so the bottom nav still feels instant. */
export const PAGE_TRANSITION_MS = 240;

/** What Ionic's router outlet hands a navigation animation (only what this one uses). */
export interface PageTransitionOptions {
  readonly enteringEl: HTMLElement;
  readonly leavingEl?: HTMLElement;
  readonly direction?: 'forward' | 'back' | 'root' | string;
}

/** «Movimiento: Reducido» in Ajustes, or the phone asking for less motion. */
export function motionReduced(doc: Document = document): boolean {
  return (
    doc.documentElement.classList.contains(REDUCE_MOTION_CLASS) ||
    doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * Change of screen: the new one rises a few pixels and fades in over the old one, which fades out.
 * Only transform and opacity (smooth on a mid-range Android); instant with reduced motion.
 */
export function pageTransition(_baseEl: unknown, options: PageTransitionOptions): Animation {
  const rise = options.direction === 'back' ? -8 : 12;
  const entering = createAnimation()
    .addElement(options.enteringEl)
    .beforeRemoveClass('ion-page-invisible')
    .fromTo('opacity', '0', '1')
    .fromTo('transform', `translateY(${rise}px)`, 'translateY(0)');
  const transition = createAnimation()
    .duration(motionReduced() ? 0 : PAGE_TRANSITION_MS)
    .easing('cubic-bezier(0.2, 0.8, 0.2, 1)')
    .addAnimation(entering);
  if (options.leavingEl) {
    transition.addAnimation(createAnimation().addElement(options.leavingEl).fromTo('opacity', '1', '0'));
  }
  return transition;
}
