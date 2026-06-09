#!/usr/bin/env node
// dxcare-web-slide:init executable. Bootstraps a target directory into a
// DXCare-slide-compatible repo by copying bundled templates and merging
// package.json snippets.
//
// Usage:
//   node <plugin>/bin/init.mjs [target-dir] [--force] [--migrate-config]
//     target-dir:       defaults to process.cwd()
//     --force:          allow init even if slides/ already contains slide dirs
//     --migrate-config: opt-in — overwrite known-stale config files (e.g.
//                       next.config.js missing trailingSlash) with the
//                       recommended template version, backing up the original.
//     --dry-run:        report what would change without writing
//
// Exports the pure helpers `runInit` and `mergePackageJson` (plus
// `InitConflictError`) for unit tests.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class InitConflictError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'InitConflictError';
    this.detail = detail;
  }
}

/**
 * Bootstrap `target` into a dxcare-web-slide-compatible repo.
 *
 * @param {object} opts
 * @param {string} opts.target      — absolute path to target directory (default cwd)
 * @param {string} opts.pluginRoot  — absolute path to the plugin directory (has templates/)
 * @param {boolean} [opts.force]    — allow init on a directory with existing slides/ AND overwrite
 *                                    template-owned files that differ by content (keeps a backup)
 * @param {boolean} [opts.dryRun]   — report what would change without writing
 * @param {boolean} [opts.migrateConfig] — opt-in: overwrite known-stale config files
 *                                    (e.g. next.config.js missing trailingSlash) with the
 *                                    recommended template version, backing up the original.
 *                                    Default false — config is otherwise always preserved.
 * @returns {Promise<{ copied: string[], overwritten: object[], preserved: object[], staleConfig: object[], migratedConfig: string[], packageMerge: object, dryRun: boolean }>}
 */
