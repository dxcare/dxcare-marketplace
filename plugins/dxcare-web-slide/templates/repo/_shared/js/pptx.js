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

import { buildOverlay, prepareMobileIframe, sleep, deckFileBase } from './pdf.js';

const SLIDE_W_IN = 10; // PowerPoint 표준 16:9 와이드 폭 (인치) — 높이는 5.625in 고정

/**
 * Generate an editable 16:9 PPTX of every `.slide` at the given theme.
 * Extraction always runs inside the 1920×1080 hidden iframe so the output
 * aspect is fixed at 16:9 regardless of the browser window shape.
 * @param {'dark'|'light'} theme — theme to apply during extraction
 */
export async function generatePPTX(theme = 'dark') {
  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  const progress = overlay.querySelector('.pdf-progress');
  const bar = overlay.querySelector('.pdf-bar');

  let iframe;

  try {
    // 항상 1920×1080(정확히 16:9) 히든 iframe에서 측정한다 — 결과가 브라우저
    // 창 비율과 무관하게 16:9로 고정되고, 테마도 iframe에만 적용되므로 메인
    // 화면이 깜빡이지 않는다 (transition 중간색 캡처 문제도 원천 차단).
    progress.textContent = '16:9 레이아웃 준비 중...';
    const prep = await prepareMobileIframe(theme);
    iframe = prep.iframe;
    const targetDoc = prep.doc;

    // prepareMobileIframe의 pdf-capture는 .slide를 position:static으로 풀어
    // 높이를 붕괴시킨다(PDF 캡처용) — PPTX는 absolute 레이아웃이 필요하므로
    // 해제하고, reveal 스태거의 opacity/transform만 무력화한다.
    targetDoc.body.classList.remove('pdf-capture');
    const fixEl = targetDoc.createElement('style');
    fixEl.textContent =
      '*, *::before, *::after { transition: none !important; animation: none !important; }\n' +
      '.slide .slide-content > * { opacity: 1 !important; transform: none !important; }';
    targetDoc.head.appendChild(fixEl);
    await sleep(100);

    const targetSlides = targetDoc.querySelectorAll('.slide');
    const total = targetSlides.length;
    const PptxGen = /** @type {any} */ (window).PptxGenJS;
    const pptx = new PptxGen();

    // 표준 16:9 — PowerPoint 기본 와이드 슬라이드 크기.
    pptx.defineLayout({ name: 'DECK', width: SLIDE_W_IN, height: SLIDE_W_IN * (9 / 16) });
    pptx.layout = 'DECK';

    const view = targetDoc.defaultView;
    const bodyBg = view.getComputedStyle(targetDoc.body).backgroundColor;

    const SLIDE_H_IN = SLIDE_W_IN * (9 / 16);
    const FIT_MARGIN_IN = 0.35; // 콘텐츠 fit 후 남길 슬라이드 가장자리 여백
    const MAX_ZOOM = 2; // 빈약한 슬라이드가 과도하게 확대되지 않도록 상한 (기준 스케일 대비)

    for (let i = 0; i < total; i++) {
      progress.textContent = `슬라이드 ${i + 1} / ${total} 변환 중...`;
      bar.style.width = `${((i + 1) / total) * 100}%`;

      const slideEl = targetSlides[i];
      const sRect = slideEl.getBoundingClientRect();
      const baseScale = SLIDE_W_IN / sRect.width; // inches per CSS px (스크린 1:1)

      const pSlide = pptx.addSlide();
      const slideBg = view.getComputedStyle(slideEl).backgroundColor;
      const bg = parseColor(pickOpaque(slideBg, bodyBg));
      if (bg) pSlide.background = { color: bg.hex };

      // 1차 패스: 화면 디자인의 좌우 칼럼 여백·수직 센터링 공백을 걷어내기
      // 위해, 실제로 emit될 요소들의 경계 박스를 측정한다.
      const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const measureCtx = { view, origin: sRect, scale: baseScale, offX: 0, offY: 0, bounds };
      for (const child of slideEl.children) await walkElement(child, measureCtx);

      // 2차 패스: 경계 박스가 여백(FIT_MARGIN_IN)을 남기고 슬라이드를 채우도록
      // 균일 확대. 폰트/자간/반경도 동일 비율로 커진다. 오프셋은 원본 슬라이드
      // 중심을 유지하는 값을 우선하고(가운데 정렬 푸터 등 디자인 기준점 보존),
      // 경계 박스가 여백을 벗어나면 그 범위 안으로 클램프한다.
      let scale = baseScale;
      let offX = 0;
      let offY = 0;
      if (bounds.minX < bounds.maxX) {
        const bw = bounds.maxX - bounds.minX; // px
        const bh = bounds.maxY - bounds.minY;
        const availW = SLIDE_W_IN - FIT_MARGIN_IN * 2;
        const availH = SLIDE_H_IN - FIT_MARGIN_IN * 2;
        scale = Math.min(availW / bw, availH / bh, baseScale * MAX_ZOOM);
        offX = clamp(
          SLIDE_W_IN / 2 - (sRect.width / 2) * scale,
          FIT_MARGIN_IN - bounds.minX * scale,
          SLIDE_W_IN - FIT_MARGIN_IN - bounds.maxX * scale,
        );
        offY = clamp(
          SLIDE_H_IN / 2 - (sRect.height / 2) * scale,
          FIT_MARGIN_IN - bounds.minY * scale,
          SLIDE_H_IN - FIT_MARGIN_IN - bounds.maxY * scale,
        );
      }

      const ctx = { pptx, pSlide, view, origin: sRect, scale, offX, offY };
      for (const child of slideEl.children) await walkElement(child, ctx);
    }

    progress.textContent = 'PPTX 저장 중...';
    const suffix = theme === 'light' ? 'light' : 'dark';
    await pptx.writeFile({ fileName: `${deckFileBase()}-${suffix}.pptx` });
  } finally {
    if (iframe) iframe.remove();
    overlay.remove();
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

/* rect(px) → 슬라이드 좌표(in). measure 패스(ctx.bounds)에서는 경계 박스만
   누적하고 null을 반환해 emit을 건너뛴다. */
function place(rect, ctx) {
  const rx = rect.left - ctx.origin.left;
  const ry = rect.top - ctx.origin.top;
  if (ctx.bounds) {
    ctx.bounds.minX = Math.min(ctx.bounds.minX, rx);
    ctx.bounds.minY = Math.min(ctx.bounds.minY, ry);
    ctx.bounds.maxX = Math.max(ctx.bounds.maxX, rx + rect.width);
    ctx.bounds.maxY = Math.max(ctx.bounds.maxY, ry + rect.height);
    return null;
  }
  return {
    x: ctx.offX + rx * ctx.scale,
    y: ctx.offY + ry * ctx.scale,
    w: rect.width * ctx.scale,
    h: rect.height * ctx.scale,
  };
}

function emitBoxShape(el, cs, rect, ctx) {
  const fill = parseColor(cs.backgroundColor);
  const bw = parseFloat(cs.borderTopWidth) || 0;
  const line = bw > 0 ? parseColor(cs.borderTopColor) : null;
  if (!fill && !line) return;

  const opts = place(rect, ctx);
  if (!opts) return;

  const radiusPx = parseFloat(cs.borderTopLeftRadius) || 0;
  if (fill) opts.fill = { color: fill.hex, transparency: fill.transparency };
  else opts.fill = { color: 'FFFFFF', transparency: 100 };
  if (line) opts.line = { color: line.hex, width: Math.max(0.25, bw * ctx.scale * 72), transparency: line.transparency };
  if (radiusPx > 0) opts.rectRadius = Math.min(radiusPx * ctx.scale, opts.h / 2);

  ctx.pSlide.addShape(radiusPx > 0 ? 'roundRect' : 'rect', opts);
}

async function emitImage(el, rect, ctx) {
  const pos = place(rect, ctx);
  if (!pos) return;
  try {
    const data = await imgToDataUrl(el);
    if (!data) return;
    ctx.pSlide.addImage({ data, ...pos });
  } catch {
    /* tainted/broken image — skip, keep exporting */
  }
}

function emitText(el, cs, rect, ctx) {
  // 측정·배치 모두 실제 그려진 텍스트의 타이트 박스 기준 — 빈 칼럼 폭을
  // 포함한 블록 rect를 쓰면 (1) 전폭 블록이 fit 확대를 막고 (2) 확대 후
  // 텍스트 박스가 슬라이드 밖으로 넘치며 가운데/오른쪽 정렬이 어긋난다.
  // 정렬은 타이트 박스 안에서 그대로 성립하므로 위치가 보존된다.
  const pos = place(textContentRect(el, rect), ctx);
  if (!pos) return;
  const runs = collectRuns(el, cs, ctx);
  if (!runs.length) return;

  const fontPx = parseFloat(cs.fontSize);
  const lineHeightPx = cs.lineHeight === 'normal' ? fontPx * 1.2 : parseFloat(cs.lineHeight);

  ctx.pSlide.addText(runs, {
    ...pos,
    w: pos.w + 0.05, // breathing room — PPT fonts metric-differ
    h: pos.h + 0.05,
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

/* 요소 안에 실제로 그려진 텍스트의 타이트 경계 박스 (Range 측정). */
function textContentRect(el, fallback) {
  try {
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) return r;
  } catch {
    /* fall through */
  }
  return fallback;
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
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
