#!/usr/bin/env node
// CI helper — validate every theme preset JSON. Resolves the presets
// directory relative to this script's own location.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'templates', 'repo', '_templates', 'theme');
if (!existsSync(dir)) {
  console.log('(no presets directory — nothing to validate)');
  process.exit(0);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.log('(no preset files found)');
  process.exit(0);
}

for (const f of files) {
  const t = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (!t.preset) {
    console.error(`FAIL: ${f} missing "preset" field`);
    process.exit(1);
  }
  if (!t.tokens || typeof t.tokens !== 'object') {
    console.error(`FAIL: ${f} missing "tokens" object`);
    process.exit(1);
  }
  if (!t.tokens.color) {
    console.error(`FAIL: ${f} tokens missing "color" group`);
    process.exit(1);
  }
  // B-016 Story 4: catalog metadata — every preset must carry a valid
  // category (enum) plus non-empty description and mood. These power the
  // theme catalog emitter + themes-reference.md.
  const VALID_CATEGORIES = ['investor', 'tech', 'education', 'creative', 'basic'];
  if (!VALID_CATEGORIES.includes(t.category)) {
    console.error(
      `FAIL: ${f} has invalid or missing "category" (got ${JSON.stringify(t.category)}; expected one of ${VALID_CATEGORIES.join(', ')})`,
    );
    process.exit(1);
  }
  if (typeof t.description !== 'string' || t.description.trim() === '') {
    console.error(`FAIL: ${f} missing non-empty "description" field`);
    process.exit(1);
  }
  if (typeof t.mood !== 'string' || t.mood.trim() === '') {
    console.error(`FAIL: ${f} missing non-empty "mood" field`);
    process.exit(1);
  }
  // D1 regression guard (B-002): every font stack must include a
  // Korean-capable family, else Korean text falls back to a system font
  // and renders unpolished. Catches a preset reverting to bare 'Pretendard'
  // or an all-Latin stack.
  const KR_FONTS = [
    'Pretendard Variable',
    'Pretendard',
    'Noto Serif KR',
    'Noto Sans KR',
    'Nanum',
    'Apple SD Gothic',
    'IBM Plex Sans KR',
    'Spoqa',
    'Black Han Sans',
    'D2Coding',
  ];
  if (t.tokens.font) {
    for (const role of ['heading', 'body']) {
      const stack = t.tokens.font[role];
      if (typeof stack === 'string' && !KR_FONTS.some((kf) => stack.includes(kf))) {
        console.error(
          `FAIL: ${f} tokens.font.${role} has no Korean-capable family (D1 regression): ${stack}`,
        );
        process.exit(1);
      }
    }
  }
}
console.log(`All ${files.length} presets OK`);
