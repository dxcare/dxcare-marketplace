/** Imperatively set the document theme and persist the choice.
 *
 * After flipping `data-theme` on <html> and <body>, dispatch a
 * `deck:themechange` CustomEvent on `document` so canvas-based widgets
 * (which cannot observe a CSS `var()` change the way DOM elements do —
 * a <canvas> is an opaque bitmap) can re-read the design tokens and
 * repaint. This is the `_shared` theme-change hook (B-015 AC-0.1): it is
 * NOT charts-specific — any future canvas/WebGL widget can subscribe.
 *
 * The data-theme writes happen FIRST so a synchronous subscriber that
 * reads `getComputedStyle(...).getPropertyValue('--accent')` already sees
 * the new theme's token values when the event fires. The event is a no-op
 * for decks with no subscribers, so existing toggle/PDF setTheme behaviour
 * is unchanged (no listener stacking, no layout effect).
 */
export function setTheme(theme) {
  document.body.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('deck-theme', theme); } catch { /* storage may be unavailable */ }
  try {
    document.dispatchEvent(new CustomEvent('deck:themechange', { detail: { theme } }));
  } catch { /* CustomEvent unavailable (very old/headless env) — non-fatal */ }
}

let initialized = false;

/**
 * Wire the theme toggle (T key + [data-action="theme"] button) and restore
 * any saved preference from localStorage. Idempotent — calling it a second
 * time is a no-op, so slide-core.js and a consumer's inline bootstrap script
 * can both invoke it without stacking duplicate listeners that cancel out.
 */
export function initTheme() {
  if (initialized) return;
  initialized = true;

  const saved = (() => {
    try { return localStorage.getItem('deck-theme'); } catch { return null; }
  })();
  if (saved) setTheme(saved);
  else if (!document.body.dataset.theme) setTheme('dark');

  function toggle() {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') toggle();
  });
  document.querySelector('[data-action="theme"]')?.addEventListener('click', toggle);
}
