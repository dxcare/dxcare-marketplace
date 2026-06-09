import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ThemeTokens {
  color?: Record<string, string>;
  font?: Record<string, string>;
  radius?: Record<string, string>;
  motion?: Record<string, string>;
}

export interface Theme {
  preset: string;
  tokens: ThemeTokens;
}

interface ThemeFile {
  preset: string;
  tokens?: ThemeTokens;
  overrides?: ThemeTokens;
}

const GROUP_ORDER: (keyof ThemeTokens)[] = ['color', 'font', 'radius', 'motion'];

// Per-group CSS variable prefix. The `color` group is UNPREFIXED so that
// `color.bg` → `--bg` — matching the convention in `_shared/css/base.css`
// and the diagram/component stylesheets. Other groups keep a prefix so
// `font.heading` → `--font-heading`, `radius.md` → `--radius-md`, etc.
const GROUP_PREFIX: Record<keyof ThemeTokens, string> = {
  color: '',
  font: 'font-',
  radius: 'radius-',
  motion: 'motion-',
};

function cssVarName(group: keyof ThemeTokens, key: string): string {
  return `--${GROUP_PREFIX[group]}${kebab(key)}`;
}

// Mirror of the tokens.css `--accent` fallback. A preset that omits an
// `accent` color key inherits this value through the cascade, so the derived
// tint/glow must use the SAME value to stay the same hue as the rendered
// border/text (which read `var(--accent)`). See tokens.css :root.
const ACCENT_FALLBACK = '#01baef';

// Alpha levels for the two accent-derived tints. These match the
// gold-standard fills the diagram set was generalized from and the historical
// hard-coded rgba() values they replace:
//   --accent-glow ............ 0.3   (box-shadow glow on flagged rows/steps)
//   --diagram-accent-tint .... 0.1   (highlighted-state FILL on .hot/.flag/.gain)
const ACCENT_GLOW_ALPHA = 0.3;
const ACCENT_TINT_ALPHA = 0.1;

/**
 * Parse a `#rgb` / `#rrggbb` hex string into an `{r,g,b}` triple. Returns null
 * for anything that is not a plain hex colour (e.g. an `rgba(...)` literal or a
 * CSS keyword) so callers can fall back gracefully.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Build an `rgba(r, g, b, a)` string from an accent value at a given alpha.
 *
 * - A hex accent (`#2997ff`) is converted component-wise so the tint shares the
 *   accent's exact hue — only the alpha differs. This is what fixes the
 *   cross-preset mismatch (preset-coloured border + fixed-blue fill).
 * - A non-hex accent (already `rgba(...)`, `hsl(...)`, keyword, …) cannot be
 *   safely re-alpha'd here, so we return null and the caller keeps any
 *   explicitly-authored token or the static fallback. html2canvas v1.4.1 still
 *   parses the resulting plain `rgba()` — we never emit `color-mix()`.
 */
