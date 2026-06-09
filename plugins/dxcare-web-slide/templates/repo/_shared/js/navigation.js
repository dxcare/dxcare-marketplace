// navigation.js — full navigation for the SKELETON deck model.
//
// SCOPE / B-001 boundary (AC-1.5): every listener attached here is global
// (document/window/deck). That is intentional and SAFE for the rich,
// self-contained deck model because this module is only ever loaded by
// `slide-core.js`, which a *skeleton* deck imports via
// `import '/_shared/js/slide-core.js'`. A rich deck references zero `/_shared/`
// assets (the detectDeckMode contract — see lib/deck-mode.ts + docs/RICH-DECKS.md)
// and the dev route serves its bytes raw with no injection, so this file never
// executes for a rich deck. Therefore none of the global wheel/click/touch
// listeners below can ever attach to a rich deck — the isolation is structural,
// not a runtime guard. Verified in browser by asserting a rich deck preview has
// no `window.__deck` and no behavioural response to wheel/click.
//
// ESCAPE HATCH WARNING (AC-1.5): the structural isolation above holds only as
// long as a rich deck never references `/_shared/`. If a rich, self-contained
// deck author manually `<script src="/_shared/js/navigation.js">`-links (or
// imports) this module, `detectDeckMode` will classify that deck as a SKELETON,
// the global wheel/click/touch listeners here will attach to it, and they will
// fight the deck's own built-in navigation. Rich decks MUST NOT link
// navigation.js (nor slide-core.js, which imports it) — they ship their own nav.

// Selector for elements that own their own click behaviour. A bare
// click-to-advance must NOT hijack these (AC-1.2: "UI 버튼·링크 제외").
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [data-action], [contenteditable=""], [contenteditable="true"]';

// ── tunables ───────────────────────────────────────────────────────────────
// A wheel gesture often arrives as a burst of `wheel` events. We accumulate
// deltaY and reset the accumulator once it goes idle for this long, so a single
// physical scroll advances exactly one slide. Lives beside WHEEL_THRESHOLD so
// the two wheel tunables read symmetrically.
export const WHEEL_RESET_MS = 200;
// Accumulated wheel deltaY past which we commit a slide change (then reset).
export const WHEEL_THRESHOLD = 60;
// Minimum touch travel (px) on the dominant axis before a swipe counts.
export const SWIPE_THRESHOLD = 40;

// ── pure navigation logic (DOM-free, unit-testable) ──────────────────────────
// These are deliberately split out from initNavigation so the index math and
// the swipe-axis decision can be exercised without a DOM. initNavigation wires
// them to document/window/deck listeners; the listener wiring itself is verified
// in the browser, not by unit test (no jsdom in the consumer toolchain).

// Clamp a target slide index into [0, len-1]. `len <= 0` collapses to 0 so a
// deck with no slides can never produce a negative or NaN index.
export function clampIndex(index, len) {
  if (!(len > 0)) return 0;
  return Math.max(0, Math.min(len - 1, index));
}

// Resolve a touch swipe (dx, dy) to a navigation delta. Picks the dominant axis
// so a diagonal swipe fires at most once, and ignores travel below `threshold`.
// Returns +1 (advance), -1 (retreat), or 0 (no-op). Up / left advance; down /
// right retreat — matching the wheel and arrow-key direction convention.
export function resolveSwipe(dx, dy, threshold = SWIPE_THRESHOLD) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) > threshold) return dx < 0 ? 1 : -1;
  } else {
    if (Math.abs(dy) > threshold) return dy < 0 ? 1 : -1;
  }
  return 0;
}

