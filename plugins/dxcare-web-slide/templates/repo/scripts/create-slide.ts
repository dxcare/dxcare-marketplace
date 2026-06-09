#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReserved } from './lib/slug-generator.js';
import { writeThemeCss } from './lib/theme-css.js';

export interface CreateSlideInput {
  repoRoot: string;
  slug: string;
  title: string;
  audience: string;
  audienceOrg: string;
  meetingDate: string; // YYYY-MM-DD or empty
  theme: string;       // corporate | warm | minimal
  coreMessage: string;
  /** Brand folder under brand-assets/ to pull the corner logo from. Empty =>
   *  the brand flagged "default": true (if any). "none" => no logo. */
  brand?: string;
}

export interface CreateSlideResult {
  slug: string;
  dir: string;
  createdFiles: string[];
}

function substitute(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => vars[k] ?? '');
}

const LOGO_EXTS = ['svg', 'png', 'webp', 'jpg', 'jpeg'];

/** brand.json "roles" map: role -> { on-dark, on-light, any } file names. */
type BrandRoles = Record<string, { 'on-dark'?: string; 'on-light'?: string; any?: string }>;

/** Read brand.json "roles" if present and well-formed, else null. */
function readBrandRoles(brandDir: string): BrandRoles | null {
  const p = join(brandDir, 'brand.json');
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return m && m.roles && typeof m.roles === 'object' ? (m.roles as BrandRoles) : null;
  } catch {
    return null;
  }
}

/** Flat-convention fallback: logo-on-<side>.<ext> basename (svg-first), or null. */
function flatLogoFile(brandDir: string, side: 'dark' | 'light'): string | null {
  for (const ext of LOGO_EXTS) {
    if (existsSync(join(brandDir, `logo-on-${side}.${ext}`))) return `logo-on-${side}.${ext}`;
  }
  return null;
}

/** Build the cover hero <img> markup from resolved deck-relative srcs. */
function heroImgs(dark: string, light: string): string {
  const tag = (src: string, cls: string) =>
    src ? `<img class="hero-mark ${cls}" src="${src}" alt="" aria-hidden="true" onerror="this.remove()">` : '';
  return [tag(dark, 'logo-dark'), tag(light, 'logo-light')].filter(Boolean).join('\n        ');
}

/** Resolve which brand folder to use. Explicit name wins (if it exists);
 *  empty => the brand whose brand.json has "default": true; "none" => no brand.
 *  Returns the brand folder name, or null when no brand should apply. */
function resolveBrandName(repoRoot: string, brand: string | undefined): string | null {
  if (brand === 'none') return null;
  const libDir = join(repoRoot, 'brand-assets');
  if (!existsSync(libDir)) return null;
  if (brand && brand.trim()) {
    return existsSync(join(libDir, brand)) ? brand : null;
  }
  for (const name of readdirSync(libDir)) {
    const metaPath = join(libDir, name, 'brand.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (meta && meta.default === true) return name;
    } catch {
      // malformed brand.json — skip, don't let it abort scaffolding
    }
  }
  return null;
}

