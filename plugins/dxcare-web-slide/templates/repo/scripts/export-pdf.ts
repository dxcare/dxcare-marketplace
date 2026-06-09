/**
 * export-pdf — WYSIWYG PDF 내보내기.
 *
 * 화면에 보이는 그대로(box-shadow·blur·gradient·glassmorphism 포함)를 실제
 * Chromium 컴포지터로 슬라이드별 캡처해 PDF 로 묶는다. 벡터 print(window.print)
 * 는 print 엔진이 효과를 드롭/변형하고, html2canvas 는 렌더링을 자체 재구현해
 * color-mix·backdrop-filter 등에 구멍이 나므로, "보이는대로" 출력에는 실엔진
 * 스크린샷이 유일하게 신뢰 가능하다. (in-browser 버튼이 아닌 dev-time 도구인 이유:
 * 웹페이지는 자기 자신을 컴포지터 레벨로 캡처할 수 없다.)
 *
 * Usage:
 *   pnpm export-pdf --slug <slug> [--theme light|dark] [--scale 2] [--out <path>]
 *
 * 의존: playwright + pdf-lib (optionalDependencies). chromium 미설치 시
 *   `npx playwright install chromium` 안내. self-contained 원칙 유지 —
 *   shipped deck 은 변하지 않고, PDF 는 작성자 머신에서만 생성된다.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

interface Args {
  slug: string;
  theme: 'light' | 'dark';
  scale: number;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) m.set(argv[i].slice(2), argv[i + 1] ?? '');
  }
  const slug = m.get('slug') ?? '';
  if (!slug) {
    console.error('export-pdf: --slug is required. e.g. pnpm export-pdf --slug my-deck');
    process.exit(2);
  }
  const theme = m.get('theme') === 'dark' ? 'dark' : 'light';
  const scale = Math.max(1, Math.min(4, Number(m.get('scale') ?? '2') || 2));
  return { slug, theme, scale, out: m.get('out') };
}

async function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { slug, theme, scale, out } = parseArgs(process.argv.slice(2));

  const deckIndex = join(repoRoot, 'slides', slug, 'index.html');
  if (!existsSync(deckIndex)) {
    console.error(`export-pdf: deck not found at slides/${slug}/index.html`);
    process.exit(2);
  }

  // optional deps — 명확한 안내로 graceful fail
  let chromium: typeof import('playwright').chromium;
  let PDFDocument: typeof import('pdf-lib').PDFDocument;
  try {
    ({ chromium } = await import('playwright'));
    ({ PDFDocument } = await import('pdf-lib'));
  } catch {
    console.error(
      'export-pdf: requires playwright + pdf-lib.\n' +
        '  pnpm add -D playwright pdf-lib && npx playwright install chromium',
    );
    process.exit(3);
  }

  // 내장 정적 서버 — docroot=repoRoot 면 /_shared/ · /slides/ · ./theme.css 가 source 에서 해결.
  // Next 앱/auth 우회(deck HTML 은 정적이라 raw serve = 동일 픽셀).
  const server = createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const fp = resolve(join(repoRoot, p));
      if (!fp.startsWith(repoRoot + '/') && fp !== repoRoot) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (existsSync(fp) && statSync(fp).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[extname(fp).toLowerCase()] ?? 'application/octet-stream' });
        res.end(readFileSync(fp));
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  let browser: import('playwright').Browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    server.close();
    console.error(
      'export-pdf: failed to launch Chromium — run `npx playwright install chromium`.\n' + String(e),
    );
    process.exit(3);
  }

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: scale,
    });
    // deck 의 initTheme() 가 기본 'dark' 이고 setTheme 은 html+body 둘 다 flip 하므로,
    // 로드 전 localStorage 로 선호 테마를 주입(initTheme 가 읽어 양쪽 정상 적용).
    await page.addInitScript((t) => {
      try { localStorage.setItem('deck-theme', t as string); } catch { /* noop */ }
    }, theme);
    await page.goto(`http://localhost:${port}/slides/${slug}/index.html`, { waitUntil: 'networkidle' });
    // belt-and-suspenders: html+body 둘 다 set + themechange 발행(차트 재채색). gallery
    // 자족 deck(다른 localStorage 키)도 이 직접 set 으로 커버.
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      if (document.body) document.body.setAttribute('data-theme', t);
      try { localStorage.setItem('deck-theme', t); } catch { /* noop */ }
      window.dispatchEvent(new CustomEvent('deck:themechange', { detail: { theme: t } }));
    }, theme);
    // export 클린업: deck chrome 숨김 + reveal/transition 정적(중간 프레임 방지). 효과(box-shadow 등)는 보존.
    await page.addStyleTag({
      content: `
        .deck-controls, .deck-progress, .nav-dots, .top-bar, .slide-counter, .deck-nav { display: none !important; }
        .slide > *, .slide .slide-content > * { opacity: 1 !important; animation: none !important; }
        html { scroll-behavior: auto !important; }
      `,
    });
    await page.evaluate(() => (document as any).fonts?.ready);
    await page.waitForTimeout(500);

    const count = await page.locator('.slide').count();
    if (count === 0) {
      throw new Error('no .slide elements found — is this a DXCare-slide deck?');
    }

    const pdf = await PDFDocument.create();
    const PT_W = 960;
    const PT_H = 540; // 16:9 page (pt)

    // 슬라이드 i 를 직접 활성화(mode-agnostic) — deck 의 애니메이션 nav(키보드)를
    // 쓰지 않는다. rich(scroll-snap) deck 은 nav 에 600ms isAnimating lock +
    // scrollIntoView({behavior:'smooth'}) 가 있어 고정 sleep 로 캡처하면 슬라이드가
    // 중복/누락된다(스킵 press). 직접 위치 = lock/애니메이션 타이밍 무관, 양 모드 모두:
    //   absolute-fade(skeleton): 활성 슬라이드만 opacity/data-active/z-index 강제
    //   scroll-snap(rich): 해당 슬라이드를 instant 로 viewport 최상단 정렬
    for (let i = 0; i < count; i++) {
      await page.evaluate((idx) => {
        const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'));
        slides.forEach((s, j) => {
          const on = j === idx;
          s.style.setProperty('opacity', on ? '1' : '0', 'important');
          s.setAttribute('data-active', on ? 'true' : 'false');
          if (on) s.style.setProperty('z-index', '10');
          else s.style.removeProperty('z-index');
        });
        // scroll-behavior:auto 가 주입돼 있어 instant. block:start = 100vh 슬라이드가 viewport 채움.
        slides[idx]?.scrollIntoView({ block: 'start' });
      }, i);
      await page.waitForTimeout(250); // 레이아웃/폰트 settle
      const buf = await page.screenshot({ type: 'png' });
      const img = await pdf.embedPng(buf);
      const pg = pdf.addPage([PT_W, PT_H]);
      pg.drawImage(img, { x: 0, y: 0, width: PT_W, height: PT_H });
    }

    const outPath = join(repoRoot, out ?? join('slides', slug, `${slug}.pdf`));
    writeFileSync(outPath, await pdf.save());
    console.log(`export-pdf: ${count} slides (${theme}, ${scale}x) -> ${outPath}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error('export-pdf failed:', e?.message ?? e);
  process.exit(1);
});