export function initNavigation(deck) {
  const slides = [...deck.querySelectorAll('.slide')];
  let current = 0;

  const counter = document.querySelector('.deck-counter');
  const counterCurrent = document.querySelector('[data-current]');
  const counterTotal = document.querySelector('[data-total]');
  const progress = document.querySelector('.deck-progress span');
  if (counterTotal) counterTotal.textContent = String(slides.length);

  // ── nav dots (AC-1.3) ──────────────────────────────────────────────────
  // Created dynamically so existing scaffolded decks inherit dots without a
  // template change. Mirrors the gold-standard `createDots()` pattern.
  let dots = [];
  if (slides.length > 1) {
    const nav = document.createElement('nav');
    nav.className = 'nav-dots';
    nav.setAttribute('aria-label', 'slide navigation');
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'nav-dot';
      dot.setAttribute('aria-label', `슬라이드 ${i + 1}로 이동`);
      dot.addEventListener('click', () => goTo(i));
      nav.appendChild(dot);
    });
    document.body.appendChild(nav);
    dots = [...nav.querySelectorAll('.nav-dot')];
  }

  // ── counter → goto (AC-1.3) ────────────────────────────────────────────
  // Clicking the "n / total" counter jumps to the first slide (Home behaviour
  // gives a predictable, discoverable jump target without a prompt).
  if (counter) {
    counter.style.cursor = 'pointer';
    counter.setAttribute('role', 'button');
    counter.setAttribute('tabindex', '0');
    counter.setAttribute('aria-label', '첫 슬라이드로 이동');
    counter.addEventListener('click', () => goTo(0));
    counter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(0); }
    });
  }

  function render() {
    slides.forEach((s, i) => s.dataset.active = String(i === current));
    dots.forEach((d, i) => {
      const active = i === current;
      d.classList.toggle('active', active);
      d.setAttribute('aria-current', active ? 'true' : 'false');
    });
    if (counterCurrent) counterCurrent.textContent = String(current + 1);
    if (progress) progress.style.width = `${((current + 1) / slides.length) * 100}%`;
    if (history.replaceState) history.replaceState(null, '', `#/slide/${current + 1}`);
    // _shared slide-activation hook (B-015 R1-C3). Canvas widgets that were
    // laid out at 0×0 in a hidden (absolute-stacked) slide need to re-measure
    // once their slide becomes active; charts.js subscribes to recompute size.
    // No-op for decks with no subscriber; safe parallel to deck:themechange.
    try {
      document.dispatchEvent(new CustomEvent('deck:slidechange', {
        detail: { index: current, slide: slides[current] ?? null },
      }));
    } catch { /* CustomEvent unavailable — non-fatal */ }
  }

  function go(delta) {
    const next = clampIndex(current + delta, slides.length);
    if (next !== current) { current = next; render(); }
  }

  function goTo(index) {
    const next = clampIndex(index, slides.length);
    if (next !== current) { current = next; render(); }
  }

  // ── keyboard (AC-1.1 adds Up/Down) ─────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); }
  });

  // ── control buttons ────────────────────────────────────────────────────
  document.querySelector('[data-action="prev"]')?.addEventListener('click', () => go(-1));
  document.querySelector('[data-action="next"]')?.addEventListener('click', () => go(1));

  // ── mouse wheel / scroll, throttled (AC-1.1) ───────────────────────────
  // Accumulate deltaY and fire once past a threshold; reset the accumulator
  // after a short idle (WHEEL_RESET_MS) so a single scroll gesture advances
  // exactly one slide.
  let wheelAccum = 0;
  let wheelReset = null;
  document.addEventListener('wheel', (e) => {
    // ASSUMPTION: the slide surface does not scroll, so we swallow every wheel
    // event globally and repurpose it as slide navigation. This holds for the
    // skeleton model because the deck skeleton is `overflow: hidden` — no inner
    // scrollable region exists. If a future slide ships scrollable content
    // (a long table, a code block with its own scrollbar, etc.), this blanket
    // preventDefault will trap the user's scroll inside it; revisit then
    // (e.g. only preventDefault when the wheel target is not itself scrollable).
    e.preventDefault();
    wheelAccum += e.deltaY;
    clearTimeout(wheelReset);
    wheelReset = setTimeout(() => { wheelAccum = 0; }, WHEEL_RESET_MS);
    if (wheelAccum > WHEEL_THRESHOLD) { wheelAccum = 0; go(1); }
    else if (wheelAccum < -WHEEL_THRESHOLD) { wheelAccum = 0; go(-1); }
  }, { passive: false });

  // ── click-to-advance (AC-1.2) ──────────────────────────────────────────
  // A plain click on the slide surface advances; clicks on interactive UI
  // (buttons, links, form fields, the controls aside) are ignored so they keep
  // their own behaviour.
  deck.addEventListener('click', (e) => {
    if (e.target.closest(INTERACTIVE)) return;
    if (e.target.closest('.deck-controls, .nav-dots')) return;
    go(1);
  });

  // ── touch, both axes (AC-1.2 adds vertical) ─────────────────────────────
  let startX = null;
  let startY = null;
  deck.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  deck.addEventListener('touchend', (e) => {
    if (startX === null || startY === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const delta = resolveSwipe(dx, dy);
    if (delta !== 0) go(delta);
    startX = null;
    startY = null;
  }, { passive: true });

  render();
  return { go, goTo, get current() { return current; }, get total() { return slides.length; } };
}
