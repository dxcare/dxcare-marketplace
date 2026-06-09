/* ═══════════════════════════════════════════════════════════════════════════
   CHARTS — opt-in Chart.js data-chart module for dxcare-web-slide decks (B-015).

   This module is OPT-IN. Nothing imports it automatically (slide-core.js does
   NOT touch it). A deck gets charts only by adding, in its own bootstrap:

       import { initCharts, bar, line, pie, doughnut } from '/_shared/js/charts.js';

   …and loading the Chart.js UMD bundle from the CDN (see CHARTS.md). There is
   ZERO forced injection (B-001): no route, build step, or shared bootstrap
   pulls this in.

   ── Why a JS module and not CSS ─────────────────────────────────────────────
   A chart is an opaque <canvas> bitmap. The deck's other rails — the theme
   toggle, PDF capture, and the §7 contrast gate — are all DOM/CSS. Bridging
   the two requires three explicit ADAPTERS, all implemented here:

     1. THEMECHANGE  — charts can't observe a CSS var() change (canvas is a
        bitmap). We subscribe to the `deck:themechange` CustomEvent that
        theme-toggle.js `setTheme()` fires (AC-0.1) and repaint every chart
        from the new token values.
     2. HEX→RGBA     — Chart.js wants concrete colours; dataset fills need
        alpha. We read `--accent` etc. (concrete hex/rgb after the cascade)
        and build `rgba()` at runtime. We NEVER emit color-mix() — html2canvas
        1.4.1 (pdf.js) can't parse it (B-004).
     3. PDF STATIC   — html2canvas snapshots the canvas mid-animation, so a
        PDF would capture a half-drawn chart. A MutationObserver watches
        `body.pdf-capture`; when it flips on we disable animation and force a
        synchronous static repaint, so capture never depends on a sleep timer
        (AC-4.1).
   ═══════════════════════════════════════════════════════════════════════════ */

/** All live Chart instances, so the theme/pdf adapters can repaint every one. */
const registry = [];

/** Fallback palette used when a deck links charts.js WITHOUT tokens.css/theme.css
 *  (so the design tokens resolve to nothing). Mirrors the tokens.css :root
 *  fallbacks. A console warning fires once when this kicks in (AC-2.1 / R2-X1). */
const FALLBACK = {
  '--accent': '#01baef',
  '--fg': '#0a1a24',
  '--muted': '#94a3b0',
  '--card-border': 'rgba(0, 0, 0, 0.1)',
};

let warnedMissingTokens = false;
let adaptersWired = false;

/**
 * Read a CSS custom property off <body> (where data-theme lives, so the value
 * reflects the active theme). Falls back to the tokens.css default + a one-time
 * console warning when the deck did not link tokens.css/theme.css.
 * @param {string} name e.g. '--accent'
 * @returns {string} a concrete colour string (hex / rgb / rgba)
 */
function token(name) {
  const raw = getComputedStyle(document.body).getPropertyValue(name).trim();
  if (raw) return raw;
  if (!warnedMissingTokens) {
    warnedMissingTokens = true;
    console.warn(
      `[charts.js] design token ${name} is empty — link /_shared/css/tokens.css ` +
        `(and the deck's theme.css) for theme-aware chart colours. ` +
        `Falling back to built-in defaults (charts will NOT follow the theme toggle).`,
    );
  }
  return FALLBACK[name] ?? '#888888';
}

/**
 * ADAPTER 2 — hex→rgba at runtime (B-004: no color-mix, html2canvas-safe).
 * Accepts `#rgb` / `#rrggbb` and returns `rgba(r,g,b,a)`. If the input is
 * already a non-hex colour (`rgb()`, `rgba()`, keyword), we cannot safely
 * re-alpha it, so we return it unchanged — the caller still gets a valid CSS
 * colour, just at its authored opacity. Mirrors theme-css.ts `accentToRgba`.
 * @param {string} color
 * @param {number} alpha 0..1
 * @returns {string}
 */
