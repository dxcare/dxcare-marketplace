import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInit, mergePackageJson, InitConflictError } from '../../bin/init.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');   // plugins/dxcare-web-slide/

let target;

beforeEach(() => {
  target = realpathSync(mkdtempSync(join(tmpdir(), 'dxcare-web-slide-init-')));
});

afterEach(() => {
  rmSync(target, { recursive: true, force: true });
});

describe('runInit (fresh target)', () => {
  it('creates slides/, _shared/, _templates/, scripts/, config files', async () => {
    await runInit({ target, pluginRoot, force: false });

    // Marker directories
    expect(isDir(join(target, 'slides'))).toBe(true);
    expect(isDir(join(target, '_shared'))).toBe(true);
    expect(isDir(join(target, '_templates'))).toBe(true);
    expect(isDir(join(target, 'scripts'))).toBe(true);
    expect(isDir(join(target, 'scripts', 'lib'))).toBe(true);

    // Key files present
    expect(isFile(join(target, '_templates', 'skeleton.md'))).toBe(true);
    expect(isFile(join(target, '_templates', 'theme', 'corporate.json'))).toBe(true);
    expect(isFile(join(target, '_shared', 'js', 'slide-core.js'))).toBe(true);
    expect(isFile(join(target, 'scripts', 'create-slide.ts'))).toBe(true);
    expect(isFile(join(target, 'scripts', 'lib', 'project-root.ts'))).toBe(true);

    // Config files
    expect(isFile(join(target, 'next.config.js'))).toBe(true);
    expect(isFile(join(target, 'vercel.json'))).toBe(true);
    expect(isFile(join(target, 'tsconfig.json'))).toBe(true);
  });

  it('creates a new package.json from snippet when target has none', async () => {
    await runInit({ target, pluginRoot, force: false });
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    expect(pkg.scripts.deploy).toBe('tsx scripts/deploy.ts');
    expect(pkg.scripts['create-slide']).toBe('tsx scripts/create-slide.ts');
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.devDependencies.vitest).toBeDefined();
    expect(pkg.type).toBe('module');
  });
});

