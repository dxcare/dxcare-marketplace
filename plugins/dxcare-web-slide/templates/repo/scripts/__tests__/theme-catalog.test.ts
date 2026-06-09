import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'theme-catalog.mjs');

const VALID_CATEGORIES = ['investor', 'tech', 'education', 'creative', 'basic'];

function runJson(): Array<{
  preset: string;
  category: string;
  description: string;
  mood: string;
}> {
  const out = execFileSync('node', [script], { encoding: 'utf8' });
  return JSON.parse(out);
}

describe('theme-catalog.mjs (JSON output)', () => {
  it('emits exactly 16 entries', () => {
    const entries = runJson();
    expect(entries).toHaveLength(16);
  });

  it('assigns every preset a valid category', () => {
    for (const e of runJson()) {
      expect(VALID_CATEGORIES).toContain(e.category);
    }
  });

  it('gives every preset a non-empty description and mood', () => {
    for (const e of runJson()) {
      expect(typeof e.description).toBe('string');
      expect(e.description.trim().length).toBeGreaterThan(0);
      expect(typeof e.mood).toBe('string');
      expect(e.mood.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate preset names', () => {
    const presets = runJson().map((e) => e.preset);
    expect(new Set(presets).size).toBe(presets.length);
  });

  it('emits entries sorted alphabetically by preset', () => {
    const presets = runJson().map((e) => e.preset);
    const sorted = [...presets].sort((a, b) => a.localeCompare(b));
    expect(presets).toEqual(sorted);
  });
});

describe('theme-catalog.mjs (--format=md output)', () => {
  it('emits the markdown reference body with the selection guide', () => {
    const md = execFileSync('node', [script, '--format=md'], { encoding: 'utf8' });
    expect(md).toContain('# 테마 레퍼런스');
    expect(md).toContain('## 테마 선택 가이드');
    // Each preset has its own section + the core token rows.
    for (const e of runJson()) {
      expect(md).toContain(`## ${e.preset}`);
    }
    expect(md).toContain('`--bg`');
    expect(md).toContain('`--accent`');
  });
});
