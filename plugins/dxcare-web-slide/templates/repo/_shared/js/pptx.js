/* PPTX exporter — EDITABLE output (B-021). Unlike pdf.js (raster snapshot),
   this walks each `.slide`'s DOM and rebuilds it as native PowerPoint
   objects via PptxGenJS: text becomes real text boxes (per-run font/size/
   color preserved), card-like elements become rounded-rect shapes, <img>
   become picture shapes. Geometry comes from getBoundingClientRect()
   scaled to a slide layout that matches the capture viewport's aspect,
   so positions/sizes land where they render on screen.

   Fidelity trade-off (deliberate): gradients, glows, box-shadows and
   pseudo-element decorations are dropped — the goal is a deck the user
   can EDIT in PowerPoint/Keynote, not a pixel-perfect picture (use the
   PDF button or `pnpm export-pdf` for that).

   CDN script tag required in the host page:
     <script src="https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js" defer></script>
*/

import { setTheme } from './theme-toggle.js';
import { buildOverlay, prepareMobileIframe, sleep, deckFileBase } from './pdf.js';

const SLIDE_W_IN = 10; // PowerPoint default 16:9 width (inches)

/**
 * Generate an editable PPTX of every `.slide` at the given theme.
 * @param {'dark'|'light'} theme — theme to apply during extraction
 */
export async function generatePPTX(theme = 'dark') {
  const priorTheme = document.body.dataset.theme ?? 'dark';

  // 테마 전환 transition이 진행되는 동안 getComputedStyle을 읽으면 중간
  // 보간색이 캡처된다 — setTheme 전에 전역 transition을 꺼서 색을 즉시
  // 확정시키고, reveal 스태거의 opacity/transform도 함께 무력화한다.
  const styleEl = document.createElement('style');
  styleEl.textContent =
    '*, *::before, *::after { transition: none !important; animation: none !important; }\n' +
    '.slide .slide-content > * { opacity: 1 !important; transform: none !important; }';
  document.head.appendChild(styleEl);
  setTheme(theme);

  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  const progress = overlay.querySelector('.pdf-progress');
  const bar = overlay.querySelector('.pdf-bar');

  const isMobile = window.innerWidth < 1200;
  let targetSlides, targetDoc, iframe;

  try {
    if (isMobile) {
      progress.textContent = '데스크톱 레이아웃 준비 중...';
      const prep = await prepareMobileIframe(theme);
      iframe = prep.iframe;
      targetSlides = prep.slides;
      targetDoc = prep.doc;
    } else {
      // pdf-capture와 달리 .slide의 absolute 레이아웃을 유지한다 — 슬라이드가
      // 뷰포트 크기를 지키고 수직 센터링 rect가 그대로 보존된다.
      await document.fonts.ready;
      await sleep(100);
      targetSlides = document.querySelectorAll('.slide');
      targetDoc = document;
    }

    const total = targetSlides.length;
    const PptxGen = /** @type {any} */ (window).PptxGenJS;
    const pptx = new PptxGen();

    // Layout matches the first slide's on-screen aspect so rect math is 1:1.
    const ref = targetSlides[0].getBoundingClientRect();
    const slideHIn = (SLIDE_W_IN * ref.height) / ref.width;
    pptx.defineLayout({ name: 'DECK', width: SLIDE_W_IN, height: slideHIn });
    pptx.layout = 'DECK';

    const view = targetDoc.defaultView;
    const bodyBg = view.getComputedStyle(targetDoc.body).backgroundColor;

    for (let i = 0; i < total; i++) {
      progress.textContent = `슬라이드 ${i + 1} / ${total} 변환 중...`;
      bar.style.width = `${((i + 1) / total) * 100}%`;

      if (isMobile) {
        targetSlides[i].scrollIntoView({ behavior: 'instant' });
        await sleep(50);
      }
      const slideEl = targetSlides[i];
      const sRect = slideEl.getBoundingClientRect();
      const scale = SLIDE_W_IN / sRect.width; // inches per CSS px

      const pSlide = pptx.addSlide();
      const slideBg = view.getComputedStyle(slideEl).backgroundColor;
      const bg = parseColor(pickOpaque(slideBg, bodyBg));
      if (bg) pSlide.background = { color: bg.hex };

      const ctx = { pptx, pSlide, view, origin: sRect, scale };
      for (const child of slideEl.children) await walkElement(child, ctx);
    }

    progress.textContent = 'PPTX 저장 중...';
    const suffix = theme === 'light' ? 'light' : 'dark';
    await pptx.writeFile({ fileName: `${deckFileBase()}-${suffix}.pptx` });
  } finally {
    if (iframe) iframe.remove();
    overlay.remove();
    setTheme(priorTheme);
    styleEl.remove(); // transition 복원은 테마 원복 후 — 원복 페이드도 생략
  }
}

/* ── DOM → PPTX object mapping ─────────────────────────────────────── */

async function walkElement(el, ctx) {
  const cs = ctx.view.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;

  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;

  emitBoxShape(el, cs, rect, ctx);

  if (el.tagName === 'IMG') {
    await emitImage(el, rect, ctx);
    return;
  }
  if (el.tagName === 'svg' || el.tagName === 'CANVAS') return; // not mappable to editable objects

  if (isTextUnit(el, ctx)) {
    emitText(el, cs, rect, ctx);
    return;
  }
  for (const child of el.children) await walkElement(child, ctx);
}

/* An element is a "text unit" when it has rendered text and no block-level
   element children — its whole content becomes one text box (with per-run
   styling for inline children like <small>/<em>/<strong>). */
