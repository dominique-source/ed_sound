import Lenis from 'https://cdn.jsdelivr.net/npm/lenis@1.1.14/+esm';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm';
import { ScrollTrigger } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/ScrollTrigger.js/+esm';
import { CustomEase } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/CustomEase.js/+esm';
import {
  EASE_OUT,
  EASE_IN_OUT,
  GSAP_EASE_OUT,
  GSAP_EASE_IN_OUT,
  VELOCITY,
  POINTER_LERP,
} from './lib/motion.js';

gsap.registerPlugin(ScrollTrigger, CustomEase);
CustomEase.create(GSAP_EASE_OUT, EASE_OUT.replace('cubic-bezier(', '').replace(')', ''));
CustomEase.create(GSAP_EASE_IN_OUT, EASE_IN_OUT.replace('cubic-bezier(', '').replace(')', ''));

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Central state — every consumer reads from this. Nothing attaches its own
 * scroll/pointer listener; everything derives from one frame tick.
 */
const state = {
  scrollY: 0,
  scrollVelocity: 0, // smoothed, clamped [-1, 1]
  rawVelocity: 0,
  pointerX: 0, // smoothed, viewport-relative -1..1
  pointerY: 0,
  targetPointerX: 0,
  targetPointerY: 0,
  audioLevel: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  vh: window.innerHeight,
  time: 0,
};

let lenis = null;
let lastScrollY = 0;
let lastFrameTime = performance.now();

function initLenis() {
  if (prefersReducedMotion) return;
  lenis = new Lenis({
    lerp: 0.1,
    wheelMultiplier: 1,
    smoothWheel: true,
    autoRaf: false, // single RAF loop below drives Lenis — never let it run its own
  });
}

function initPointer() {
  window.addEventListener(
    'pointermove',
    (e) => {
      state.targetPointerX = (e.clientX / window.innerWidth) * 2 - 1;
      state.targetPointerY = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true }
  );
}

function initResize() {
  window.addEventListener(
    'resize',
    () => {
      state.vh = window.innerHeight;
    },
    { passive: true }
  );
}

/** One RAF loop drives Lenis, GSAP's ticker, and the central state update. */
function tick(time) {
  if (lenis) lenis.raf(time);

  const dt = Math.min((time - lastFrameTime) / 1000, 0.1);
  lastFrameTime = time;
  state.time = time;

  // Read native scroll, not lenis.scroll: Lenis (no custom wrapper) animates
  // the real document scroll position, so window.scrollY is the single
  // source of truth whether the input was wheel, touch, keyboard, or a
  // programmatic scroll.
  const currentScrollY = window.scrollY;
  const deltaY = currentScrollY - lastScrollY;
  lastScrollY = currentScrollY;
  state.scrollY = currentScrollY;

  // Normalize velocity by viewport height per second, clamp, then lerp so it decays.
  const instVelocity = dt > 0 ? deltaY / state.vh / dt : 0;
  const targetVelocity = Math.max(-VELOCITY.clamp, Math.min(VELOCITY.clamp, instVelocity / 3));
  state.rawVelocity = targetVelocity;
  state.scrollVelocity += (targetVelocity - state.scrollVelocity) * VELOCITY.lerp;

  state.pointerX += (state.targetPointerX - state.pointerX) * POINTER_LERP;
  state.pointerY += (state.targetPointerY - state.pointerY) * POINTER_LERP;

  document.documentElement.style.setProperty('--vel', state.scrollVelocity.toFixed(4));
  document.documentElement.style.setProperty('--pointer-x', state.pointerX.toFixed(4));
  document.documentElement.style.setProperty('--pointer-y', state.pointerY.toFixed(4));

  if (window.__edSoundDebug) window.__edSoundDebug.update(state, dt);

  requestAnimationFrame(tick);
}

function initDebugOverlay() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('debug')) return;

  const el = document.createElement('div');
  el.id = 'debug-overlay';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let frames = 0;
  let fps = 0;
  let fpsAccum = 0;

  window.__edSoundDebug = {
    update(s, dt) {
      frames += 1;
      fpsAccum += dt;
      if (fpsAccum >= 0.5) {
        fps = Math.round(frames / fpsAccum);
        frames = 0;
        fpsAccum = 0;
      }
      el.textContent =
        `fps ${fps}\n` +
        `scrollY ${s.scrollY.toFixed(0)}\n` +
        `velocity ${s.scrollVelocity.toFixed(3)} (raw ${s.rawVelocity.toFixed(3)})\n` +
        `pointer ${s.pointerX.toFixed(2)}, ${s.pointerY.toFixed(2)}\n` +
        `audio level ${s.audioLevel.toFixed(2)} bass ${s.bass.toFixed(2)} mid ${s.mid.toFixed(2)} treble ${s.treble.toFixed(2)}\n` +
        `reduced-motion ${prefersReducedMotion}\n` +
        `depth planes: far .15 back .35 mid .65 base 1.0 near 1.25`;
    },
  };
}

function init() {
  initDebugOverlay();
  initLenis();
  initPointer();
  initResize();
  lastFrameTime = performance.now();
  requestAnimationFrame(tick);
}

init();

export { state };
