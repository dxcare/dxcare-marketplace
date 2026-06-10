/* Standalone HTML exporter — 서버 기동 없이 file:// 로 더블클릭해 열 수 있는
   단일 HTML 파일을 다운로드한다 (B-022).

   - 같은 출처 CSS(base/diagrams/a11y/print/theme)는 <style>로 인라인
   - <img>는 data URI로 임베드 (로고 등)
   - slide-core.js는 ES 모듈이라 file:// 에서 CORS로 차단되므로, 내보내기
     파일에는 자체 내장 미니 플레이어(키보드·클릭·스와이프 내비, 테마 토글,
     진행바, 닷, 해시 딥링크)를 인라인 일반 스크립트로 탑재한다
   - 웹폰트 CDN <link>는 유지 — 온라인이면 동일 렌더, 완전 오프라인이면
     시스템 폰트로 graceful 대체 (임베드 시 파일이 수 MB로 커지는 트레이드오프)
   - PDF/PPTX 버튼은 CDN 의존이라 내보내기 파일에서는 제외 */

import { deckFileBase } from './pdf.js';
import { imgToDataUrl } from './pptx.js';

export async function generateStandaloneHTML() {
  // 1) 같은 출처 스타일시트 인라인 (CDN 폰트 CSS는 <link>로 유지)
  let styles = '';
  let fontLinks = '';
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    if (node.tagName === 'STYLE') {
      styles += node.textContent + '\n';
      continue;
    }
    const href = node.getAttribute('href') ?? '';
    if (/^https?:\/\//.test(href) && !href.startsWith(location.origin)) {
      fontLinks += node.outerHTML + '\n';
      continue;
    }
    try {
      const css = await (await fetch(node.href)).text();
      const media = node.getAttribute('media');
      styles += media && media !== 'all' ? `@media ${media} {\n${css}\n}\n` : css + '\n';
    } catch {
      /* unreachable stylesheet — skip */
    }
  }

  // 2) 덱 마크업 복제 + 이미지 data URI 임베드
  const deck = document.getElementById('deck').cloneNode(true);
  deck.querySelectorAll('.nav-dots').forEach((el) => el.remove()); // 플레이어가 재생성
  const liveImgs = document.querySelectorAll('#deck img');
  const clonedImgs = deck.querySelectorAll('img');
  for (let i = 0; i < clonedImgs.length; i++) {
    const data = await imgToDataUrl(liveImgs[i]).catch(() => null);
    if (data) clonedImgs[i].setAttribute('src', data);
    else clonedImgs[i].remove();
  }
  deck.querySelectorAll('.slide').forEach((s) => s.removeAttribute('data-active'));

  const brandMarks = [];
  for (const img of document.querySelectorAll('body > img.brand-mark')) {
    const data = await imgToDataUrl(img).catch(() => null);
    if (data) brandMarks.push(img.outerHTML.replace(/src="[^"]*"/, `src="${data}"`));
  }

  let favicon = '';
  const iconEl = document.querySelector('link[rel="icon"]');
  if (iconEl) {
    const probe = new Image();
    probe.src = iconEl.href;
    const data = await imgToDataUrl(probe).catch(() => null);
    if (data) favicon = `<link rel="icon" href="${data}">`;
  }

  const theme = document.body.dataset.theme ?? 'dark';
  const html = `<!doctype html>
<html lang="${document.documentElement.lang || 'ko'}" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(document.title)}</title>
${favicon}
${fontLinks}<style>
${styles}</style>
</head>
<body data-theme="${theme}">
  ${brandMarks.join('\n  ')}
  ${deck.outerHTML}
  <aside class="deck-controls" aria-label="slide controls">
    <button data-action="prev" aria-label="previous slide">‹</button>
    <span class="deck-counter"><span data-current>1</span> / <span data-total>1</span></span>
    <button data-action="next" aria-label="next slide">›</button>
    <button data-action="fullscreen" aria-label="toggle fullscreen">⛶</button>
    <button data-action="theme" aria-label="toggle theme (T)">☾</button>
  </aside>
  <div class="deck-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
  <script>
${PLAYER_JS}</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${deckFileBase()}-standalone.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/* 내장 미니 플레이어 — slide-core.js(ES 모듈)의 핵심 동작을 file:// 호환
   일반 스크립트로 축약: data-active 활성화 모델, 키보드/스와이프/버튼 내비,
   닷, 카운터, 진행바, 테마 토글, 해시 딥링크. */
const PLAYER_JS = `(function () {
  'use strict';
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var total = slides.length;
  var cur = Math.min(Math.max(parseInt((location.hash.match(/slide\\/(\\d+)/) || [])[1] || '1', 10), 1), total) - 1;

  var dots = document.createElement('nav');
  dots.className = 'nav-dots';
  dots.setAttribute('aria-label', 'slide navigation');
  slides.forEach(function (_, i) {
    var b = document.createElement('button');
    b.className = 'nav-dot';
    b.setAttribute('aria-label', '슬라이드 ' + (i + 1) + '로 이동');
    b.addEventListener('click', function () { go(i); });
    dots.appendChild(b);
  });
  document.body.appendChild(dots);

  function go(n) {
    cur = Math.min(Math.max(n, 0), total - 1);
    slides.forEach(function (s, i) { s.setAttribute('data-active', i === cur ? 'true' : 'false'); });
    Array.prototype.forEach.call(dots.children, function (d, i) {
      d.classList.toggle('active', i === cur);
      if (i === cur) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    var c = document.querySelector('[data-current]');
    if (c) c.textContent = cur + 1;
    var bar = document.querySelector('.deck-progress span');
    var pct = total > 1 ? (cur / (total - 1)) * 100 : 100;
    if (bar) bar.style.width = pct + '%';
    var prog = document.querySelector('.deck-progress');
    if (prog) prog.setAttribute('aria-valuenow', String(Math.round(pct)));
    try { history.replaceState(null, '', '#/slide/' + (cur + 1)); } catch (e) { /* file:// 일부 브라우저 */ }
  }

  function setTheme(t) {
    document.body.dataset.theme = t;
    document.documentElement.dataset.theme = t;
    var btn = document.querySelector('[data-action="theme"]');
    if (btn) btn.textContent = t === 'dark' ? '\\u263E' : '\\u2600';
  }

  var t = document.querySelector('[data-total]');
  if (t) t.textContent = total;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(cur + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(total - 1);
    else if (e.key === 't' || e.key === 'T') setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var a = btn.getAttribute('data-action');
    if (a === 'next') go(cur + 1);
    else if (a === 'prev') go(cur - 1);
    else if (a === 'theme') setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
    else if (a === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }
  });

  var touchX = null;
  document.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });

  go(cur);
})();
`;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let htmlInitialized = false;

/** Wire `[data-action="html"]` buttons. Idempotent like initPdfButton. */
export function initHtmlButton() {
  if (htmlInitialized) return;
  htmlInitialized = true;
  document.querySelectorAll('[data-action="html"]').forEach((btn) => {
    btn.addEventListener('click', () => generateStandaloneHTML());
  });
}
