#!/usr/bin/env node
// Theme catalog emitter (B-016 Story 4). Reads every preset JSON in
// ../_templates/theme and emits either:
//   - default: a JSON array of { preset, category, description, mood }
//     sorted alphabetically by preset (stdout, 2-space indent).
//   - --format=md: the themes-reference.md body — a category selection
//     guide table + a per-preset section. Colors come straight from each
//     preset's tokens.color (no hard-coded values).
//
// Single source of truth: the 16 theme JSONs. Both the JSON array and the
// markdown reference are derived from them.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '_templates', 'theme');

const CATEGORY_ORDER = ['investor', 'tech', 'education', 'creative', 'basic'];
const CATEGORY_LABEL = {
  investor: '투자/IR',
  tech: '테크/개발',
  education: '교육/헬스케어',
  creative: '크리에이티브',
  basic: '기본/범용',
};

/** Load all preset JSONs, sorted alphabetically by preset name. */
function loadPresets() {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const themes = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  themes.sort((a, b) => a.preset.localeCompare(b.preset));
  return themes;
}

/** Compact catalog entries for the JSON emitter. */
function toEntries(themes) {
  return themes.map((t) => ({
    preset: t.preset,
    category: t.category,
    description: t.description,
    mood: t.mood,
  }));
}

/** Render the themes-reference.md body from the loaded presets. */
function renderMarkdown(themes) {
  const lines = [];
  lines.push('# 테마 레퍼런스');
  lines.push('');
  lines.push('자동 생성 문서 — `scripts/theme-catalog.mjs --format=md` 출력.');
  lines.push('단일 출처는 `_templates/theme/*.json` 16개 프리셋이다.');
  lines.push('');

  // Category selection guide table.
  lines.push('## 테마 선택 가이드');
  lines.push('');
  lines.push('| 카테고리 | 프리셋 |');
  lines.push('| --- | --- |');
  for (const cat of CATEGORY_ORDER) {
    const inCat = themes.filter((t) => t.category === cat);
    if (inCat.length === 0) continue;
    const label = CATEGORY_LABEL[cat] || cat;
    const presets = inCat.map((t) => `\`${t.preset}\``).join(', ');
    lines.push(`| ${label} (${cat}) | ${presets} |`);
  }
  lines.push('');

  // Per-preset sections.
  for (const t of themes) {
    const color = (t.tokens && t.tokens.color) || {};
    const bg = color.bgDark || '';
    const accent = color.accent || '';
    lines.push(`## ${t.preset}`);
    lines.push('');
    lines.push(`**Category**: ${t.category}`);
    lines.push('');
    lines.push(`**분위기**: ${t.mood}`);
    lines.push('');
    lines.push(t.description);
    lines.push('');
    lines.push('핵심 토큰:');
    lines.push('');
    lines.push(`- \`--bg\`: \`${bg}\``);
    lines.push(`- \`--accent\`: \`${accent}\``);
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const themes = loadPresets();
  const format = process.argv.includes('--format=md') ? 'md' : 'json';
  if (format === 'md') {
    process.stdout.write(renderMarkdown(themes) + '\n');
  } else {
    process.stdout.write(JSON.stringify(toEntries(themes), null, 2) + '\n');
  }
}

main();
