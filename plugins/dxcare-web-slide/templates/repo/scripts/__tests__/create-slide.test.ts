import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSlide } from '../create-slide.js';

describe('createSlide', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cs-'));
    mkdirSync(join(root, '_templates', 'theme'), { recursive: true });
    writeFileSync(join(root, '_templates', 'skeleton.md'), '---\ntitle: "{{TITLE}}"\nslug: {{SLUG}}\naudience: "{{AUDIENCE}}"\nmeeting_date: {{MEETING_DATE}}\n---\n\n# Slide 1: Title\n**Core Message:** {{CORE_MESSAGE}}\n');
    writeFileSync(join(root, '_templates', 'meta.json'), '{"slug":"{{SLUG}}","title":"{{TITLE}}","audience":"{{AUDIENCE}}","audience_org":"{{AUDIENCE_ORG}}","meeting_date":"{{MEETING_DATE}}","status":"draft","private":false,"features":{},"milestones":[]}');
    writeFileSync(join(root, '_templates', 'index.html'), '<html>{{TITLE}}</html>');
    writeFileSync(join(root, '_templates', 'theme', 'corporate.json'), '{"preset":"corporate","tokens":{}}');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates slide directory with substituted files', async () => {
    const r = await createSlide({
      repoRoot: root,
      slug: 'test-deck',
      title: 'Test Deck',
      audience: 'Partners',
      audienceOrg: 'ACME',
      meetingDate: '2026-06-01',
      theme: 'corporate',
      coreMessage: 'Hello',
    });
    const dir = join(root, 'slides', 'test-deck');
    expect(existsSync(dir)).toBe(true);
    const skeleton = readFileSync(join(dir, 'skeleton.md'), 'utf8');
    expect(skeleton).toContain('title: "Test Deck"');
    expect(skeleton).toContain('slug: test-deck');
    expect(skeleton).toContain('**Core Message:** Hello');
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(meta.title).toBe('Test Deck');
    expect(meta.audience_org).toBe('ACME');
    expect(r.createdFiles).toContain('slides/test-deck/index.html');
  });

  it('refuses reserved slug', async () => {
    await expect(createSlide({ repoRoot: root, slug: 'login', title: 't', audience: '', audienceOrg: '', meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '' }))
      .rejects.toThrow(/reserved/i);
  });

  it('refuses collision', async () => {
    mkdirSync(join(root, 'slides', 'dup'), { recursive: true });
    await expect(createSlide({ repoRoot: root, slug: 'dup', title: 't', audience: '', audienceOrg: '', meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '' }))
      .rejects.toThrow(/exists/i);
  });

  it('writes CLAUDE.md with project context template', async () => {
    await createSlide({ repoRoot: root, slug: 'with-ctx', title: 'X', audience: 'A', audienceOrg: 'B', meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '' });
    const ctx = readFileSync(join(root, 'slides', 'with-ctx', 'CLAUDE.md'), 'utf8');
    expect(ctx).toContain('# X');
    expect(ctx).toContain('Audience');
  });

  it('auto-generates theme.css alongside theme.json', async () => {
    // The minimal theme preset used in the other tests has empty tokens,
    // so re-seed with a richer preset to exercise the generator.
    writeFileSync(join(root, '_templates', 'theme', 'corporate.json'),
      JSON.stringify({ preset: 'corporate', tokens: { color: { bg: '#fff', primary: '#123456' } } }));
    const r = await createSlide({ repoRoot: root, slug: 'themed', title: 't', audience: '', audienceOrg: '', meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '' });
    const cssPath = join(root, 'slides', 'themed', 'theme.css');
    expect(existsSync(cssPath)).toBe(true);
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('--bg: #fff;');
    expect(css).toContain('--primary: #123456;');
    expect(r.createdFiles).toContain('slides/themed/theme.css');
  });

  // B-005 regression guard: the D2 bound-stage authoring contract must stay in
  // the SHIPPED scaffold templates. The other tests use stub templates, so
  // deleting the contract would not fail them — these assert the real files.
  it('shipped _templates carry the .slide-content authoring contract (B-005)', () => {
    const consumerRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const indexHtml = readFileSync(join(consumerRoot, '_templates', 'index.html'), 'utf8');
    // The bound-stage wrapper + an authoring-contract note must be present so
    // hand-authored slides inherit D2 instead of left-pinning.
    expect(indexHtml).toContain('slide-content');
    expect(indexHtml.toLowerCase()).toMatch(/slide-content|authoring contract/i);
  });

  it('create-slide CLAUDE.md template documents the .slide-content rule (B-005)', async () => {
    const r2 = await createSlide({
      repoRoot: root, slug: 'contract-ctx', title: 'C', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '',
    });
    expect(r2.createdFiles).toContain('slides/contract-ctx/CLAUDE.md');
    const ctx = readFileSync(join(root, 'slides', 'contract-ctx', 'CLAUDE.md'), 'utf8');
    expect(ctx).toContain('slide-content');
  });

  // B-016 Story 3 AC-3.2 regression guard: the theme contract is preset-driven.
  // Any seeded preset (not just the "base" corporate one) must scaffold a
  // theme.json, and an unknown preset must reject (Promise reject, not exit) —
  // see create-slide.ts L70 throwing "theme preset ... not found".
  it('accepts a non-base trend preset', async () => {
    writeFileSync(join(root, '_templates', 'theme', 'neon-terminal.json'),
      JSON.stringify({ preset: 'neon-terminal', tokens: { color: {} } }));
    const r = await createSlide({
      repoRoot: root, slug: 'neon-deck', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'neon-terminal', coreMessage: '',
    });
    expect(r.createdFiles).toContain('slides/neon-deck/theme.json');
  });

  it('rejects an unknown preset', async () => {
    await expect(createSlide({
      repoRoot: root, slug: 'ghost-deck', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'does-not-exist', coreMessage: '',
    })).rejects.toThrow(/not found/i);
  });

  // ── brand-mark logo wiring (0.3.5) ──────────────────────────────────────
  // Seed a brand library and an index.html that exposes the LOGO slots so we
  // can assert both the copied assets AND the substituted src wiring.
  function seedBrand(name: string, files: Record<string, string>, opts: { default?: boolean; roles?: unknown } = {}) {
    const bdir = join(root, 'brand-assets', name);
    mkdirSync(bdir, { recursive: true });
    const meta: Record<string, unknown> = { name, default: !!opts.default };
    if (opts.roles) meta.roles = opts.roles;
    writeFileSync(join(bdir, 'brand.json'), JSON.stringify(meta));
    for (const [f, body] of Object.entries(files)) writeFileSync(join(bdir, f), body);
  }
  const LOGO_INDEX = '<html><head>{{FAVICON_LINK}}</head><body>{{HERO_BLOCK}}<img class="logo-dark" src="{{LOGO_DARK}}"><img class="logo-light" src="{{LOGO_LIGHT}}"></body></html>';

  it('copies the default brand logos into the deck assets/ and wires index.html', async () => {
    writeFileSync(join(root, '_templates', 'index.html'), LOGO_INDEX);
    seedBrand('dxcare', { 'logo-on-dark.png': 'DARKPNG', 'logo-on-light.png': 'LIGHTPNG' }, { default: true });
    const r = await createSlide({
      repoRoot: root, slug: 'branded', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '',
    });
    const dir = join(root, 'slides', 'branded');
    expect(existsSync(join(dir, 'assets', 'logo-on-dark.png'))).toBe(true);
    expect(existsSync(join(dir, 'assets', 'logo-on-light.png'))).toBe(true);
    expect(readFileSync(join(dir, 'assets', 'logo-on-dark.png'), 'utf8')).toBe('DARKPNG');
    expect(r.createdFiles).toContain('slides/branded/assets/logo-on-dark.png');
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('src="./assets/logo-on-dark.png"');
    expect(html).toContain('src="./assets/logo-on-light.png"');
  });

  it('prefers svg over png for a logo slot', async () => {
    writeFileSync(join(root, '_templates', 'index.html'), LOGO_INDEX);
    seedBrand('dxcare', { 'logo-on-dark.svg': '<svg/>', 'logo-on-dark.png': 'PNG' }, { default: true });
    await createSlide({
      repoRoot: root, slug: 'svg-first', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '',
    });
    const dir = join(root, 'slides', 'svg-first');
    expect(existsSync(join(dir, 'assets', 'logo-on-dark.svg'))).toBe(true);
    expect(existsSync(join(dir, 'assets', 'logo-on-dark.png'))).toBe(false);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('src="./assets/logo-on-dark.svg"');
  });

  it('honors an explicit --brand name over the default', async () => {
    writeFileSync(join(root, '_templates', 'index.html'), LOGO_INDEX);
    seedBrand('dxcare', { 'logo-on-dark.png': 'H' }, { default: true });
    seedBrand('balance', { 'logo-on-light.png': 'B' });
    await createSlide({
      repoRoot: root, slug: 'pick', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '', brand: 'balance',
    });
    const dir = join(root, 'slides', 'pick');
    expect(existsSync(join(dir, 'assets', 'logo-on-light.png'))).toBe(true);
    expect(existsSync(join(dir, 'assets', 'logo-on-dark.png'))).toBe(false);
  });

  it('brand="none" ships no logo even when a default brand exists', async () => {
    writeFileSync(join(root, '_templates', 'index.html'), LOGO_INDEX);
    seedBrand('dxcare', { 'logo-on-dark.png': 'H' }, { default: true });
    await createSlide({
      repoRoot: root, slug: 'nologo', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '', brand: 'none',
    });
    const dir = join(root, 'slides', 'nologo');
    expect(existsSync(join(dir, 'assets'))).toBe(false);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('src=""');
  });

  it('is graceful when no brand-assets/ library exists', async () => {
    writeFileSync(join(root, '_templates', 'index.html'), LOGO_INDEX);
    const r = await createSlide({
      repoRoot: root, slug: 'libless', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '',
    });
    const dir = join(root, 'slides', 'libless');
    expect(existsSync(join(dir, 'assets'))).toBe(false);
    expect(r.createdFiles).toContain('slides/libless/index.html');
  });

  it('wires mark + hero + favicon from a brand.json roles manifest', async () => {
    writeFileSync(join(root, '_templates', 'index.html'), LOGO_INDEX);
    seedBrand('dxcare', {
      'inline-white.png': 'IW', 'inline-color.png': 'IC',
      'stacked-white.png': 'SW', 'stacked-color.png': 'SC',
      'symbol-color.png': 'SYM',
    }, {
      default: true,
      roles: {
        mark: { 'on-dark': 'inline-white.png', 'on-light': 'inline-color.png' },
        hero: { 'on-dark': 'stacked-white.png', 'on-light': 'stacked-color.png' },
        favicon: { any: 'symbol-color.png' },
      },
    });
    await createSlide({
      repoRoot: root, slug: 'roles', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '',
    });
    const dir = join(root, 'slides', 'roles');
    expect(existsSync(join(dir, 'assets', 'inline-white.png'))).toBe(true);
    expect(existsSync(join(dir, 'assets', 'stacked-color.png'))).toBe(true);
    expect(existsSync(join(dir, 'assets', 'symbol-color.png'))).toBe(true);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('class="logo-dark" src="./assets/inline-white.png"');           // mark
    expect(html).toContain('class="hero-mark logo-dark" src="./assets/stacked-white.png"');  // hero (dark)
    expect(html).toContain('class="hero-mark logo-light" src="./assets/stacked-color.png"'); // hero (light)
    expect(html).toContain('<link rel="icon" href="./assets/symbol-color.png">');            // favicon
  });

  it('leaves hero/favicon empty when those roles are absent (partial manifest)', async () => {
    writeFileSync(join(root, '_templates', 'index.html'), LOGO_INDEX);
    seedBrand('dxcare', { 'inline-white.png': 'IW', 'inline-color.png': 'IC' }, {
      default: true,
      roles: { mark: { 'on-dark': 'inline-white.png', 'on-light': 'inline-color.png' } },
    });
    await createSlide({
      repoRoot: root, slug: 'mark-only', title: 't', audience: '', audienceOrg: '',
      meetingDate: '2026-06-01', theme: 'corporate', coreMessage: '',
    });
    const html = readFileSync(join(root, 'slides', 'mark-only', 'index.html'), 'utf8');
    expect(html).toContain('class="logo-dark" src="./assets/inline-white.png"'); // mark present
    expect(html).not.toContain('hero-mark');                                     // no hero
    expect(html).not.toContain('rel="icon"');                                    // no favicon
  });
});