function isTextUnit(el, ctx) {
  if (!el.innerText || !el.innerText.trim()) return false;
  for (const child of el.children) {
    if (child.tagName === 'BR') continue;
    const d = ctx.view.getComputedStyle(child).display;
    if (d !== 'inline' && d !== 'inline-block') return false;
  }
  return true;
}

function emitBoxShape(el, cs, rect, ctx) {
  const fill = parseColor(cs.backgroundColor);
  const bw = parseFloat(cs.borderTopWidth) || 0;
  const line = bw > 0 ? parseColor(cs.borderTopColor) : null;
  if (!fill && !line) return;

  const radiusPx = parseFloat(cs.borderTopLeftRadius) || 0;
  const opts = {
    x: (rect.left - ctx.origin.left) * ctx.scale,
    y: (rect.top - ctx.origin.top) * ctx.scale,
    w: rect.width * ctx.scale,
    h: rect.height * ctx.scale,
  };
  if (fill) opts.fill = { color: fill.hex, transparency: fill.transparency };
  else opts.fill = { color: 'FFFFFF', transparency: 100 };
  if (line) opts.line = { color: line.hex, width: Math.max(0.25, bw * 0.75), transparency: line.transparency };
  if (radiusPx > 0) opts.rectRadius = Math.min(radiusPx * ctx.scale, opts.h / 2);

  ctx.pSlide.addShape(radiusPx > 0 ? 'roundRect' : 'rect', opts);
}

async function emitImage(el, rect, ctx) {
  try {
    const data = await imgToDataUrl(el);
    if (!data) return;
    ctx.pSlide.addImage({
      data,
      x: (rect.left - ctx.origin.left) * ctx.scale,
      y: (rect.top - ctx.origin.top) * ctx.scale,
      w: rect.width * ctx.scale,
      h: rect.height * ctx.scale,
    });
  } catch {
    /* tainted/broken image — skip, keep exporting */
  }
}

function emitText(el, cs, rect, ctx) {
  const runs = collectRuns(el, cs, ctx);
  if (!runs.length) return;

  const fontPx = parseFloat(cs.fontSize);
  const lineHeightPx = cs.lineHeight === 'normal' ? fontPx * 1.2 : parseFloat(cs.lineHeight);

  ctx.pSlide.addText(runs, {
    x: (rect.left - ctx.origin.left) * ctx.scale,
    y: (rect.top - ctx.origin.top) * ctx.scale,
    w: rect.width * ctx.scale + 0.05, // breathing room — PPT fonts metric-differ
    h: rect.height * ctx.scale + 0.05,
    align: cs.textAlign === 'start' ? 'left' : /** @type {any} */ (cs.textAlign),
    valign: 'top',
    margin: 0,
    lineSpacingMultiple: lineHeightPx / fontPx,
    wrap: true,
  });
}

function collectRuns(el, parentCs, ctx) {
  const runs = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = applyTransform(node.textContent.replace(/\s+/g, ' '), parentCs.textTransform);
      if (text.trim()) runs.push({ text, options: runOptions(parentCs, ctx) });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR') {
        if (runs.length) runs[runs.length - 1].options.breakLine = true;
        continue;
      }
      const cs = ctx.view.getComputedStyle(node);
      if (cs.display === 'none') continue;
      const text = applyTransform(node.innerText.replace(/\s+/g, ' '), cs.textTransform);
      if (text.trim()) runs.push({ text, options: runOptions(cs, ctx) });
    }
  }
  return runs;
}

function runOptions(cs, ctx) {
  const color = parseColor(cs.color);
  const fontPx = parseFloat(cs.fontSize);
  const opts = {
    fontSize: Math.round(fontPx * 72 * ctx.scale * 10) / 10,
    fontFace: firstFontFamily(cs.fontFamily),
    color: color ? color.hex : '000000',
    bold: parseInt(cs.fontWeight, 10) >= 600,
    italic: cs.fontStyle === 'italic',
  };
  const ls = parseFloat(cs.letterSpacing);
  if (!Number.isNaN(ls) && ls > 0) opts.charSpacing = Math.round(ls * 72 * ctx.scale * 10) / 10;
  return opts;
}

/* ── small utilities ───────────────────────────────────────────────── */

function applyTransform(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  return text;
}

function firstFontFamily(stack) {
  const first = stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
  // PowerPoint은 variable-font 접미사를 모른다 — 설치 가능성이 높은 베이스 이름으로
  return first.replace(/\s*Variable$/i, '');
}

/* rgb()/rgba() → { hex, transparency } (null when fully transparent). */
function parseColor(css) {
  if (!css) return null;
  const m = css.match(/rgba?\(\s*(\d+)[, ]+(\d+)[, ]+(\d+)(?:[,/ ]+([\d.]+))?\s*\)/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (a === 0) return null;
  const hex = [m[1], m[2], m[3]]
    .map((v) => parseInt(v, 10).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return { hex, transparency: Math.round((1 - a) * 100) };
}

function pickOpaque(...colors) {
  for (const c of colors) {
    const p = parseColor(c);
    if (p) return c;
  }
  return null;
}

function imgToDataUrl(img) {
  return new Promise((resolve) => {
    const draw = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      if (!canvas.width || !canvas.height) return resolve(null);
      canvas.getContext('2d').drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null); // cross-origin taint
      }
    };
    if (img.complete) draw();
    else {
      img.addEventListener('load', draw, { once: true });
      img.addEventListener('error', () => resolve(null), { once: true });
    }
  });
}

let pptxInitialized = false;

/** Wire `[data-action="pptx"]` buttons. Idempotent like initPdfButton. */
export function initPptxButton() {
  if (pptxInitialized) return;
  pptxInitialized = true;
  document.querySelectorAll('[data-action="pptx"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme') ?? document.body.dataset.theme ?? 'dark';
      generatePPTX(theme);
    });
  });
}
