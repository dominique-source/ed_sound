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

/** Nav background/blur transition + signature level-rail fill — both cheap,
 *  driven straight off the existing scrollY read, no extra listeners. */
function initScrollUI() {
  const header = document.getElementById('site-header');
  const railFill = document.getElementById('level-rail-fill');
  const docEl = document.documentElement;

  function update() {
    const y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 40);
    if (railFill) {
      const max = docEl.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      railFill.style.height = `${progress * 100}%`;
    }
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}

/** Level meters (hero mini-meters + room-row meters) fill to their real
 *  value once, the first time they enter the viewport. Reduced motion:
 *  jump straight to final value, no transition. */
function initLevelMeters() {
  const fills = document.querySelectorAll('[data-level][data-max]');
  if (!fills.length) return;

  const setFinal = (el) => {
    const level = Number(el.dataset.level);
    const max = Number(el.dataset.max);
    el.style.width = `${(level / max) * 100}%`;
  };

  if (prefersReducedMotion) {
    fills.forEach(setFinal);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        setFinal(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.4 }
  );
  fills.forEach((el) => observer.observe(el));
}

/** Mobile nav toggle. */
function initNavToggle() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  nav.querySelectorAll('a').forEach((link) =>
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

/** Contact form: no backend yet — show an in-place confirmation, never a
 *  jarring page change, per the motion brief's reveal rules. */
function initContactForm() {
  const form = document.getElementById('contact-form');
  const confirmation = document.getElementById('contact-confirmation');
  if (!form || !confirmation) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    form.querySelectorAll('input, select, textarea, button').forEach((el) => {
      el.disabled = true;
    });
    confirmation.hidden = false;
  });
}

/** Smooth-scroll cue buttons ([data-scroll-to]) route through Lenis when
 *  active so the jump respects the same easing as the rest of the page. */
function initScrollCues() {
  document.querySelectorAll('[data-scroll-to]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.scrollTo);
      if (!target) return;
      if (lenis) lenis.scrollTo(target);
      else target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  });
}

function init() {
  initDebugOverlay();
  initLenis();
  initPointer();
  initResize();
  initScrollUI();
  initLevelMeters();
  initNavToggle();
  initContactForm();
  initScrollCues();
  lastFrameTime = performance.now();
  requestAnimationFrame(tick);
}

init();

export { state };