describe('runInit (existing repo)', () => {
  it('refuses to overwrite existing slides/ without force', async () => {
    writeFileSync(join(target, 'placeholder'), '');
    mkdirSync(join(target, 'slides', 'existing'), { recursive: true });
    await expect(runInit({ target, pluginRoot, force: false })).rejects.toThrow(InitConflictError);
  });

  it('proceeds with force=true even if slides/ exists', async () => {
    mkdirSync(join(target, 'slides'), { recursive: true });
    await runInit({ target, pluginRoot, force: true });
    expect(isDir(join(target, '_shared'))).toBe(true);
  });

  it('preserves existing _shared/custom file (non-destructive copy)', async () => {
    mkdirSync(join(target, '_shared'), { recursive: true });
    writeFileSync(join(target, '_shared', 'custom.css'), '/* user local */');
    await runInit({ target, pluginRoot, force: true });
    // User file should survive the merge
    expect(readFileSync(join(target, '_shared', 'custom.css'), 'utf8')).toBe('/* user local */');
    // New template files should also be present
    expect(isFile(join(target, '_shared', 'js', 'slide-core.js'))).toBe(true);
  });

  it('WITHOUT force: preserves user-customized file that collides with a template file', async () => {
    // Plant a modified copy of slide-core.js BEFORE init
    const slideCorePath = join(target, '_shared', 'js', 'slide-core.js');
    mkdirSync(dirname(slideCorePath), { recursive: true });
    writeFileSync(slideCorePath, '/* CUSTOMIZED BY USER — do not overwrite */');
    const r = await runInit({ target, pluginRoot, force: false });
    expect(readFileSync(slideCorePath, 'utf8')).toBe('/* CUSTOMIZED BY USER — do not overwrite */');
    // And the preserved list should name the file
    const preservedPaths = r.preserved.map((p) => p.path);
    expect(preservedPaths.some((p) => p.endsWith('slide-core.js'))).toBe(true);
  });

  it('WITH force: backs up then overwrites user-customized file', async () => {
    const slideCorePath = join(target, '_shared', 'js', 'slide-core.js');
    mkdirSync(dirname(slideCorePath), { recursive: true });
    const userContent = '/* CUSTOMIZED BY USER */';
    writeFileSync(slideCorePath, userContent);
    const r = await runInit({ target, pluginRoot, force: true });
    // File now matches template, not user content
    expect(readFileSync(slideCorePath, 'utf8')).not.toBe(userContent);
    // Backup lives at .dxcare-slide-backup/_shared/js/slide-core.js and matches user content
    const backupPath = join(target, '.dxcare-slide-backup', '_shared', 'js', 'slide-core.js');
    expect(isFile(backupPath)).toBe(true);
    expect(readFileSync(backupPath, 'utf8')).toBe(userContent);
    // overwritten list contains the file
    expect(r.overwritten.map((o) => o.path).some((p) => p.endsWith('slide-core.js'))).toBe(true);
  });

  it('dryRun=true reports changes without writing anything', async () => {
    const r = await runInit({ target, pluginRoot, force: false, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.copied.length).toBeGreaterThan(0);
    // Nothing actually written
    expect(isFile(join(target, '_shared', 'js', 'slide-core.js'))).toBe(false);
    expect(isFile(join(target, 'package.json'))).toBe(false);
  });

  it('ships a .gitignore that includes .dxcare-slide-backup/', async () => {
    await runInit({ target, pluginRoot, force: false });
    const gitignorePath = join(target, '.gitignore');
    expect(isFile(gitignorePath)).toBe(true);
    const contents = readFileSync(gitignorePath, 'utf8');
    expect(contents).toContain('.dxcare-slide-backup/');
    expect(contents).toContain('node_modules/');
    expect(contents).toContain('.next/');
  });

  it('respects an existing consumer .gitignore (does not overwrite)', async () => {
    writeFileSync(join(target, '.gitignore'), '# user curated\nmy-secrets/\n');
    await runInit({ target, pluginRoot, force: false });
    expect(readFileSync(join(target, '.gitignore'), 'utf8')).toBe('# user curated\nmy-secrets/\n');
  });
});

describe('CLI entry guard (symlink robustness)', () => {
  // Regression test: macOS's /tmp is a symlink to /private/tmp. When a user
  // runs `node /tmp/.../bin/init.mjs`, process.argv[1] carries the /tmp form
  // while fileURLToPath(import.meta.url) canonicalizes to /private/tmp. The
  // early equality check was dropping the CLI body silently.
  it('fires the CLI body when invoked through a symlinked path', async () => {
    const { spawnSync } = await import('node:child_process');
    const binPath = join(pluginRoot, 'bin', 'init.mjs');
    // Spawn with --dry-run in an empty tmp target so the script does no disk writes
    const out = spawnSync('node', [binPath, target, '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, DXCARE_SLIDE_SKIP_REALPATH: '' },
    });
    expect(out.status).toBe(0);
    // If the guard misfires the CLI body runs to completion and prints JSON.
    expect(out.stdout).toMatch(/"dryRun":\s*true/);
    expect(out.stdout).toMatch(/"copied":/);
  });
});

describe('mergePackageJson', () => {
  it('merges new scripts into existing package.json', () => {
    const existing = {
      name: 'my-app',
      scripts: { lint: 'eslint .' },
      dependencies: { react: '18.0.0' },
    };
    const snippet = {
      scripts: { deploy: 'tsx scripts/deploy.ts' },
      dependencies: { next: '^15.0.0' },
    };
    const merged = mergePackageJson(existing, snippet);
    expect(merged.name).toBe('my-app');
    expect(merged.scripts.lint).toBe('eslint .');
    expect(merged.scripts.deploy).toBe('tsx scripts/deploy.ts');
    expect(merged.dependencies.react).toBe('18.0.0');
    expect(merged.dependencies.next).toBe('^15.0.0');
  });

  it('does not overwrite existing script of the same name', () => {
    const existing = { scripts: { deploy: 'my-custom-deploy' } };
    const snippet = { scripts: { deploy: 'tsx scripts/deploy.ts' } };
    const merged = mergePackageJson(existing, snippet);
    expect(merged.scripts.deploy).toBe('my-custom-deploy');
  });

  it('reports conflicts when user has a different script with same key', () => {
    const existing = { scripts: { deploy: 'my-custom-deploy' } };
    const snippet = { scripts: { deploy: 'tsx scripts/deploy.ts' } };
    const merged = mergePackageJson(existing, snippet);
    expect(merged.__conflicts__).toEqual([
      { field: 'scripts', key: 'deploy', existing: 'my-custom-deploy', theirs: 'tsx scripts/deploy.ts' },
    ]);
  });

  it('returns snippet when existing is empty', () => {
    const merged = mergePackageJson({}, { type: 'module', scripts: { dev: 'x' } });
    expect(merged.type).toBe('module');
    expect(merged.scripts.dev).toBe('x');
  });

  it('strips _comment field from snippet', () => {
    const merged = mergePackageJson({}, { _comment: 'docs', scripts: { a: 'b' } });
    expect(merged._comment).toBeUndefined();
  });

  // B-011: cross-section dedupe — a snippet package is not re-added to a
  // different dependency-type field when the consumer already declares it.
  it('B-011: does not duplicate a package across dependency sections (deps → optionalDeps)', () => {
    const existing = { dependencies: { officeparser: '^5.0.0' } };
    const snippet = { optionalDependencies: { officeparser: '^6.1.0' } };
    const merged = mergePackageJson(existing, snippet);
    expect(merged.dependencies.officeparser).toBe('^5.0.0');     // consumer entry authoritative
    expect(merged.optionalDependencies?.officeparser).toBeUndefined(); // no duplicate
  });

  it('B-011: dedupe is generalized to any package (devDeps → optionalDeps)', () => {
    const existing = { devDependencies: { officeparser: '^6.1.0' } };
    const snippet = { optionalDependencies: { officeparser: '^6.1.0' } };
    const merged = mergePackageJson(existing, snippet);
    expect(merged.devDependencies.officeparser).toBe('^6.1.0');
    expect(merged.optionalDependencies?.officeparser).toBeUndefined();
  });

  it('B-011: cross-section version mismatch surfaces a conflict with ownerField', () => {
    const existing = { devDependencies: { next: '^14.0.0' } };
    const snippet = { dependencies: { next: '^15.0.0' } };
    const merged = mergePackageJson(existing, snippet);
    expect(merged.dependencies?.next).toBeUndefined();       // not duplicated into dependencies
    expect(merged.devDependencies.next).toBe('^14.0.0');     // consumer entry untouched
    expect(merged.__conflicts__).toContainEqual({
      field: 'dependencies', key: 'next', existing: '^14.0.0', theirs: '^15.0.0', ownerField: 'devDependencies',
    });
  });

  it('B-011: fresh package (no prior declaration) still lands in its snippet section', () => {
    const merged = mergePackageJson({}, { optionalDependencies: { officeparser: '^6.1.0' } });
    expect(merged.optionalDependencies.officeparser).toBe('^6.1.0');
  });
});

describe('B-012: stale config detection', () => {
  it('warns (no overwrite) when an existing next.config.js lacks trailingSlash', async () => {
    writeFileSync(join(target, 'next.config.js'), 'export default { async rewrites() { return []; } };\n');
    const before = readFileSync(join(target, 'next.config.js'), 'utf8');
    const r = await runInit({ target, pluginRoot, force: false });
    // File untouched
    expect(readFileSync(join(target, 'next.config.js'), 'utf8')).toBe(before);
    // Warning recorded
    expect(r.staleConfig.some((s) => s.path === 'next.config.js' && /trailingSlash is missing/.test(s.issue))).toBe(true);
    // Preserved, not migrated by default
    expect(r.migratedConfig).not.toContain('next.config.js');
    expect(r.preserved.some((p) => p.path === 'next.config.js')).toBe(true);
  });

  it('distinguishes an explicit trailingSlash: false from a missing one', async () => {
    writeFileSync(join(target, 'next.config.js'), 'export default { trailingSlash: false };\n');
    const r = await runInit({ target, pluginRoot, force: false });
    expect(r.staleConfig.some((s) => /set to false/.test(s.issue))).toBe(true);
  });

  it('does NOT flag an up-to-date next.config.js (trailingSlash: true)', async () => {
    writeFileSync(join(target, 'next.config.js'), 'export default { trailingSlash: true };\n');
    const r = await runInit({ target, pluginRoot, force: false });
    expect(r.staleConfig.some((s) => s.path === 'next.config.js')).toBe(false);
  });

  it('--migrate-config opt-in backs up then adopts the template config', async () => {
    const userConfig = 'export default { trailingSlash: false };\n';
    writeFileSync(join(target, 'next.config.js'), userConfig);
    const r = await runInit({ target, pluginRoot, force: false, migrateConfig: true });
    // Adopted template (now has trailingSlash: true)
    expect(readFileSync(join(target, 'next.config.js'), 'utf8')).toMatch(/trailingSlash:\s*true/);
    // Original backed up verbatim
    const backup = join(target, '.dxcare-slide-backup', 'next.config.js');
    expect(isFile(backup)).toBe(true);
    expect(readFileSync(backup, 'utf8')).toBe(userConfig);
    expect(r.migratedConfig).toContain('next.config.js');
  });

  it('dryRun + migrateConfig writes nothing but still reports the migration', async () => {
    const userConfig = 'export default { trailingSlash: false };\n';
    writeFileSync(join(target, 'next.config.js'), userConfig);
    const r = await runInit({ target, pluginRoot, force: false, migrateConfig: true, dryRun: true });
    // File unchanged, no backup written
    expect(readFileSync(join(target, 'next.config.js'), 'utf8')).toBe(userConfig);
    expect(isFile(join(target, '.dxcare-slide-backup', 'next.config.js'))).toBe(false);
    expect(r.migratedConfig).toContain('next.config.js');
  });
});

function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }
