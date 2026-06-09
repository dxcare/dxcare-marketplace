# CHARTS.md — data charts (Chart.js) opt-in module

`diagrams.css` covers **structural** diagrams (layer stacks, flows, coverage
cards). For **data** charts — bar / line / pie / doughnut — the deck has an
opt-in Chart.js module: `_shared/js/charts.js` + `_shared/css/charts.css`.

It is **opt-in by design** (B-001): nothing is auto-injected. A deck has no
charts until its own bootstrap imports the module and the page loads the
Chart.js CDN bundle. Decks that never touch charts pay nothing.

---

## Why a JS module, not just CSS — the three canvas↔DOM adapters

A chart is an opaque `<canvas>` bitmap. The deck's other rails — the theme
toggle, PDF capture, and the §7 contrast gate in `agents/slide-reviewer.md` —
are all DOM/CSS. A `<canvas>` does **not** restyle itself when a CSS `var()`
changes the way a DOM element does. Three adapters bridge the gap:

| Adapter | Problem without it | Implementation |
|---|---|---|
| **themechange** | Toggle theme → chart colours stay the old theme | `setTheme()` fires `deck:themechange`; charts.js re-reads tokens + `chart.update('resize')` |
| **hex→rgba** | Dataset fills need alpha; `color-mix()` breaks html2canvas 1.4.1 | `hexToRgba()` builds `rgba()` from `--accent` at runtime (never color-mix, B-004) |
| **PDF static** | html2canvas snapshots a mid-animation frame → half-drawn chart | `MutationObserver` on `body.pdf-capture` → `animation:false` + sync repaint (no sleep) |

---

## Quick start

Add to a **skeleton** deck's `<head>` (order matters — Chart.js before the module):

```html
<!-- tokens.css is REQUIRED for theme-aware colours (see "rich vs skeleton") -->
<link rel="stylesheet" href="/_shared/css/tokens.css">
<link rel="stylesheet" href="/_shared/css/charts.css">
<link rel="stylesheet" href="./theme.css">

<!-- Chart.js UMD, pinned 4.4.x. Loads the global `Chart`. -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js" defer></script>
```

Markup — wrap every canvas in `.chart-box` (gives the responsive canvas a
bounded, explicit height; see R1-C3 below):

```html
<div class="chart-box"><canvas id="chart-bar" aria-label="..." role="img"></canvas></div>
```

Bootstrap:

```js
import { initCharts, bar, line, pie, doughnut, resizeCharts } from '/_shared/js/charts.js';

await initCharts();           // awaits document.fonts.ready + sets Chart defaults
bar('chart-bar', { labels: ['Q1','Q2','Q3','Q4'], datasets: [{ label: '매출', data: [42,55,61,78] }] });

// Skeleton decks stack slides absolutely; resize charts when a slide activates.
document.addEventListener('deck:slidechange', () => resizeCharts());
```

A complete, copy-pasteable reference deck lives at
`_templates/chart-demo.html`.

---

## Theme-aware colours (pass datasets WITHOUT colours)

`initCharts()` sets `Chart.defaults.font.family = 'Pretendard Variable, …'`
because **canvas text does not inherit the page's CSS font-family** (R1-C2).

Pass datasets **without** `backgroundColor`/`borderColor` and charts.js derives
them from the active theme tokens:

- text / legend / axis titles ← `--fg`
- axis ticks ← `--fg` (NOT `--muted`: `--muted` is a single theme-invariant grey
  that measures 2.58:1 over the LIGHT plot bg and fails WCAG 1.4.3 text ≥4.5:1;
  `--fg` is theme-derived and clears 4.5:1 in both themes)
- grid lines ← `--card-border`
- bar fill ← `--accent` (solid); bar/slice **border** ← `--fg` (carries the WCAG
  1.4.11 ≥3:1 graphic boundary — see §7; accent-independent, no hardcoding)
- line stroke ← `--accent` (3px); area fill ← `--accent` at low alpha; point
  markers ← `--accent` fill with a `--fg` border ring (the ≥3:1 boundary)
- pie/doughnut slices ← `--accent` at stepped alpha, with a `--fg` slice border

Pass **explicit** colours on a dataset and charts.js leaves them alone (it only
recolours datasets it tagged as theme-derived).

