/**
 * Deck mode detection (B-001).
 *
 * dxcare-web-slide supports two deck authoring models as first-class citizens:
 *
 *  - `skeleton` — the scaffolded, absolute-fade, single-active model. Its
 *    index.html links the shared layer (`/_shared/css/*`, `/_shared/js/*`)
 *    and relies on `_shared/js/navigation.js` (data-active toggling) plus
 *    `_shared/css/base.css` (`.slide { position: absolute }`).
 *
 *  - `rich` — a hand-authored, self-contained deck (its own inline CSS/JS/nav),
 *    typically scroll-snap based (the gold-standard `presentation-v1.html`).
 *    It must NOT receive the shared structural CSS/JS: `base.css`'s
 *    `body { overflow: hidden }` + `.slide { position: absolute }` collapse a
 *    scroll-snap deck's scroll container and freeze `scrollIntoView`-based nav.
 *
 * THE CONTRACT (documented in docs/RICH-DECKS.md):
 *   A deck is `rich` (self-contained) IFF its HTML does not reference the
 *   shared layer (`/_shared/`). A skeleton deck always links `/_shared/css/*`
 *   and imports `/_shared/js/slide-core.js`, so the presence of a `/_shared/`
 *   reference is the canonical, zero-config skeleton marker.
 *
 *   The dev route serves every deck's index.html as raw bytes and NEVER injects
 *   the shared layer (see app/api/slide/[...path]/route.ts) — so this detector
 *   is advisory/diagnostic (tooling, dashboard, tests), not a gate the route
 *   needs in order to avoid injection. The no-injection guarantee is
 *   structural: the route is a static file server.
 */

export type DeckMode = 'rich' | 'skeleton';

export interface DeckModeDetail {
  mode: DeckMode;
  /** true when the HTML references the shared layer (`/_shared/`). */
  referencesShared: boolean;
  /** true when the HTML carries an inline <style> block. */
  hasInlineStyle: boolean;
  /** true when the HTML uses CSS scroll-snap (rich scroll model). */
  hasScrollSnap: boolean;
  /** true when the HTML carries an inline (non-src) <script>. */
  hasInlineScript: boolean;
}

const SHARED_REF = /\/_shared\//;
const INLINE_STYLE = /<style[\s>]/i;
const SCROLL_SNAP = /scroll-snap-type|scroll-snap-align/i;
// An inline <script> that is not purely a `src=`/`import` of the shared layer:
// `<script>` with body content, OR a module script whose body is not just the
// shared bootstrap. We treat any `<script>` tag that has no `src=` AND whose
// content is non-trivial as inline authored JS.
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i;

/**
 * Classify a deck from its index.html source.
 *
 * Primary signal: a deck that does NOT reference `/_shared/` is `rich`.
 * The structural markers (inline style/script, scroll-snap) are returned for
 * diagnostics and to let callers apply a stricter heuristic if desired, but the
 * `/_shared/` reference is authoritative for the mode decision.
 */
export function detectDeckMode(html: string): DeckModeDetail {
  const referencesShared = SHARED_REF.test(html);
  const hasInlineStyle = INLINE_STYLE.test(html);
  const hasScrollSnap = SCROLL_SNAP.test(html);
  const hasInlineScript = INLINE_SCRIPT.test(html);

  // A skeleton deck is defined by its dependence on the shared layer. Absence
  // of any `/_shared/` reference => the deck is self-contained => rich.
  const mode: DeckMode = referencesShared ? 'skeleton' : 'rich';

  return { mode, referencesShared, hasInlineStyle, hasScrollSnap, hasInlineScript };
}

/** Convenience: just the mode. */
export function deckMode(html: string): DeckMode {
  return detectDeckMode(html).mode;
}