export function hexToRgba(color, alpha) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color; // already rgb()/rgba()/keyword — keep as-is
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Current theme palette read from tokens, plus derived alpha fills. */
function palette() {
  const accent = token('--accent');
  const fg = token('--fg');
  const muted = token('--muted');
  const border = token('--card-border');
  return {
    accent,
    fg,
    muted,
    border,
    // Dataset fills use the accent hue (B-004 hex→rgba, not color-mix).
    // SOLID (alpha 1.0) for BAR/PIE fills: a translucent accent washes out over
    // a light background even further, so full opacity at least keeps the fill
    // on the accent hue. The fill alone does NOT carry the WCAG 1.4.11 ≥3:1
    // graphic-contrast gate, though — a solid accent over a LIGHT plot bg can be
    // as low as 2.27:1 (#01baef) and 8 of the 16 design-system presets fail
    // fill≥3:1 on white. The ≥3:1 boundary is carried by a theme-derived --fg
    // border on bars/slices (applyTheme below), which is accent-independent.
    // The line AREA fill stays soft (0.18): a line is read by its solid stroke,
    // so its fill is decorative rather than the data graphic.
    accentFill: hexToRgba(accent, 1),
    accentFillSoft: hexToRgba(accent, 0.18),
  };
}

/**
 * Apply the active-theme palette to a chart's config in place: text/grid/border
 * colours and per-dataset fill/stroke when the author did not pin explicit
 * colours. Called on create AND on every `deck:themechange` so a toggle
 * recolours the canvas (AC-2.2).
 * @param {any} chart a Chart.js instance
 */
function applyTheme(chart) {
  const p = palette();

  // Global text/grid colours (axes, legend, title).
  chart.options.color = p.fg;
  if (chart.options.plugins?.legend?.labels) {
    chart.options.plugins.legend.labels.color = p.fg;
  }
  for (const axisId of Object.keys(chart.options.scales ?? {})) {
    const axis = chart.options.scales[axisId];
    // Tick labels use --fg, NOT --muted. --muted (#94a3b0) is a single
    // theme-INVARIANT grey: over the LIGHT plot background (#fff) it measures
    // 2.58:1 and FAILS WCAG 1.4.3 text contrast (≥4.5:1). --fg is theme-derived
    // (LIGHT #0a1a24 = 17.7:1, DARK #f5f7f9 = 16.5:1) so axis text clears 4.5:1
    // in both themes. Grid lines stay --card-border (decorative, not text).
    if (axis.ticks) axis.ticks.color = p.fg;
    else axis.ticks = { color: p.fg };
    axis.grid = { ...(axis.grid ?? {}), color: p.border };
    if (axis.title) axis.title.color = p.fg;
  }

  // Per-dataset colours — only the ones we tagged as theme-derived
  // (_dxcareSeries), so an author who passes explicit colours keeps them.
  chart.data.datasets.forEach((ds, i) => {
    if (!ds._dxcareSeries) return;
    const type = ds.type ?? chart.config.type;
    if (type === 'pie' || type === 'doughnut') {
      // Categorical: spread alpha steps of the accent across slices so each
      // slice is distinguishable yet on-palette. Floor at 0.55 so each slice
      // stays on-palette and visually distinct.
      //
      // WCAG 1.4.11 (≥3:1) for the data graphic is carried by the slice BORDER,
      // not the fill: a translucent accent slice over a LIGHT plot bg measures
      // as low as 1.62:1 (faintest slice, #fff bg) and the design-system accent
      // itself fails fill≥3:1 on white for 8 of the 16 presets. A --fg border
      // (theme-derived: LIGHT 17.7:1 / DARK 16.5:1 vs the plot bg) gives every
      // slice an accent-independent ≥3:1 contrasting boundary — the robust,
      // hardcode-free fix. It also separates adjacent slices.
      const n = Math.max(1, ds.data.length);
      ds.backgroundColor = ds.data.map((_, j) =>
        hexToRgba(p.accent, Math.max(0.55, 1 - (j * 0.45) / n)),
      );
      ds.borderColor = p.fg;
      ds.borderWidth = 2;
    } else if (type === 'line') {
      // The line's data graphic is its stroke + point markers. A bare accent
      // stroke can be <3:1 over a LIGHT bg (e.g. #01baef = 2.27:1), so the
      // ≥3:1 boundary (WCAG 1.4.11) is carried by --fg-ringed point markers
      // (LIGHT 17.7:1 / DARK 16.5:1) plus a thicker stroke for legibility. The
      // accent stroke keeps the series' palette identity.
      ds.borderColor = p.accent;
      ds.borderWidth = ds.borderWidth ?? 3;
      ds.backgroundColor = p.accentFillSoft;
      ds.pointBackgroundColor = p.accent;
      ds.pointBorderColor = p.fg;
      ds.pointBorderWidth = ds.pointBorderWidth ?? 1.5;
      ds.pointRadius = ds.pointRadius ?? 3.5;
    } else {
      // bar (and anything else): solid accent fill for palette identity, with a
      // --fg border carrying the WCAG 1.4.11 ≥3:1 boundary. The fill alone fails
      // ≥3:1 on a LIGHT bg for low-contrast accents (#01baef = 2.27:1, 8/16
      // presets fail); the theme-derived --fg border (17.7:1 / 16.5:1) is the
      // accent-independent guarantee, with no per-preset hardcoding.
      ds.backgroundColor = p.accentFill;
      ds.borderColor = p.fg;
      ds.borderWidth = ds.borderWidth ?? 1.5;
    }
  });
}