export async function createSlide(input: CreateSlideInput): Promise<CreateSlideResult> {
  const { repoRoot, slug, title, audience, audienceOrg, meetingDate, theme, coreMessage, brand } = input;
  if (isReserved(slug)) throw new Error(`slug "${slug}" is reserved`);
  const dir = join(repoRoot, 'slides', slug);
  if (existsSync(dir)) throw new Error(`slides/${slug} already exists`);

  const templatesDir = join(repoRoot, '_templates');
  if (!existsSync(templatesDir)) throw new Error(`_templates/ missing at ${templatesDir}`);

  mkdirSync(join(dir, 'references'), { recursive: true });
  mkdirSync(join(dir, 'milestones'), { recursive: true });

  const createdFiles: string[] = [];
  const write = (rel: string, content: string) => {
    const p = join(dir, rel);
    writeFileSync(p, content);
    createdFiles.push(`slides/${slug}/${rel}`);
  };

  // Brand assets by role. Copy the chosen brand's role files into the deck's
  // own assets/ (self-contained for deploy flatten). brand.json may declare
  // roles {mark, hero, favicon}; a brand without roles falls back to the flat
  // logo-on-{dark,light} convention for the corner mark. A role with no source
  // file leaves that slot empty (index.html drops it gracefully — B-004).
  //   mark    → corner watermark (.logo-dark/.logo-light, theme-swapped)
  //   hero    → cover-slide logo (.hero-mark, theme-swapped)
  //   favicon → browser-tab icon (<link rel="icon">, single)
  let LOGO_DARK = '';
  let LOGO_LIGHT = '';
  let HERO_BLOCK = '';
  let FAVICON_LINK = '';
  const brandName = resolveBrandName(repoRoot, brand);
  if (brandName) {
    const brandDir = join(repoRoot, 'brand-assets', brandName);
    const copied = new Set<string>();
    // Copy brand file `name` into the deck assets/ once; return its deck-relative
    // src (or '' if the source file is absent).
    const useAsset = (name: string | undefined | null): string => {
      if (!name) return '';
      const src = join(brandDir, name);
      if (!existsSync(src)) return '';
      mkdirSync(join(dir, 'assets'), { recursive: true });
      if (!copied.has(name)) {
        copyFileSync(src, join(dir, 'assets', name));
        createdFiles.push(`slides/${slug}/assets/${name}`);
        copied.add(name);
      }
      return `./assets/${name}`;
    };

    const roles = readBrandRoles(brandDir);
    if (roles) {
      LOGO_DARK = useAsset(roles.mark?.['on-dark']);
      LOGO_LIGHT = useAsset(roles.mark?.['on-light']);
      HERO_BLOCK = heroImgs(useAsset(roles.hero?.['on-dark']), useAsset(roles.hero?.['on-light']));
      const fav = useAsset(roles.favicon?.any ?? roles.favicon?.['on-light'] ?? roles.favicon?.['on-dark']);
      FAVICON_LINK = fav ? `<link rel="icon" href="${fav}">` : '';
    } else {
      // Flat convention (mark only): logo-on-dark.* / logo-on-light.*
      LOGO_DARK = useAsset(flatLogoFile(brandDir, 'dark'));
      LOGO_LIGHT = useAsset(flatLogoFile(brandDir, 'light'));
    }
  }

  const vars = {
    TITLE: title,
    SLUG: slug,
    AUDIENCE: audience,
    AUDIENCE_ORG: audienceOrg,
    MEETING_DATE: meetingDate,
    CORE_MESSAGE: coreMessage,
    SUBTITLE: audience ? `for ${audience}` : '',
    THEME: theme,
    LOGO_DARK,
    LOGO_LIGHT,
    HERO_BLOCK,
    FAVICON_LINK,
  };

  write('skeleton.md', substitute(readFileSync(join(templatesDir, 'skeleton.md'), 'utf8'), vars));
  write('meta.json', substitute(readFileSync(join(templatesDir, 'meta.json'), 'utf8'), vars));
  write('index.html', substitute(readFileSync(join(templatesDir, 'index.html'), 'utf8'), vars));

  const themePath = join(templatesDir, 'theme', `${theme}.json`);
  if (!existsSync(themePath)) throw new Error(`theme preset "${theme}" not found at ${themePath}`);
  copyFileSync(themePath, join(dir, 'theme.json'));
  createdFiles.push(`slides/${slug}/theme.json`);

  // Generate the initial theme.css from the just-copied theme.json.
  // Wrapped in try so a theme-preset edge case doesn't abort scaffolding.
  try {
    writeThemeCss(repoRoot, slug);
    createdFiles.push(`slides/${slug}/theme.css`);
  } catch {
    // theme.css is regenerable via `pnpm generate-theme --slug <slug>`; skip
  }

  const claudeMd = `# ${title}\n\n- **Audience:** ${audience}${audienceOrg ? ` (${audienceOrg})` : ''}\n- **Meeting date:** ${meetingDate || 'TBD'}\n- **Theme preset:** ${theme}\n- **Core message:** ${coreMessage || '(not set)'}\n\n## Authoring rule — D2 bound stage (REQUIRED on every slide)\n\nThis deck is hand-authored in \`index.html\`; \`skeleton.md\` is a planning outline only (no auto-render). Wrap **every** slide's body in \`<div class="slide-content">\`:\n\n\`\`\`html\n<section class="slide" data-slide="N" aria-labelledby="sN-title">\n  <div class="slide-content">\n    <h2 id="sN-title">Heading</h2>\n    <p>Body…</p>\n  </div>\n</section>\n\`\`\`\n\nThe \`.slide-content\` wrapper is the bound stage: \`base.css\` caps it to a centered max-width column and scopes the entry-reveal stagger to \`.slide-content > *\`. Omit it and the slide pins content to the left edge and never plays the reveal. Applies to all slides, not just the title. (Rich self-contained decks may instead use \`class="slide slide-content"\`; skeleton decks linking \`/_shared/css/base.css\` must use the nested \`<div>\` form — see \`docs/RICH-DECKS.md\`.)\n\n## Notes\n\n_Add project-specific guidance here (tone, taboos, data sources)._\n`;
  write('CLAUDE.md', claudeMd);

  return { slug, dir, createdFiles };
}

// CLI entry — compare realpath(argv[1]) to handle macOS /tmp → /private/tmp
// and other symlink-shimmed invocations (pnpm, tsx, npm-link).
const __filename = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })() : '';
if (__argv1 === __filename) {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce<string[][]>((acc, v, i, a) => {
      if (v.startsWith('--')) acc.push([v.slice(2), a[i + 1] ?? '']);
      return acc;
    }, [])
  );
  const repoRoot = join(dirname(__filename), '..');
  createSlide({
    repoRoot,
    slug: args.slug ?? '',
    title: args.title ?? '',
    audience: args.audience ?? '',
    audienceOrg: args['audience-org'] ?? '',
    meetingDate: args['meeting-date'] ?? '',
    theme: args.theme ?? 'corporate',
    coreMessage: args['core-message'] ?? '',
    brand: args.brand ?? '',
  })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); })
    .catch((e) => { console.error(e.message); process.exit(2); });
}
