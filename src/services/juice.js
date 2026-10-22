/**
 * Impact feedback played on DOM elements with the Web Animations API. Only transforms are
 * animated, so the compositor runs them and nothing is left running once they finish.
 */

const reducedMotionQuery =
  typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;

export const prefersReducedMotion = () => Boolean(reducedMotionQuery?.matches);

/** Shake an element; strength is the peak offset in px and decays over the duration */
export function shake(el, strength, durationMs) {
  if (!el?.animate || prefersReducedMotion() || strength <= 0) return;
  const steps = 7;
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const decay = 1 - i / steps;
    const x = i === steps ? 0 : (i % 2 ? -1 : 1) * strength * decay * (0.7 + Math.random() * 0.3);
    const y = i === steps ? 0 : (Math.random() - 0.5) * strength * decay;
    frames.push({ transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)` });
  }
  el.animate(frames, { duration: durationMs, easing: 'linear' });
}

/** Squash and stretch a creature when it takes a hit */
export function squash(el, heavy = false) {
  if (!el?.animate || prefersReducedMotion()) return;
  const k = heavy ? 1.6 : 1;
  el.animate(
    [
      { transform: 'scale(1, 1)' },
      { transform: `scale(${1 + 0.18 * k}, ${1 - 0.2 * k}) translateY(${3 * k}px)`, offset: 0.25 },
      { transform: `scale(${1 - 0.08 * k}, ${1 + 0.1 * k}) translateY(${-2 * k}px)`, offset: 0.6 },
      { transform: 'scale(1, 1)' },
    ],
    { duration: heavy ? 260 : 200, easing: 'ease-out' }
  );
}

/** Pop a freshly wrecked tile's rubble in */
export function popIn(el) {
  if (!el?.animate || prefersReducedMotion()) return;
  el.animate(
    [
      { transform: 'scale(0.3)', opacity: 0 },
      { transform: 'scale(1.3)', opacity: 1, offset: 0.55 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
}