/** True while a PDF capture is in progress (body.pdf-capture present). */
function inPdfCapture() {
  return document.body.classList.contains('pdf-capture');
}

/**
 * ADAPTER 1 + 3 — wire the theme + pdf adapters exactly once.
 *  - `deck:themechange` (AC-0.1 / AC-2.2): repaint every chart from new tokens.
 *  - MutationObserver on body.class (AC-4.1): when pdf-capture flips on, kill
 *    animation and force a synchronous static repaint so html2canvas never
 *    snapshots a mid-animation frame (no sleep dependency). When it flips off,
 *    we leave animation off for the rest of the session (charts are already
 *    drawn — re-enabling buys nothing and risks a flash).
 */
function wireAdapters() {
  if (adaptersWired) return;
  adaptersWired = true;

  document.addEventListener('deck:themechange', () => {
    for (const chart of registry) {
      try {
        applyTheme(chart);
        // 'resize' update mode: NO animation (like 'none') but, unlike 'none',
        // it RE-RESOLVES element styling — so the new dataset fill/stroke colours
        // actually repaint. 'none' keeps cached element colours and the canvas
        // would NOT recolour on a theme toggle (verified: 'none' leaves bars at
        // the default palette). See CHARTS.md.
        chart.update('resize');
      } catch (e) {
        console.warn('[charts.js] theme repaint failed for a chart', e);
      }
    }
  });

  const onPdf = () => {
    if (!inPdfCapture()) return;
    for (const chart of registry) {
      try {
        chart.options.animation = false;
        if (chart.options.plugins?.tooltip) chart.options.plugins.tooltip.enabled = false;
        chart.update('resize'); // synchronous static repaint, re-resolves colours — no setTimeout
      } catch (e) {
        console.warn('[charts.js] pdf static repaint failed for a chart', e);
      }
    }
  };
  const observer = new MutationObserver(onPdf);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // Charts created AFTER pdf-capture is already on (e.g. the mobile iframe path
  // clones a body that already carries .pdf-capture) are made static at
  // construction: makeChart() reads inPdfCapture() and passes animation:false.
}

/**
 * Initialise Chart.js global defaults. Idempotent. MUST run before any chart is
 * created, and AFTER the Chart UMD bundle is on the page (window.Chart).
 *
 * Sets `Chart.defaults.font.family` to the Pretendard family — canvas text does
 * NOT inherit CSS font-family from the page (R1-C2), so without this the axis/
 * legend text renders in Chart.js's default sans, not the deck's webfont.
 *
 * Returns a promise that resolves AFTER `document.fonts.ready`, so callers can
 * `await initCharts()` and be sure the webfont is loaded before the first chart
 * measures text (R1-C1: a chart created before the font loads bakes the
 * fallback metrics into the canvas).
 */
export async function initCharts() {
  const Chart = window.Chart;
  if (!Chart) {
    console.error(
      '[charts.js] window.Chart is undefined — add the Chart.js CDN <script> ' +
        'BEFORE importing charts.js. See docs/CHARTS.md.',
    );
    return false;
  }
  Chart.defaults.font.family = 'Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, sans-serif';
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  wireAdapters();
  // Wait for the webfont so canvas text is measured/baked with the real metrics.
  try { await document.fonts.ready; } catch { /* fonts API absent — proceed */ }
  return true;
}

