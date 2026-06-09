import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderThemeCss, loadTheme, writeThemeCss, type Theme } from '../theme-css.js';

// Absolute path to the shipped preset library (_templates/theme), resolved from
// this test file's own location so the assertions run against the REAL presets
// rather than an inline fixture.
const PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '_templates', 'theme');

function loadPreset(name: string): Theme {
  const raw = JSON.parse(readFileSync(join(PRESETS_DIR, `${name}.json`), 'utf8')) as {
    preset: string;
    tokens: Theme['tokens'];
  };
  return { preset: raw.preset, tokens: raw.tokens };
}

const SAMPLE = {
  preset: 'corporate',
  tokens: {
    color: { bg: '#FFFFFF', bgDark: '#0A1A24', fg: '#0A1A24', fgDark: '#F5F7F9', primary: '#0B4F6C', accent: '#01BAEF', muted: '#94A3B0' },
    font: { heading: "'Pretendard', sans-serif", body: "'Pretendard', sans-serif", mono: "'JetBrains Mono', monospace" },
    radius: { sm: '4px', md: '8px', lg: '16px' },
    motion: { fast: '150ms', base: '250ms' },
  },
};

describe('renderThemeCss', () => {
  it('emits a :root block with kebab-cased custom properties for every token', () => {
    const css = renderThemeCss(SAMPLE);
    expect(css).toContain(':root {');
    // color group is UNPREFIXED so CSS vars match base.css conventions
    expect(css).toContain('--bg: #FFFFFF;');
    expect(css).toContain('--bg-dark: #0A1A24;');
    expect(css).toContain('--primary: #0B4F6C;');
    // other groups keep their prefix
    expect(css).toContain("--font-heading: 'Pretendard', sans-serif;");
    expect(css).toContain('--radius-md: 8px;');
    expect(css).toContain('--motion-fast: 150ms;');
  });

  it('emits a dark-mode selector that swaps bg/fg tokens to their *Dark variants', () => {
    const css = renderThemeCss(SAMPLE);
    expect(css).toMatch(/\[data-theme="dark"\] *{/);
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toContain('--bg: #0A1A24;');
    expect(darkBlock).toContain('--fg: #F5F7F9;');
  });

  it('starts with a generated-header comment identifying the source', () => {
    const css = renderThemeCss(SAMPLE);
    expect(css.startsWith('/*')).toBe(true);
    expect(css).toContain('theme.json');
    expect(css).toContain('do not edit by hand');
  });

  it('renders tokens in a stable order (color → font → radius → motion)', () => {
    const css = renderThemeCss(SAMPLE);
    // color group is unprefixed; detect it via the first `--bg` declaration
    const iColor = css.indexOf('--bg:');
    const iFont = css.indexOf('--font-');
    const iRadius = css.indexOf('--radius-');
    const iMotion = css.indexOf('--motion-');
    expect(iColor).toBeGreaterThan(-1);
    expect(iColor).toBeLessThan(iFont);
    expect(iFont).toBeLessThan(iRadius);
    expect(iRadius).toBeLessThan(iMotion);
  });

  it('handles a tokens object that omits optional groups gracefully', () => {
    const css = renderThemeCss({ preset: 'x', tokens: { color: { bg: '#fff', fg: '#000' } } });
    expect(css).toContain('--bg: #fff;');
    expect(css).toContain('--fg: #000;');
    // No font section
    expect(css).not.toContain('--font-');
  });
});

describe('renderThemeCss — accent-derived tints (B-004 cross-preset fix)', () => {
  // Extract the :root block (before any [data-theme] selector) for assertions
  // that must target the light/base tokens specifically.
  function rootBlock(css: string): string {
    const end = css.indexOf('[data-theme=');
    return end === -1 ? css : css.slice(0, end);
  }

  it('derives --diagram-accent-tint + --accent-glow from a non-blue hex accent (warm: gold)', () => {
    const css = renderThemeCss({ preset: 'warm', tokens: { color: { primary: '#C4533A', accent: '#E2A93B' } } });
    // #E2A93B === rgb(226, 169, 59). Tint shares the accent's r,g,b; only alpha differs.
    expect(css).toContain('--diagram-accent-tint: rgba(226, 169, 59, 0.1);');
    expect(css).toContain('--accent-glow: rgba(226, 169, 59, 0.3);');
  });

  it('derives the tint from the tokens.css fallback when the preset omits an accent key', () => {
    // Presets like corporate-slate / soft-botanical define only `primary`, so
    // their --accent resolves to the tokens.css fallback #01baef === rgb(1,186,239).
    // The tint must match that resolved accent, not a fixed keynote-blue.
    const css = renderThemeCss({ preset: 'slate', tokens: { color: { primary: '#d90429' } } });
    expect(css).toContain('--diagram-accent-tint: rgba(1, 186, 239, 0.1);');
    expect(css).toContain('--accent-glow: rgba(1, 186, 239, 0.3);');
  });

  it('keeps keynote-dark blue identical to the legacy hard-coded tint (no regression)', () => {
    const css = renderThemeCss({
      preset: 'keynote-dark',
      tokens: { color: { accent: '#2997ff', accentDark: '#2997ff', accentGlow: 'rgba(41, 151, 255, 0.12)', accentGlowDark: 'rgba(41, 151, 255, 0.3)' } },
    });
    // #2997ff === rgb(41, 151, 255) — the exact legacy fill.
    expect(css).toContain('--diagram-accent-tint: rgba(41, 151, 255, 0.1);');
  });

  it('respects an explicitly-authored accentGlow token instead of re-deriving it', () => {
    const css = renderThemeCss({ preset: 'k', tokens: { color: { accent: '#2997ff', accentGlow: 'rgba(41, 151, 255, 0.12)' } } });
    const root = rootBlock(css);
    // Author's 0.12 alpha wins in :root; we do NOT also emit a derived 0.3.
    expect(root).toContain('--accent-glow: rgba(41, 151, 255, 0.12);');
    expect(root).not.toContain('--accent-glow: rgba(41, 151, 255, 0.3);');
  });

  it('re-derives the dark-mode tint when accentDark differs from the light accent', () => {
    const css = renderThemeCss({ preset: 'd', tokens: { color: { accent: '#E2A93B', accentDark: '#2997ff' } } });
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toContain('--diagram-accent-tint: rgba(41, 151, 255, 0.1);');
    expect(darkBlock).toContain('--accent-glow: rgba(41, 151, 255, 0.3);');
  });

  it('handles a 3-digit hex accent', () => {
    const css = renderThemeCss({ preset: 's', tokens: { color: { accent: '#0f0' } } });
    expect(css).toContain('--diagram-accent-tint: rgba(0, 255, 0, 0.1);');
  });

  it('skips derivation (no crash) when the accent is a non-hex value', () => {
    const css = renderThemeCss({ preset: 'r', tokens: { color: { accent: 'rgba(10, 20, 30, 1)' } } });
    // Can't safely re-alpha a non-hex accent → no derived tint emitted; the
    // diagrams.css :root fallback applies instead.
    expect(css).not.toContain('--diagram-accent-tint:');
    expect(css).not.toContain('--accent-glow:');
  });
});

describe('keynote-dark preset → theme.css (B-009 shipped-preset unit check)', () => {
  function rootBlock(css: string): string {
    const end = css.indexOf('[data-theme=');
    return end === -1 ? css : css.slice(0, end);
  }

  it('emits the preset accent #2997ff as --accent in :root', () => {
    const css = renderThemeCss(loadPreset('keynote-dark'));
    expect(rootBlock(css)).toContain('--accent: #2997ff;');
  });

  it('emits --bg-dark: #000000 (the dark canvas swap source)', () => {
    const css = renderThemeCss(loadPreset('keynote-dark'));
    // `bgDark` is the *Dark counterpart of `bg`; in :root it lands as --bg-dark
    // and the [data-theme="dark"] block swaps --bg to it.
    expect(css).toContain('--bg-dark: #000000;');
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toContain('--bg: #000000;');
  });

  it('derives --diagram-accent-tint from the #2997ff accent (rgba, 0.1 alpha)', () => {
    const css = renderThemeCss(loadPreset('keynote-dark'));
    // The preset ships explicit accentGlow/accentGlowDark but NO accentTint,
    // so the tint is DERIVED from accent #2997ff === rgb(41, 151, 255).
    expect(css).toContain('--diagram-accent-tint: rgba(41, 151, 255, 0.1);');
  });

  it('keeps the explicitly-authored accentGlow tokens (light 0.12 / dark 0.3)', () => {
    const css = renderThemeCss(loadPreset('keynote-dark'));
    expect(rootBlock(css)).toContain('--accent-glow: rgba(41, 151, 255, 0.12);');
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toContain('--accent-glow: rgba(41, 151, 255, 0.3);');
  });
});

describe('loadTheme + writeThemeCss (filesystem round trip)', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'theme-css-'));
    mkdirSync(join(repo, '_templates', 'theme'), { recursive: true });
    mkdirSync(join(repo, 'slides', 'demo'), { recursive: true });
    writeFileSync(join(repo, '_templates', 'theme', 'corporate.json'), JSON.stringify(SAMPLE));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('reads slides/<slug>/theme.json when present', () => {
    writeFileSync(join(repo, 'slides', 'demo', 'theme.json'), JSON.stringify({
      preset: 'corporate',
      tokens: { ...SAMPLE.tokens, color: { ...SAMPLE.tokens.color, primary: '#FF0000' } },
    }));
    const theme = loadTheme(repo, 'demo');
    expect(theme.preset).toBe('corporate');
    // `color` is an optional group on ThemeTokens; these fixtures always define
    // it, so a non-null assertion keeps strict tsc (TS18048) happy without
    // weakening the assertion (B-013).
    expect(theme.tokens.color!.primary).toBe('#FF0000');
  });

  it('falls back to _templates/theme/<preset>.json when slide has only {preset}', () => {
    writeFileSync(join(repo, 'slides', 'demo', 'theme.json'), JSON.stringify({ preset: 'corporate' }));
    const theme = loadTheme(repo, 'demo');
    expect(theme.tokens.color!.primary).toBe('#0B4F6C');
  });

  it('merges slide overrides on top of preset tokens', () => {
    writeFileSync(join(repo, 'slides', 'demo', 'theme.json'), JSON.stringify({
      preset: 'corporate',
      overrides: { color: { primary: '#FF0000' } },
    }));
    const theme = loadTheme(repo, 'demo');
    expect(theme.tokens.color!.primary).toBe('#FF0000');
    // Other color tokens survive from the preset
    expect(theme.tokens.color!.accent).toBe('#01BAEF');
  });

  it('throws when preset is unknown', () => {
    writeFileSync(join(repo, 'slides', 'demo', 'theme.json'), JSON.stringify({ preset: 'does-not-exist' }));
    expect(() => loadTheme(repo, 'demo')).toThrow(/preset/);
  });

  it('writeThemeCss produces slides/<slug>/theme.css with :root block', () => {
    writeFileSync(join(repo, 'slides', 'demo', 'theme.json'), JSON.stringify({ preset: 'corporate' }));
    const outPath = writeThemeCss(repo, 'demo');
    expect(outPath).toBe(join(repo, 'slides', 'demo', 'theme.css'));
    const css = readFileSync(outPath, 'utf8');
    expect(css).toContain(':root {');
    expect(css).toContain('--primary: #0B4F6C;');
  });
});
