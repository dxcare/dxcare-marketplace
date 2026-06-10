/* PDF generator — ported from dxcare-web-slide@0.1.0 with light/dark theme
   export via html2canvas + jsPDF. Mobile renders at 1920×1080 inside a
   hidden iframe so layouts match the desktop target; desktop captures the
   live DOM after hiding UI chrome. Adapts to the new `[data-theme]`
   attribute convention (replaces `body.light-theme` from the legacy).

   CDN script tags required in the host page:
     <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" defer></script>
     <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js" defer></script>
*/

import { setTheme } from './theme-toggle.js';

const PDF_W = 1920;
const PDF_H = 1080;

/**
 * Generate a PDF of every `.slide` in the document at the given theme.
 * @param {'dark'|'light'} theme — theme to apply during capture
 */
export async function generatePDF(theme = 'dark') {
  const priorTheme = document.body.dataset.theme ?? 'dark';
  setTheme(theme);

  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  const progress = overlay.querySelector('.pdf-progress');
  const bar = overlay.querySelector('.pdf-bar');

  const isMobile = window.innerWidth < 1200;
  let targetSlides, targetDoc, iframe, hiddenEls;

  try {
    if (isMobile) {
      progress.textContent = '데스크톱 레이아웃 준비 중...';
      const prep = await prepareMobileIframe(theme);
      iframe = prep.iframe;
      targetSlides = prep.slides;
      targetDoc = prep.doc;
    } else {
      const slides = document.querySelectorAll('.slide');
      slides.forEach((s) => s.classList.add('visible'));
      hiddenEls = document.querySelectorAll('.nav-dots, .slide-counter, .theme-toggle, .pdf-btn, .back-link');
      hiddenEls.forEach((el) => (el.style.display = 'none'));
      document.body.classList.add('pdf-capture');
      await document.fonts.ready;
      await sleep(600);
      targetSlides = slides;
      targetDoc = document;
    }

    const w = isMobile ? PDF_W : window.innerWidth;
    const h = isMobile ? PDF_H : window.innerHeight;
    const total = targetSlides.length;

    const { jsPDF } = /** @type {{ jsPDF: any }} */ (window.jspdf);
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [w, h],
      compress: true,
      hotfixes: ['px_scaling'],
    });

    const bgColor = getComputedStyle(targetDoc.body).backgroundColor;

    for (let i = 0; i < total; i++) {
      progress.textContent = `슬라이드 ${i + 1} / ${total} 캡처 중...`;
      bar.style.width = `${((i + 1) / total) * 100}%`;

      targetSlides[i].scrollIntoView({ behavior: 'instant' });
      await sleep(200);

      const canvas = await /** @type {any} */ (window).html2canvas(targetSlides[i], {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: bgColor,
        width: w,
        height: h,
        windowWidth: w,
        windowHeight: h,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage([w, h], 'landscape');
      pdf.addImage(imgData, 'JPEG', 0, 0, w, h);

      const isLight = targetDoc.body.dataset.theme === 'light';
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(20);
      pdf.setTextColor(isLight ? 160 : 120);
      pdf.text(`${i + 1} / ${total}`, w - 60, h - 40, { align: 'right' });
    }

    progress.textContent = 'PDF 저장 중...';
    const suffix = theme === 'light' ? 'light' : 'dark';
    pdf.save(`${deckFileBase()}-${suffix}.pdf`);
  } finally {
    if (iframe) iframe.remove();
    else {
      document.body.classList.remove('pdf-capture');
      if (hiddenEls) hiddenEls.forEach((el) => (el.style.display = ''));
    }
    overlay.remove();
    setTheme(priorTheme);
  }
}

export function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'pdf-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.9);' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.2rem;';

  const progressEl = document.createElement('div');
  progressEl.className = 'pdf-progress';
  progressEl.style.cssText =
    'color:#f5f5f7;font-family:var(--font-body, sans-serif);font-size:1.1rem;font-weight:500;';
  progressEl.textContent = 'PDF 생성 준비 중...';

  const track = document.createElement('div');
  track.style.cssText = 'width:240px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;';

  const bar = document.createElement('div');
  bar.className = 'pdf-bar';
  bar.style.cssText =
    'width:0%;height:100%;background:var(--color-primary, #2997ff);transition:width 0.3s ease;border-radius:2px;';

  track.appendChild(bar);
  overlay.append(progressEl, track);
  return overlay;
}

export async function prepareMobileIframe(theme) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${PDF_W}px;height:${PDF_H}px;border:none;opacity:0;pointer-events:none;`;
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const ihtml = idoc.documentElement;
  ihtml.lang = 'ko';
  ihtml.dataset.theme = theme;

  // Clone <head> assets (preconnect, stylesheets, styles)
  const head = idoc.head;
  const meta = idoc.createElement('meta');
  meta.setAttribute('charset', 'UTF-8');
  head.appendChild(meta);
  document
    .querySelectorAll('link[rel="preconnect"], link[rel="stylesheet"], link[as="style"], style')
    .forEach((el) => head.appendChild(el.cloneNode(true)));

  // Clone body + slides (same-document clone; safer than innerHTML serialization)
  const ibody = idoc.body;
  ibody.dataset.theme = theme;
  ibody.classList.add('pdf-capture');
  document.querySelectorAll('.slide').forEach((s) => ibody.appendChild(s.cloneNode(true)));

  await idoc.fonts.ready;
  await sleep(1200);

  const slides = idoc.querySelectorAll('.slide');
  slides.forEach((s) => s.classList.add('visible'));
  return { iframe, slides, doc: idoc };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* Filename base shared by the PDF and PPTX exporters — same precedence:
   version token in title → data-slug opt-in → slugified title → fallback. */
export function deckFileBase() {
  const versionMatch = document.title.match(/V\d+/)?.[0];
  const slugAttr = document.documentElement.dataset.slug ?? document.body.dataset.slug;
  const titleSlug = document.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return versionMatch || slugAttr || titleSlug || 'slides';
}

let pdfInitialized = false;

/**
 * Convenience: wire a button with `data-action="pdf"` to trigger the export.
 * Idempotent — calling twice is a no-op, so repeated bootstrap calls don't
 * stack duplicate handlers (which would fire multiple PDF exports per click).
 */
export function initPdfButton() {
  if (pdfInitialized) return;
  pdfInitialized = true;
  document.querySelectorAll('[data-action="pdf"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme') ?? document.body.dataset.theme ?? 'dark';
      generatePDF(theme);
    });
  });
}