/**
 * Resolve the <canvas> target from an id string or an element.
 * @param {string|HTMLCanvasElement} target
 * @returns {HTMLCanvasElement|null}
 */
function resolveCanvas(target) {
  if (typeof target === 'string') {
    const el = document.getElementById(target);
    return el instanceof HTMLCanvasElement ? el : null;
  }
  return target instanceof HTMLCanvasElement ? target : null;
}

/**
 * Create a chart of the given type on `target`, applying the active theme,
 * registering it for theme/pdf adapters, and handling the hidden-container
 * resize (R1-C3) + already-in-pdf-capture case.
 * @param {'bar'|'line'|'pie'|'doughnut'} type
 * @param {string|HTMLCanvasElement} target canvas id or element
 * @param {{labels: string[], datasets: any[]}} data
 * @param {object} [options] extra Chart.js options (merged)
 * @returns {any|null} the Chart instance, or null on failure (with a placeholder)
 */
function makeChart(type, target, data, options = {}) {
  const Chart = window.Chart;
  const canvas = resolveCanvas(target);
  if (!Chart || !canvas) {
    placeholder(canvas, 'chart unavailable');
    return null;
  }

  // Tag datasets that omit explicit colours so applyTheme() owns them.
  const datasets = (data.datasets ?? []).map((ds) => {
    const hasColor = ds.backgroundColor !== undefined || ds.borderColor !== undefined;
    return hasColor ? ds : { ...ds, _dxcareSeries: true };
  });

  const animation = inPdfCapture() ? false : undefined; // static if capturing now
  const chart = new Chart(canvas.getContext('2d'), {
    type,
    data: { labels: data.labels ?? [], datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation,
      ...options,
      plugins: {
        legend: { labels: {} },
        ...(options.plugins ?? {}),
      },
    },
  });

  applyTheme(chart);
  // 'resize' (not 'none'): re-resolves element styling so the theme-derived
  // dataset colours applied just above actually paint on first render. With
  // 'none' Chart.js keeps the default-palette element colours it resolved at
  // construction and the canvas would show the wrong fill. See CHARTS.md.
  chart.update('resize');
  registry.push(chart);
  return chart;
}

/** Render a visible placeholder when the chart can't be drawn (CDN failed,
 *  bad target). Prevents a silently blank slide (AC-5.1). */
function placeholder(canvas, msg) {
  const host = canvas?.parentElement;
  if (!host) {
    console.error(`[charts.js] ${msg} (and no container to show a placeholder)`);
    return;
  }
  const box = document.createElement('div');
  box.className = 'chart-placeholder';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `차트를 불러오지 못했습니다: ${msg}`);
  box.textContent = '차트를 불러오지 못했습니다';
  host.appendChild(box);
  console.error(`[charts.js] ${msg} — rendered placeholder`);
}

/* ── Public chart-type helpers ──────────────────────────────────────────────
   Each returns the Chart instance (or null). Pass datasets WITHOUT colours to
   get theme-derived accent colours; pass explicit colours to keep them. */

/** Bar chart. */
export function bar(target, data, options) {
  return makeChart('bar', target, data, options);
}

/** Line chart. */
export function line(target, data, options) {
  return makeChart('line', target, data, { tension: 0.3, ...options });
}

/** Pie chart. */
export function pie(target, data, options) {
  return makeChart('pie', target, data, options);
}

/** Doughnut chart. */
export function doughnut(target, data, options) {
  return makeChart('doughnut', target, data, options);
}

/**
 * Re-measure + repaint every chart. Call when a previously-hidden slide becomes
 * active (R1-C3): a chart created in a `display:none` / 0-size container is laid
 * out at 0×0; once the slide is shown the container has real dimensions, so the
 * chart must `resize()` to fill it. Skeleton decks (absolute-stacked .slide)
 * should call this from their slide-activation hook; rich/scroll decks usually
 * don't need it (slides are always laid out).
 * @param {HTMLElement} [scope] optional — only resize charts whose canvas is
 *        inside this element. Omit to resize all.
 */
export function resizeCharts(scope) {
  for (const chart of registry) {
    if (scope && !scope.contains(chart.canvas)) continue;
    try { chart.resize(); } catch { /* detached canvas — ignore */ }
  }
}

/** The live chart registry (read-only use — e.g. tests, the §7 gate). */
export function charts() {
  return registry.slice();
}