export async function runInit({ target, pluginRoot, force = false, dryRun = false, migrateConfig = false }) {
  const root = resolve(target);
  const templates = join(pluginRoot, 'templates');
  const repoTemplates = join(templates, 'repo');

  if (!existsSync(repoTemplates)) {
    throw new Error(`Plugin templates missing at ${repoTemplates} — has the plugin been built?`);
  }

  // Conflict check: reject if slides/ contains real slide directories
  const slidesDir = join(root, 'slides');
  if (existsSync(slidesDir) && !force) {
    const entries = readdirSync(slidesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    if (entries.length > 0) {
      throw new InitConflictError(
        `Target ${root} already has slides/ with ${entries.length} subdirectories. Re-run with force=true to overlay templates anyway.`,
        { existing: entries.map((e) => e.name) },
      );
    }
  }

  const copied = [];
  /** @type {{path: string, srcHash: string, dstHash: string}[]} */
  const overwritten = [];
  /** @type {{path: string, reason: string}[]} */
  const preserved = [];
  /** @type {{path: string, issue: string, hint: string}[]} */
  const staleConfig = [];
  /** @type {string[]} */
  const migratedConfig = [];

  // Copy tree-style directories with per-file content-diff. Destination-only
  // files are preserved (classic cpSync behavior). Same-named files with
  // identical content are a no-op. Same-named files with DIFFERENT content
  // are either: (a) overwritten + backed up (when `force`), or (b) left alone
  // with a `preserved` warning (default). This guards user customizations
  // against silent clobbering.
  for (const dir of ['_templates', '_shared', 'app', 'lib', 'scripts', 'docs', 'brand-assets']) {
    const src = join(repoTemplates, dir);
    if (!existsSync(src)) continue;
    walkAndCopy(src, join(root, dir), { force, dryRun, root, copied, overwritten, preserved });
    copied.push(`${dir}/`);
  }

  // Copy config files into the repo root. Do NOT overwrite existing ones —
  // consumer may have already customized next.config.js / tsconfig.json.
  const configDir = join(repoTemplates, 'config');
  if (existsSync(configDir)) {
    for (const entry of readdirSync(configDir)) {
      const src = join(configDir, entry);
      const dst = join(root, entry);
      if (existsSync(dst)) {
        // B-012: a preserved config can be a SILENT gap — an older consumer's
        // file may lack a fix shipped in the current template. We never
        // overwrite by default (data-loss risk), but we diff for known-stale
        // markers and warn so the user can opt in via --migrate-config.
        const before = staleConfig.length;
        detectStaleConfig(entry, dst, src, staleConfig);
        const isStale = staleConfig.length > before;
        if (isStale && migrateConfig) {
          // Explicit opt-in: back up the consumer's file then adopt the
          // recommended template version. Backup reuses the --force scheme.
          if (!dryRun) {
            const backupPath = join(root, '.dxcare-slide-backup', entry);
            mkdirSync(dirname(backupPath), { recursive: true });
            cpSync(dst, backupPath);
            cpSync(src, dst);
          }
          migratedConfig.push(entry);
        } else {
          preserved.push({ path: entry, reason: 'config file already present' });
        }
        continue;
      }
      if (!dryRun) cpSync(src, dst);
      copied.push(entry);
    }
  }

  // Ensure slides/ exists (empty placeholder)
  if (!existsSync(slidesDir)) {
    if (!dryRun) {
      mkdirSync(slidesDir);
      writeFileSync(join(slidesDir, '.gitkeep'), '');
    }
    copied.push('slides/.gitkeep');
  }

  // Ship a scaffold .gitignore (dot-file, lives outside templates/repo/ so
  // the Strategy sync script doesn't nuke it). Only created when the target
  // lacks its own .gitignore — we never overwrite the consumer's ignore file.
  const scaffoldGitignore = join(templates, 'scaffold-gitignore');
  const dstGitignore = join(root, '.gitignore');
  if (existsSync(scaffoldGitignore) && !existsSync(dstGitignore)) {
    if (!dryRun) cpSync(scaffoldGitignore, dstGitignore);
    copied.push('.gitignore');
  }

  // Merge package.json
  const snippetPath = join(templates, 'package-snippet.json');
  const snippet = JSON.parse(readFileSync(snippetPath, 'utf8'));
  const pkgPath = join(root, 'package.json');
  const existing = existsSync(pkgPath)
    ? JSON.parse(readFileSync(pkgPath, 'utf8'))
    : {};
  const merged = mergePackageJson(existing, snippet);
  if (!dryRun) {
    writeFileSync(pkgPath, JSON.stringify(stripInternals(merged), null, 2) + '\n');
  }
  copied.push('package.json');

  return { copied, overwritten, preserved, staleConfig, migratedConfig, packageMerge: merged, dryRun };
}

/**
 * B-012: detect known-stale markers in a preserved consumer config file.
 *
 * Non-destructive: reads-only, never writes. Pushes a warning onto `out` when
 * the consumer's file is missing a fix that the current template ships. The
 * checks are intentionally conservative (string/regex on the source) so a
 * heavily-customized consumer file is not falsely flagged.
 *
 * @param {string} name     — config filename (e.g. "next.config.js")
 * @param {string} dstPath  — consumer's existing file
 * @param {string} srcPath  — template's version (recommended baseline)
 * @param {{path: string, issue: string, hint: string}[]} out
 */
function detectStaleConfig(name, dstPath, srcPath, out) {
  if (name !== 'next.config.js') return;
  let consumer;
  try {
    consumer = readFileSync(dstPath, 'utf8');
  } catch {
    return;
  }
  // The template recommends `trailingSlash: true`; without it Next.js
  // 308-redirects away the slash and breaks relative asset links inside slides.
  const templateWantsTrailingSlash = /trailingSlash\s*:\s*true/.test(readFileSafe(srcPath));
  if (!templateWantsTrailingSlash) return;
  const consumerHasTrailingSlashTrue = /trailingSlash\s*:\s*true/.test(consumer);
  if (!consumerHasTrailingSlashTrue) {
    const explicitlyFalse = /trailingSlash\s*:\s*false/.test(consumer);
    out.push({
      path: name,
      issue: explicitlyFalse
        ? 'trailingSlash is set to false (template recommends true)'
        : 'trailingSlash is missing (template recommends true)',
      hint: 'Older config detected — relative slide asset links may break. See MIGRATION.md or re-run with --migrate-config to adopt the recommended next.config.js.',
    });
  }
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

/**
 * Recursive copy with content-hash diff. See runInit for semantics.
 */
function walkAndCopy(srcDir, dstDir, ctx) {
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const dstPath = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      if (!ctx.dryRun) mkdirSync(dstPath, { recursive: true });
      walkAndCopy(srcPath, dstPath, ctx);
      continue;
    }
    const rel = relative(ctx.root, dstPath);
    if (!existsSync(dstPath)) {
      if (!ctx.dryRun) {
        mkdirSync(dirname(dstPath), { recursive: true });
        cpSync(srcPath, dstPath);
      }
      continue;
    }
    const srcHash = hashFile(srcPath);
    const dstHash = hashFile(dstPath);
    if (srcHash === dstHash) continue; // no-op, identical content
    if (!ctx.force) {
      ctx.preserved.push({ path: rel, reason: 'existing file differs from template; use --force to overwrite' });
      continue;
    }
    // force mode: backup then overwrite
    if (!ctx.dryRun) {
      const backupDir = join(ctx.root, '.dxcare-slide-backup');
      const backupPath = join(backupDir, rel);
      mkdirSync(dirname(backupPath), { recursive: true });
      cpSync(dstPath, backupPath);
      cpSync(srcPath, dstPath);
    }
    ctx.overwritten.push({ path: rel, srcHash, dstHash });
  }
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// The three package.json fields that all declare installable packages. A
// package name is unique across the union of these — npm/pnpm reject the same
// name appearing in more than one of them. Cross-section dedupe walks this set.
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/**
 * Non-destructive merge of `snippet` into `existing` package.json data.
 * - Existing keys survive; snippet keys fill in gaps only.
 * - Merge conflicts (same key, different values) are collected on `__conflicts__`.
 * - Cross-section dedupe (B-011): a snippet package is skipped entirely if the
 *   consumer already declares that package name in ANY dependency-type field —
 *   e.g. snippet `optionalDependencies.officeparser` is NOT re-added when the
 *   consumer already has `dependencies.officeparser`. This is generalized to
 *   every package name (no hardcoding) and never moves the consumer's existing
 *   entry. The consumer's chosen section/version is authoritative.
 * - The `_comment` field from the snippet is always stripped.
 */
export function mergePackageJson(existing, snippet) {
  const out = { ...existing };
  const conflicts = [...(existing.__conflicts__ ?? [])];

  // Index every package name the consumer already declares, regardless of which
  // dependency-type field it lives in, mapping name → the field that owns it.
  // Built from `existing` (frozen) so dedupe is stable across the merge loop.
  const ownedBy = new Map();
  for (const field of DEP_FIELDS) {
    const bag = existing[field];
    if (!bag || typeof bag !== 'object') continue;
    for (const name of Object.keys(bag)) {
      if (!ownedBy.has(name)) ownedBy.set(name, field);
    }
  }

  const mergeField = (field) => {
    const src = snippet[field];
    if (!src || typeof src !== 'object') return;
    const current = out[field] ?? {};
    const isDepField = DEP_FIELDS.includes(field);
    for (const [key, value] of Object.entries(src)) {
      if (isDepField) {
        const owner = ownedBy.get(key);
        if (owner !== undefined && owner !== field) {
          // Package already lives in a DIFFERENT dependency section. Skip so we
          // never create a cross-section duplicate. Surface a conflict only if
          // the version string differs, so the user can reconcile if they want.
          const ownerVersion = (existing[owner] ?? {})[key];
          if (ownerVersion !== value) {
            conflicts.push({ field, key, existing: ownerVersion, theirs: value, ownerField: owner });
          }
          continue;
        }
      }
      if (current[key] === undefined) {
        current[key] = value;
      } else if (current[key] !== value) {
        conflicts.push({ field, key, existing: current[key], theirs: value });
      }
    }
    out[field] = current;
  };

  mergeField('scripts');
  for (const field of DEP_FIELDS) mergeField(field);

  if (snippet.type && !out.type) out.type = snippet.type;

  if (conflicts.length > 0) out.__conflicts__ = conflicts;
  return out;
}

function stripInternals(pkg) {
  const { __conflicts__, _comment, ...clean } = pkg;
  return clean;
}

// CLI entry
const __filename = fileURLToPath(import.meta.url);
// argv[1] may carry a symlinked path (e.g. macOS /tmp → /private/tmp or npx
// shims) that differs from the realpath import.meta.url resolves to. Compare
// canonical paths so the CLI entry fires in all install layouts.
const argv1Real = process.argv[1] ? safeRealpath(process.argv[1]) : '';
if (argv1Real === __filename) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const migrateConfig = args.includes('--migrate-config');
  const positional = args.filter((a) => !a.startsWith('--'));
  const target = positional[0] ? resolve(positional[0]) : process.cwd();
  const pluginRoot = join(dirname(__filename), '..');

  runInit({ target, pluginRoot, force, dryRun, migrateConfig })
    .then((r) => {
      console.log(JSON.stringify({
        target,
        dryRun: r.dryRun,
        copied: r.copied,
        overwritten: r.overwritten,
        preserved: r.preserved,
        staleConfig: r.staleConfig,
        migratedConfig: r.migratedConfig,
        conflicts: r.packageMerge.__conflicts__ ?? [],
      }, null, 2));
      // B-012: surface stale-config warnings prominently on stderr so an older
      // consumer notices the silent gap even when piping stdout JSON.
      if (r.staleConfig?.length) {
        for (const s of r.staleConfig) {
          console.error(`[dxcare-web-slide:init] WARN stale config ${s.path}: ${s.issue}\n  ${s.hint}`);
        }
      }
      if (r.packageMerge.__conflicts__?.length) process.exit(7);
    })
    .catch((e) => {
      console.error(`[dxcare-web-slide:init] ${e.name}: ${e.message}`);
      if (e.detail) console.error(JSON.stringify(e.detail, null, 2));
      process.exit(e instanceof InitConflictError ? 2 : 1);
    });
}

function safeRealpath(p) {
  try { return realpathSync(p); } catch { return p; }
}

// Silence unused-variable lint warning
void statSync;
