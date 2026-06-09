# Rich / self-contained decks

dxcare-web-slide treats two deck authoring models as **equal first-class
citizens**. Both live under `slides/<slug>/index.html`, both get the dev
preview, milestone snapshots, and Vercel deploy for free.

| Model | What it is | Navigation | Shared layer |
|-------|------------|------------|--------------|
| **skeleton** | The scaffolded deck (`pnpm create-slide`). Absolute-fade, single-active. | `_shared/js/navigation.js` toggles `data-active`; `base.css` stacks slides with `position: absolute`. | **Linked** — `/_shared/css/*` + `import '/_shared/js/slide-core.js'`. |
| **rich** | A hand-authored, self-contained deck (its own inline CSS/JS/nav), usually CSS `scroll-snap`. The gold standard is `presentation-v1.html`. | Whatever the deck implements (e.g. `scrollIntoView` over `scroll-snap-type: y`). | **None** — the deck owns everything. |

## The no-forced-injection guarantee (AC-1.2)

The dev route (`app/api/slide/[...path]/route.ts`) is a **static file server**:
it `readFileSync`s the requested file and returns the bytes with only a
`Content-Type` header. It does **not** parse, rewrite, wrap, iframe, or SSR the
HTML, and it never injects `_shared` CSS/JS. (The `/slides/:path*` → 
`/api/slide/:path*` rewrite in `next.config.js` plus `trailingSlash: true` just
map the URL; the served body is byte-for-byte the source file.)

So a rich deck served through the dev route gets exactly the assets it declared
— nothing more. This is a structural property of the route, not a runtime
toggle.

### Why forced injection would break a rich deck

`_shared/css/base.css` assumes the skeleton model:

```css
body  { overflow: hidden; }      /* removes the document scroll container */
#deck { height: 100vh; }
.slide { position: absolute; inset: 0; opacity: 0; }  /* all slides stack */
```

Apply those to a `scroll-snap` deck and its scroll container collapses
(`scrollHeight` shrinks to one viewport) and every `.slide` stacks at the same
spot. The deck's `goTo(i)` still runs and the counter still advances, but
`scrollIntoView` has nothing to scroll — **the screen freezes while the counter
ticks up**. That is the exact D8 failure mode this design avoids by never
injecting and by keeping the structural rules out of the opt-in path below.

## Mode detection (AC-2.3)

The contract is intentionally zero-config and keyed on one signal:

> A deck is **rich** (self-contained) if and only if its `index.html` does
> **not** reference the shared layer (`/_shared/`). A skeleton deck always
> links `/_shared/css/*` and imports `/_shared/js/slide-core.js`, so any
> `/_shared/` reference marks it skeleton.

`lib/deck-mode.ts` implements this as a pure function for tooling, the
dashboard, and tests:

```ts
import { detectDeckMode } from '@/lib/deck-mode';
detectDeckMode(html).mode; // 'rich' | 'skeleton'
```

It also returns diagnostic flags (`hasInlineStyle`, `hasScrollSnap`,
`hasInlineScript`) but the `/_shared/` reference is authoritative. No flag in
`meta.json` is required — though you may add one for clarity; detection does not
depend on it.

## Opt-in inheritance of `_shared` improvements (AC-2.4)

A rich deck must be able to pull in shared design improvements (fonts, the color
palette, the spacing/typography scale — the things B-002…B-004 enrich) **without**
inheriting the structural layout poison described above.

The shared CSS is split for exactly this reason:

- **`_shared/css/tokens.css`** — design tokens only: the `:root` custom
  properties + `[data-theme]` overrides. **No** `body`/`#deck`/`.slide` rules,
  no element selectors. Safe for any deck.
- **`_shared/css/base.css`** — `@import`s `tokens.css`, then adds the skeleton
  **structural** rules. Rich decks must NOT link this.

### How a rich deck opts in

Add an explicit `<link>` (or `@import`) to `tokens.css` only — never `base.css`:

```html
<head>
  <!-- opt-in: shared palette + typography tokens, zero layout side effects -->
  <link rel="stylesheet" href="/_shared/css/tokens.css">
  <style>
    /* your own scroll-snap layout, now consuming the shared tokens */
    html { scroll-snap-type: y mandatory; }
    .slide { height: 100vh; scroll-snap-align: start; padding: var(--slide-padding); }
    h2 { font-family: var(--font-heading); color: var(--primary); font-size: var(--h2-size); }
  </style>
</head>
```

