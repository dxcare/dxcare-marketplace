import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * B-006 — tokens.css ↔ base.css completeness regression.
 *
 * Two failure modes this guards against:
 *
 *  1. base.css references `var(--X)` for a token that tokens.css forgot to
 *     define → the property silently resolves to nothing (no fallback in the
 *     var() call), breaking layout/typography for EVERY deck.
 *
 *  2. B-010 regression: tokens.css defines var()-INDIRECT aliases in :root
 *     (`--card-bg: var(--bg-secondary)`, `--text-primary: var(--fg)`,
 *     `--bg-primary: var(--bg)`, and diagrams.css `--diagram-card-bg:
 *     var(--bg-secondary)`). Because `data-theme` lives on <body> but :root is
 *     <html>, those :root copies stay pinned to the LIGHT values unless they
 *     are RE-DECLARED inside `[data-theme="dark"]`. Drop a re-declaration and
 *     dark decks render cards/diagram boxes light-on-light (invisible text).
 *
 * Parsing is deliberately regex/string based — the inputs are our own
 * hand-authored token sheets, not arbitrary CSS, so a full parser is overkill.
 */

const CSS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '_shared', 'css');

function readCss(name: string): string {
  return readFileSync(join(CSS_DIR, name), 'utf8');
}

/** Every distinct custom property NAME referenced via `var(--X)` in `css`. */
function varRefs(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) out.add(m[1]);
  return out;
}

/**
 * Extract the body of a top-level rule whose selector starts with `selector`.
 * Returns the concatenation of all matching blocks (a sheet may declare the
 * same selector more than once). Brace-naive on purpose — token sheets have no
 * nested blocks inside these rules.
 */
function ruleBody(css: string, selector: string): string {
  let body = '';
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) break;
    const open = css.indexOf('{', at);
    const close = css.indexOf('}', open);
    if (open === -1 || close === -1) break;
    body += css.slice(open + 1, close) + '\n';
    from = close + 1;
  }
  return body;
}

/** Custom property NAMES *defined* (declared with a value) inside a rule body. */
function definedProps(ruleCss: string): Set<string> {
  const out = new Set<string>();
  for (const m of ruleCss.matchAll(/(--[a-z0-9-]+)\s*:/gi)) out.add(m[1]);
  return out;
}

/** Names whose declared value is an INDIRECT `var(--other)` reference. */
function varIndirectProps(ruleCss: string): Set<string> {
  const out = new Set<string>();
  for (const m of ruleCss.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(/gi)) out.add(m[1]);
  return out;
}

describe('B-006 — tokens.css defines every var() referenced by base.css', () => {
  const tokensRoot = definedProps(ruleBody(readCss('tokens.css'), ':root'));
  const baseRefs = varRefs(readCss('base.css'));

  it('has a :root definition for every --token base.css consumes', () => {
    const missing = [...baseRefs].filter((name) => !tokensRoot.has(name));
    expect(missing, `tokens.css :root is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('sanity-checks a handful of core tokens are present', () => {
    // Guards the parser itself: if `tokensRoot` ever came back empty the test
    // above would also pass vacuously.
    for (const t of ['--bg', '--fg', '--primary', '--accent', '--font-body', '--radius-md']) {
      expect(tokensRoot.has(t), `expected tokens.css :root to define ${t}`).toBe(true);
    }
  });
});

describe('B-006 / B-010 — var()-indirect aliases are re-declared under [data-theme="dark"]', () => {
  it('every var()-indirect :root alias in tokens.css is re-declared in its dark block', () => {
    const css = readCss('tokens.css');
    const rootIndirect = varIndirectProps(ruleBody(css, ':root'));
    const darkDefined = definedProps(ruleBody(css, '[data-theme="dark"]'));

    // The B-010 fix specifically targets the bg/fg-derived aliases. Theme-
    // invariant indirections (e.g. --duration-normal, --font-display) need NOT
    // be re-declared because the value they point at never changes per theme.
    const themeSensitive = new Set(['--card-bg', '--text-primary', '--text-secondary', '--bg-primary']);
    const mustRedeclare = [...rootIndirect].filter((n) => themeSensitive.has(n));

    // The four aliases B-006/B-010 name explicitly must actually exist in :root
    // as indirections — otherwise this guard would silently check nothing.
    for (const n of ['--card-bg', '--text-primary', '--bg-primary']) {
      expect(rootIndirect.has(n), `expected ${n} to be a var()-indirect alias in tokens.css :root`).toBe(true);
    }

    const missing = mustRedeclare.filter((n) => !darkDefined.has(n));
    expect(
      missing,
      `[data-theme="dark"] in tokens.css must re-declare: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('--diagram-card-bg (diagrams.css) is re-declared under [data-theme="dark"]', () => {
    const css = readCss('diagrams.css');
    const rootIndirect = varIndirectProps(ruleBody(css, ':root'));
    const darkDefined = definedProps(ruleBody(css, '[data-theme="dark"]'));
    expect(
      rootIndirect.has('--diagram-card-bg'),
      'expected --diagram-card-bg to be a var()-indirect alias in diagrams.css :root',
    ).toBe(true);
    expect(
      darkDefined.has('--diagram-card-bg'),
      '[data-theme="dark"] in diagrams.css must re-declare --diagram-card-bg (B-010)',
    ).toBe(true);
  });
});