function accentToRgba(accent: string, alpha: number): string | null {
  const rgb = hexToRgb(accent);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Render a Theme as a standalone CSS file: a `:root` block of custom
 * properties plus a `[data-theme="dark"]` block that swaps bg/fg tokens
 * to their *Dark counterparts when present.
 */
export function renderThemeCss(theme: Theme): string {
  const header =
    `/*\n` +
    ` * Generated from theme.json — do not edit by hand.\n` +
    ` * Regenerate via \`pnpm generate-theme --slug <slug>\` or the dxcare-slide:work theme intent.\n` +
    ` * Preset: ${theme.preset}\n` +
    ` */\n\n`;

  const color = theme.tokens.color ?? {};

  const lines: string[] = [':root {'];
  for (const group of GROUP_ORDER) {
    const bag = theme.tokens[group];
    if (!bag) continue;
    for (const [key, value] of Object.entries(bag)) {
      lines.push(`  ${cssVarName(group, key)}: ${value};`);
    }
  }
  // Accent-derived tints (B-004 cross-preset fix). The highlighted-state fill
  // (.hot/.flag/.gain) and the glow box-shadow must share the SAME hue as the
  // accent border/text, which read `var(--accent)`. We derive them from the
  // effective light accent — the preset's `accent` key, or the tokens.css
  // `--accent` fallback when the preset omits one — so every preset gets a
  // tint that matches its own accent instead of a fixed blue. Authors can
  // still override by shipping explicit `accentGlow` / `accentTint` tokens.
  const accentLight = color.accent ?? ACCENT_FALLBACK;
  if (color.accentGlow === undefined) {
    const glow = accentToRgba(accentLight, ACCENT_GLOW_ALPHA);
    if (glow) lines.push(`  --accent-glow: ${glow};`);
  }
  if (color.accentTint === undefined) {
    const tint = accentToRgba(accentLight, ACCENT_TINT_ALPHA);
    if (tint) lines.push(`  --diagram-accent-tint: ${tint};`);
  }
  lines.push('}');

  // Dark-mode block: for every key ending in "Dark", override the base-name
  // variable with the dark value inside a [data-theme="dark"] selector.
  const darkOverrides: string[] = [];
  for (const group of GROUP_ORDER) {
    const bag = theme.tokens[group];
    if (!bag) continue;
    for (const [key, value] of Object.entries(bag)) {
      if (!key.endsWith('Dark')) continue;
      const baseKey = key.slice(0, -'Dark'.length);
      if (bag[baseKey] === undefined) continue;
      darkOverrides.push(`  ${cssVarName(group, baseKey)}: ${value};`);
    }
  }
  // Re-derive the accent tints for dark mode when the preset overrides the
  // accent for dark (`accentDark`). If only `accent` is defined, the :root
  // tints already apply under both themes via the cascade.
  if (color.accentDark !== undefined) {
    if (color.accentGlowDark === undefined && color.accentGlow === undefined) {
      const glow = accentToRgba(color.accentDark, ACCENT_GLOW_ALPHA);
      if (glow) darkOverrides.push(`  --accent-glow: ${glow};`);
    }
    if (color.accentTintDark === undefined && color.accentTint === undefined) {
      const tint = accentToRgba(color.accentDark, ACCENT_TINT_ALPHA);
      if (tint) darkOverrides.push(`  --diagram-accent-tint: ${tint};`);
    }
  }
  if (darkOverrides.length > 0) {
    lines.push('', '[data-theme="dark"] {', ...darkOverrides, '}');
  }

  return header + lines.join('\n') + '\n';
}

/**
 * Load the effective theme for slides/<slug>/:
 *   1. Read slides/<slug>/theme.json
 *   2. If tokens is a full snapshot, use it directly
 *   3. Otherwise merge preset tokens + user overrides
 */
export function loadTheme(repoRoot: string, slug: string): Theme {
  const slidePath = join(repoRoot, 'slides', slug, 'theme.json');
  if (!existsSync(slidePath)) {
    throw new Error(`theme.json missing at slides/${slug}/theme.json`);
  }
  const slideTheme = JSON.parse(readFileSync(slidePath, 'utf8')) as ThemeFile;

  let base: ThemeTokens;
  if (slideTheme.tokens) {
    base = slideTheme.tokens;
  } else {
    const presetPath = join(repoRoot, '_templates', 'theme', `${slideTheme.preset}.json`);
    if (!existsSync(presetPath)) {
      throw new Error(`Unknown theme preset "${slideTheme.preset}" — expected file at _templates/theme/${slideTheme.preset}.json`);
    }
    const preset = JSON.parse(readFileSync(presetPath, 'utf8')) as ThemeFile;
    base = preset.tokens ?? {};
  }

  const tokens = mergeTokens(base, slideTheme.overrides);
  return { preset: slideTheme.preset, tokens };
}

/**
 * Merge + render + write slides/<slug>/theme.css. Returns the absolute path
 * of the written file.
 */
export function writeThemeCss(repoRoot: string, slug: string): string {
  const theme = loadTheme(repoRoot, slug);
  const css = renderThemeCss(theme);
  const outPath = join(repoRoot, 'slides', slug, 'theme.css');
  writeFileSync(outPath, css);
  return outPath;
}

function mergeTokens(base: ThemeTokens, overrides?: ThemeTokens): ThemeTokens {
  if (!overrides) return base;
  const out: ThemeTokens = {};
  for (const group of GROUP_ORDER) {
    const baseBag = base[group];
    const overrideBag = overrides[group];
    if (!baseBag && !overrideBag) continue;
    out[group] = { ...(baseBag ?? {}), ...(overrideBag ?? {}) };
  }
  return out;
}

function kebab(camelCase: string): string {
  return camelCase.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
