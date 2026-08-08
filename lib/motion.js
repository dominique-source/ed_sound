/**
 * Motion tokens — single source of truth for every animation in the project.
 * Nothing outside this file should hardcode an easing curve, a duration, or
 * a stagger value.
 */

export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';

// GSAP CustomEase names, registered once in main.js against the curves above.
export const GSAP_EASE_OUT = 'ed-out';
export const GSAP_EASE_IN_OUT = 'ed-inout';

export const SPRING = { stiffness: 140, damping: 18 };

// Seconds — GSAP works in seconds, not ms.
export const DURATION = {
  xs: 0.18,
  sm: 0.32,
  md: 0.62,
  lg: 1.1,
  xl: 1.8,
};

export const STAGGER = {
  base: 0.04,
  char: 0.014,
  maxChainTotal: 0.9,
};

// Velocity system tuning — see main.js central state loop.
export const VELOCITY = {
  lerp: 0.08,
  clamp: 1,
  maxSkewDeg: 4,
  maxAberrationPx: 3,
};

// Five parallax depth planes — speed multipliers against scroll.
export const DEPTH = {
  far: 0.15,
  back: 0.35,
  mid: 0.65,
  base: 1.0,
  near: 1.25,
};

export const POINTER_PARALLAX_PX_PER_DEPTH = 12;
export const POINTER_LERP = 0.06;