Because `tokens.css` contains only custom-property declarations, the deck keeps
its own scroll model and nav. To also opt into the shared font, link the
Pretendard CDN stylesheet the same way the skeleton template does (the tokens
reference `'Pretendard Variable'`).

> Linking `tokens.css` makes the deck reference `/_shared/`, so `detectDeckMode`
> will report it as `skeleton`. That label is advisory only — it changes
> nothing about how the route serves the deck (still raw, still no injection).
> If you want the detector to keep calling an opt-in deck `rich`, prefer
> `@import url('/_shared/css/tokens.css')` inside an inline `<style>` and treat
> the mode label as informational.

### What you get / what you don't

- ✅ Shared palette, typography scale, spacing, radius, motion tokens — and any
  future additions to `tokens.css` — flow in automatically.
- ✅ Your scroll-snap layout and custom nav are untouched.
- ❌ You never get `body { overflow: hidden }` / `.slide { position: absolute }`,
  so your scroll container survives.

## Environment parity (AC-2.2)

A rich deck is plain HTML + CDN assets, so it behaves the same across:

- **`file://`** — open `slides/<slug>/index.html` directly. (Relative asset
  paths like `../assets/...` resolve against the file's folder.)
- **dev server** — `/slides/<slug>/` (served raw by the route).
- **Vercel** — the same file shipped as a static asset.

The one environment-sensitive detail is **relative asset paths**. The gold
standard references `../assets/brand/logo-*.png`; with `trailingSlash: true`
the dev URL `/slides/<slug>/` resolves `../assets/...` to `/slides/assets/...`,
which 404s unless those assets exist under `slides/`. Keep deck assets inside
`slides/<slug>/` and reference them relatively (e.g. `./assets/...`) so all
three environments agree.

---

## Safe-loading convention for diagram / box CSS (AC-1.2)

`_shared/css/diagrams.css` ships the §D4 pattern set (see below). A rich deck may
want to add its own diagram variants. The risk is **specificity / load-order
collisions** that "bend" a shared box (wrong radius, wrong border, lost accent
fill). The rules below remove that risk.

### Load order (authoritative)

The skeleton template (`_templates/index.html`) loads stylesheets in this fixed
order — **do not reorder**:

```
1. tokens.css      (via @import at the top of base.css) — design tokens
2. base.css        — structural layout + element defaults
3. a11y.css        — focus / sr-only / reduced-motion
4. diagrams.css    — the §D4 pattern set
5. theme.css       — generated preset overrides of the :root tokens
6. (consumer CSS)  — any deck-specific stylesheet, loaded LAST
```

Two invariants follow:

- **`theme.css` loads after `diagrams.css`.** Patterns reference tokens
  (`var(--accent)`, `var(--card-border)`, `var(--radius-*)`), and the cascade
  lets `theme.css` re-point those tokens. Because the patterns read variables
  rather than literals, a preset swap recolours every box with **zero**
  pattern-CSS edits.
- **Consumer/rich CSS loads last.** A deck override therefore wins on
  *equal-or-higher* specificity through document order alone — no `!important`
  needed.

### Namespace rules

To add custom diagram CSS without colliding with the shared set:

1. **Do not redefine a shared pattern selector** (`.layer`, `.flow-step`,
   `.cov-card`, `.comparison-grid`, `.gain`, `.boundary-tag`, `.data-table`,
   `.pull`, `.role-grid`, `.crux`, `.card`, `.pill`, …) at the **same**
   specificity. Document order would make your rule win silently and the box
   would diverge from the standard look.
2. **Scope custom variants under a deck-local namespace class** placed on a
   wrapping element, e.g.:

   ```html
   <div class="deck-x">
     <div class="card">…</div>          <!-- shared look -->
     <div class="card card--brand">…</div> <!-- your variant -->
   </div>
   ```
   ```css
   .deck-x .card--brand { border-color: var(--accent); }
   ```
   A **modifier class** (`.card--brand`) plus a **namespace ancestor**
   (`.deck-x`) gives your rule higher specificity *only where you intend it*,
   leaving every other `.card` on the standard look.
3. **Retune the look via the diagram tokens, not by overriding rules.** The
   pattern set exposes a single vocabulary:

   ```css
   :root {
     --diagram-radius: 12px;
     --diagram-radius-tight: 11px;
     --diagram-radius-frame: 14px;
     --diagram-radius-card: 16px;
     --diagram-radius-pill: 999px;
     --diagram-border-width: 1px;
     --diagram-card-bg: var(--bg-secondary);
     --diagram-accent-tint: rgba(41, 151, 255, 0.1);
   }
   ```
   Override one of these (after `diagrams.css`) and every pattern that consumes
   it shifts together — no per-pattern edits, no collisions.
4. **Never use `!important` to win a diagram collision.** If you reach for it,
   you have a load-order or namespace bug — fix that instead. The only sanctioned
   `!important` rules are the `body.pdf-capture` overrides in `base.css` (which
   must beat inline reveal state during capture).

### Why this is collision-proof

The shared patterns are authored at **single-class specificity** and read
tokens, not literals. A consumer rule that is (a) loaded later and (b) either
scoped under a namespace or expressed as a modifier is strictly more specific
*where intended* and equal-or-later elsewhere — so the shared box never "changes
shape" unexpectedly, and the consumer's variant applies exactly where scoped.

---

## §D4 pattern set — render checklist (AC-1.1)

Nine patterns generalized from the gold standard, all in `diagrams.css`. Each
reads the shared tokens, so radius / border / accent are consistent across all
16 presets and both themes. Checklist = what to verify against the gold deck.

| # | Pattern | Key classes | Gold reference | Render check |
|---|---|---|---|---|
| ① | **Layer stack** | `.stack` `.layer` `.layer.flag` | 5-layer stack | rows radius 12px / border 1px; `.flag` row has accent border + glow + tint fill |
| ② | **Flow / cycle** | `.flow-diagram` `.flow-step` `.flow-step.hot` `.flow-arrow` `.loop-note` | flow / cycle | steps radius 12px; arrows accent; `.hot` step accent-tinted; loop-note is a dashed 999px pill |
| ③ | **Coverage grid (3-col)** | `.cov-grid` `.cov-card` | coverage grid | 3 cols → 2 → 1; cards radius 11px / border 1px; title accent |
| ④ | **Comparison (before/after)** | `.comparison-grid` `.comp-header` `.comp-before` `.comp-after` `.comp-cell` | comparison | frame radius 14px; 1px divider lines via grid gap; after column accent |
| ⑤ | **Gain / callout strip** | `.gain` / `.callout` `.g-label` `.g-text` | gain | accent 1px border + tint fill; radius 12px; label accent |
| ⑥ | **Boundary tag** | `.boundary-tag` `.boundary-tag.hot` | boundary-tag | centered muted label; `.hot` adds dashed accent top+bottom rules |
| ⑦ | **Data table** | `.data-table` `th` `td` `tr.flag` `.lv` | table | header accent uppercase; row rules 1px border-bottom; `.flag` row tinted |
| ⑧ | **Pull quote** | `.pull` `.pull .accent` | big quote | large 800-weight statement; `.accent` fragment coloured |
| ⑨ | **Role / crux grid** | `.role-grid` `.crux` `.crux .card` `.crux .num` `.card` | role list / crux 3 | 3-up cards radius 16px; `.crux .card` has 3px accent left rule; collapses to 1-up |

### Exact-match values (AC-1.3 — measured, not eyeballed)

These are asserted by browser `getComputedStyle` against the gold standard:

| Property | Selector | Value |
|---|---|---|
| `border-radius` | `.layer`, `.flow-step`, `.gain` | `12px` |
| `border-radius` | `.cov-card` | `11px` |
| `border-radius` | `.comparison-grid` | `14px` |
| `border-radius` | `.card` | `16px` |
| `border-top-width` | `.layer`, `.flow-step`, `.cov-card`, `.gain`, `.card` | `1px` |
| `border-left-width` | `.crux .card` | `3px` |
| `color` | `.flow-number`, `.cov-card .cc-t`, `.boundary-tag.hot` | accent hex (preset `--accent`) |

Because the accent **fill** uses the same `rgb(41,151,255)` the gold deck uses
and the accent **border/text** read `var(--accent)`, under keynote-dark dark
(`--accent: #2997ff`) the rendered hex equals the gold accent exactly.
