import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// AC-1.4 — themes-reference.md 가 theme/*.json 단일 출처에서 재생성된 것임을
// 검증한다. 구형 367줄 손-문서(12종·--bg-primary)로의 회귀 + 색 drift 를 차단.
const here = dirname(fileURLToPath(import.meta.url));
const themeDir = join(here, '..', '..', '_templates', 'theme');
const refPath = join(here, '..', '..', '_templates', 'theme-examples', 'themes-reference.md');

const presets = readdirSync(themeDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    slug: f.replace(/\.json$/, ''),
    json: JSON.parse(readFileSync(join(themeDir, f), 'utf8')),
  }));

const md = readFileSync(refPath, 'utf8');

// 각 preset 의 "## {slug}" 섹션 본문을 잘라낸다.
function sectionOf(slug: string): string {
  const start = md.indexOf(`## ${slug}\n`);
  if (start === -1) return '';
  const rest = md.slice(start + 3 + slug.length);
  const next = rest.indexOf('\n## ');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('themes-reference.md (AC-1.4 — json 단일 출처 재생성)', () => {
  it('16 preset 전부 존재', () => {
    expect(presets.length).toBe(16);
    for (const { slug } of presets) {
      expect(md, `## ${slug} 섹션 누락`).toContain(`## ${slug}\n`);
    }
  });

  it('각 preset 의 --bg / --accent hex 가 해당 json tokens.color 값과 일치 (drift 차단)', () => {
    for (const { slug, json } of presets) {
      const sec = sectionOf(slug);
      expect(sec, `${slug} 섹션 비어있음`).not.toBe('');
      const colorValues = Object.values(json.tokens.color as Record<string, string>)
        .map((v) => String(v).toLowerCase());
      const hexes = [...sec.matchAll(/`--(?:bg|accent)`:\s*`([^`]+)`/g)].map((m) => m[1].toLowerCase());
      expect(hexes.length, `${slug}: --bg/--accent 토큰 줄 누락`).toBeGreaterThanOrEqual(2);
      for (const hex of hexes) {
        expect(colorValues, `${slug}: md 색 ${hex} 가 json tokens.color 에 없음 (하드코딩/drift)`).toContain(hex);
      }
    }
  });

  it('구형 --bg-primary 변수 잔재 0 (3번째 SSOT 폐기)', () => {
    expect(md).not.toContain('--bg-primary');
    expect(md).not.toContain('--card-bg');
  });
});
