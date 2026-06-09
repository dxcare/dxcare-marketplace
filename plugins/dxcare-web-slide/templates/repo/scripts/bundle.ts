/**
 * bundle — deck 을 host-agnostic 정적 flat 폴더로 평탄화.
 *
 * 어느 정적 호스트(루트 서빙이든 `/<repo>/` 서브경로 서빙이든)에 올려도 작동하는
 * 단일 폴더 `dist/<slug>/` 를 만든다. 핵심: deck 의 루트절대 `/_shared/…` 참조를
 * **각 파일 위치 기준 상대경로로 재작성**한다 — 절대경로는 GitHub project Pages 의
 * `<user>.github.io/<repo>/` 서브경로에서 user-root 를 가리켜 404 가 나기 때문
 * (`<base href>` 는 절대경로를 못 고침). 상대경로는 루트·서브경로·file:// 전부 작동.
 *
 * rich deck(`/_shared/` 0참조)은 index.html+assets 만, skeleton 은 `_shared/` 동봉.
 * CDN libs(Pretendard/html2canvas/jspdf/chart)는 유지(온라인 전제).
 *
 * Usage: pnpm bundle --slug <slug> [--out dist/<slug>]
 */
import {
  existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync,
} from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs']);

function parseArgs(argv: string[]) {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) m.set(argv[i].slice(2), argv[i + 1] ?? '');
  }
  const slug = m.get('slug') ?? '';
  if (!slug) {
    console.error('bundle: --slug is required. e.g. pnpm bundle --slug my-deck');
    process.exit(2);
  }
  return { slug, out: m.get('out') };
}

/**
 * 파일 안의 루트절대 `/_shared/…` 참조를, 그 파일의 dist 내 위치(relDir) 기준
 * 상대경로로 재작성. 따옴표/괄호 컨텍스트(href·src·import·@import url)를 모두 커버.
 */
function rewriteSharedRefs(content: string, relDir: string): string {
  return content.replace(/\/_shared\/([A-Za-z0-9_./-]*)/g, (_m, rest: string) => {
    let rel = relative(relDir === '' ? '.' : relDir, join('_shared', rest));
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
  });
}

/** src 디렉토리를 dst 로 재귀 복사하면서, 텍스트 파일은 /_shared/ 재작성. relBase = dist 루트 기준 현재 위치. */
function copyTree(srcDir: string, dstDir: string, relBase: string) {
  mkdirSync(dstDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const s = join(srcDir, name);
    const d = join(dstDir, name);
    const relPath = relBase === '' ? name : `${relBase}/${name}`;
    if (statSync(s).isDirectory()) {
      copyTree(s, d, relPath);
    } else if (TEXT_EXT.has(extname(name).toLowerCase())) {
      writeFileSync(d, rewriteSharedRefs(readFileSync(s, 'utf8'), dirname(relPath) === '.' ? '' : dirname(relPath)));
    } else {
      copyFileSync(s, d);
    }
  }
}

function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { slug, out } = parseArgs(process.argv.slice(2));

  const deckDir = join(repoRoot, 'slides', slug);
  const indexPath = join(deckDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(`bundle: deck not found at slides/${slug}/index.html`);
    process.exit(2);
  }

  const outDir = out ? join(repoRoot, out) : join(repoRoot, 'dist', slug);
  // 기존 산출물 clean (stale 방지)
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const indexHtml = readFileSync(indexPath, 'utf8');
  const isSkeleton = indexHtml.includes('/_shared/');

  // 1) index.html — /_shared/ 절대→상대 재작성 (deck 루트 = relDir '')
  writeFileSync(join(outDir, 'index.html'), rewriteSharedRefs(indexHtml, ''));

  // 2) theme.css (있으면)
  const themeCss = join(deckDir, 'theme.css');
  if (existsSync(themeCss)) writeFileSync(join(outDir, 'theme.css'), rewriteSharedRefs(readFileSync(themeCss, 'utf8'), ''));
  else console.warn(`bundle: warning — slides/${slug}/theme.css 없음 (generate-theme 미실행?) — 진행`);

  // 3) assets/ (있으면)
  const assetsDir = join(deckDir, 'assets');
  if (existsSync(assetsDir)) copyTree(assetsDir, join(outDir, 'assets'), 'assets');

  // 4) skeleton 이면 _shared/ 동봉 (+ 내부 /_shared/ 재작성: base.css @import 등)
  if (isSkeleton) {
    copyTree(join(repoRoot, '_shared'), join(outDir, '_shared'), '_shared');
  }

  const mode = isSkeleton ? 'skeleton (+_shared)' : 'rich (no _shared)';
  console.log(`bundle: ${slug} (${mode}) -> ${relative(repoRoot, outDir)}/`);
}

main();