If a token is missing (deck didn't link `tokens.css`/`theme.css`), charts.js
uses a built-in fallback palette and logs **one** console warning — the chart
still renders, it just won't follow the theme toggle.

---

## Rich vs skeleton decks (AC-3.1)

- **Skeleton deck** (links `/_shared/*`): add the CDN `<script>` + import
  `charts.js`. Theme-aware out of the box because it already links `tokens.css`
  / `theme.css`.
- **Rich / self-contained deck**: to get **theme-aware** charts you must link
  **both** `tokens.css` **and** `charts.js` (+ the CDN). `charts.js` alone reads
  empty tokens and falls back to the static palette — i.e. **not** theme-linked.
  A rich deck that doesn't want the shared theme cascade can still use charts;
  it just gets fallback colours and a console warning.

### detectDeckMode side effect (AC-3.2)

`lib/deck-mode.ts` classifies any deck that references `/_shared/` as a
**skeleton**. So a *rich* deck that links `/_shared/js/charts.js` will be
**labelled `skeleton`** by `detectDeckMode`. This label is **advisory only** —
the dev route serves every deck's bytes raw and **never injects** the shared
layer (the no-injection guarantee is structural; see `docs/RICH-DECKS.md`), so
the mislabel changes nothing at runtime. If you need the diagnostic label to
stay `rich`, inline the chart code instead of referencing `/_shared/` (e.g.
copy `charts.js` into an inline `<script type="module">` and load Chart.js from
the CDN). There is still **zero forced injection** either way (B-001).

---

## PDF export (AC-4.1 / AC-4.2)

`charts.js` watches `body.pdf-capture` with a `MutationObserver`. When pdf.js
adds that class it immediately sets `animation:false` and forces a static
repaint, so html2canvas captures a fully-drawn chart **without** depending on a
sleep timer. Chart colours, axes, legends, and dataset alpha fills are all
`rgba()` (never `color-mix()`), so they survive html2canvas 1.4.1 in **both**
dark and light PDF exports.

### Known limitation — mobile PDF path (R2-X4)

The **mobile** PDF path (`prepareMobileIframe` in `pdf.js`) renders into a
hidden iframe by `cloneNode`-ing the slides. `cloneNode` copies the `<canvas>`
**element** but **not its drawn pixels** — a canvas bitmap is not part of the
DOM. So on mobile, charts would appear **blank** in the PDF.

Options:

1. **Desktop PDF for chart decks** (recommended): export from a ≥1200px
   viewport, where pdf.js captures the live DOM (canvas pixels intact).
2. **Re-run charts in the iframe**: have the iframe's document import
   `charts.js` and re-create the charts after clone (advanced; the iframe needs
   the Chart.js global and the canvas ids). Not wired by default.

This is **documented, not silently broken**: a mobile PDF of a chart deck will
have empty chart areas unless you take one of the steps above.

---

## Tooltips vs data labels (R1-C5 — PDF data-loss policy)

Chart.js **tooltips** are interactive (hover) and are **NOT rendered** into a
static PDF capture (and charts.js disables them during capture). If the **data
values must be visible in the PDF**, do **not** rely on tooltips — draw the
values onto the chart with the data-labels plugin:

```html
<!-- NOT in Chart.js core — opt-in (AC-1.3) -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js" defer></script>
```

Data labels are painted onto the canvas, so they survive PDF capture. Use
tooltips for on-screen exploration, data labels when the printed/exported value
matters.

---

## §7 contrast gate for canvas (AC-5.2)

`getComputedStyle` **cannot** read colours inside a `<canvas>` (it's a bitmap,
not styled DOM). The `slide-reviewer` agent's §7 gate measures chart contrast by
**sampling canvas pixels** (`canvas.getContext('2d').getImageData`) or the PDF
capture image, computing WCAG luminance contrast: axis/legend/label text vs
background ≥ 4.5:1, data graphic vs plot background ≥ 3:1 (WCAG 1.4.11). For
data graphics the ≥3:1 boundary is satisfied by the theme-derived `--fg` border
on bars/slices and the `--fg`-ringed line point markers — the accent **fill**
itself can be below 3:1 over a LIGHT bg (e.g. `#01baef` = 2.27:1), and a 1.4.11
boundary at 1px+ is an accepted pass for a graphic whose body is low-contrast.
Measured in both themes and after PDF capture. See `agents/slide-reviewer.md` §7.
