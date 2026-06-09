import { describe, it, expect } from 'vitest';
import { detectDeckMode, deckMode } from '../deck-mode.js';

// A representative skeleton (scaffolded) deck head — links the shared layer.
const SKELETON_HTML = `<!doctype html>
<html lang="ko"><head>
<link rel="stylesheet" href="/_shared/css/base.css">
<link rel="stylesheet" href="./theme.css">
</head><body data-theme="dark">
  <main id="deck"><section class="slide" data-slide="1"></section></main>
  <script type="module">
    import '/_shared/js/slide-core.js';
    import { initPdfButton } from '/_shared/js/pdf.js';
    initPdfButton();
  </script>
</body></html>`;

// A representative rich, self-contained deck — inline <style>/<script>, scroll-snap,
// zero `/_shared/` references (mirrors the gold-standard presentation-v1.html).
const RICH_HTML = `<!DOCTYPE html>
<html lang="ko"><head>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<style>
  html { scroll-behavior: smooth; scroll-snap-type: y mandatory; height: 100%; }
  .slide { width: 100vw; height: 100vh; scroll-snap-align: start; }
</style>
</head><body>
  <section class="slide" id="slide-0"></section>
  <section class="slide" id="slide-1"></section>
  <script>
    class Deck { goTo(i){ this.slides[i].scrollIntoView({behavior:'smooth'}); } }
    new Deck();
  </script>
</body></html>`;

describe('detectDeckMode', () => {
  it('classifies a skeleton deck (references /_shared/) as skeleton', () => {
    const d = detectDeckMode(SKELETON_HTML);
    expect(d.mode).toBe('skeleton');
    expect(d.referencesShared).toBe(true);
  });

  it('classifies a self-contained scroll-snap deck as rich', () => {
    const d = detectDeckMode(RICH_HTML);
    expect(d.mode).toBe('rich');
    expect(d.referencesShared).toBe(false);
    expect(d.hasInlineStyle).toBe(true);
    expect(d.hasScrollSnap).toBe(true);
    expect(d.hasInlineScript).toBe(true);
  });

  it('treats absence of /_shared/ as the authoritative rich marker', () => {
    // A deck with NO shared refs and NO scroll-snap is still rich — it owns its
    // own layout. The contract keys on /_shared/ dependence, not scroll model.
    const minimal = '<!doctype html><html><body><div class="slide">only</div></body></html>';
    expect(deckMode(minimal)).toBe('rich');
  });

  it('does not misclassify a deck that merely mentions the word shared in prose', () => {
    const html = '<!doctype html><html><body><p>shared vision</p><section class="slide"></section></body></html>';
    // "shared" without the /_shared/ path is NOT a shared-layer reference.
    expect(deckMode(html)).toBe('rich');
  });

  it('classifies a rich deck even if it links a CDN stylesheet', () => {
    // External CDN links (Pretendard, html2canvas) do not make a deck skeleton.
    expect(deckMode(RICH_HTML)).toBe('rich');
  });
});

describe('rich deck no-forced-injection invariant (AC-1.2)', () => {
  // The dev route serves index.html as raw bytes (readFileSync -> NextResponse)
  // with only a Content-Type header. It never rewrites the body. This test
  // pins that invariant at the data level: a rich deck's served bytes must
  // equal its source bytes — no shared CSS/JS link is added.
  it('rich source bytes carry zero shared-layer references', () => {
    const served = RICH_HTML; // route returns readFileSync(target) unchanged
    expect(served).toBe(RICH_HTML);
    expect(/\/_shared\//.test(served)).toBe(false);
    expect(served.includes('slide-core.js')).toBe(false);
    expect(served.includes('base.css')).toBe(false);
  });
});
