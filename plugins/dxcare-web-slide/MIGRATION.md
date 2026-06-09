# Migration Guide: v0.2.x → v0.3

This guide covers the breaking and behavioral changes consumers hit when moving
from the `0.2.x` line to `0.3`. It is scoped to the structural shifts that an
existing consumer repo (one already scaffolded by `dxcare-web-slide:init`) must
act on. For the original v0.1 → v0.2 trigger-name rename, see README §Upgrading.

> SemVer note: `0.x` signals the interface is still open for adjustment. `0.3`
> consolidates the dogfood fixes that shipped piecemeal across `0.2.1`–`0.2.4`
> and formalizes the plugin manifest layout. None of the changes below touch a
> consumer's slide content (`slides/<slug>/*`); they touch the plugin package
> shape and the scaffolded repo's root config.

---

## 1. Plugin manifest moved to `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md`

### What changed

Early `0.2.x` builds carried a **root-level `plugin.json`** alongside a **flat
skill layout**. The current layout is:

```
.claude-plugin/
  plugin.json            # manifest (name, version, description, author, keywords)
skills/
  init/SKILL.md
  new/SKILL.md
  work/SKILL.md
  milestone/SKILL.md
  deploy/SKILL.md
```

- The manifest lives at **`.claude-plugin/plugin.json`**, not the repo root.
- Each skill is a **directory under `skills/`** containing a `SKILL.md` with
  YAML frontmatter (`name:` + `description:` are required — CI enforces this).

### What you need to do

This only affects you if you **vendored or forked the plugin** (a plain
`dxcare-web-slide:*` skill consumer pulling from the marketplace gets the new
layout automatically). If you forked:

1. Move your root `plugin.json` to `.claude-plugin/plugin.json`.
2. Move any flat skill markdown into `skills/<name>/SKILL.md`.
3. Confirm each `SKILL.md` opens with a `---` frontmatter block carrying
   `name:` and `description:`. Run `node scripts/ci-validate-plugin-json.mjs`
   to verify the manifest, and the frontmatter loop in
   `.github/workflows/test.yml` (`sanity` job) to verify the skills.

---

## 2. Existing consumer config gap — root config files are preserved, not updated (B-012)

### The trap

`bin/init.mjs` **never overwrites root config files that already exist.** When
init copies `templates/repo/config/*` (`next.config.js`, `tsconfig.json`,
`tailwind.config.ts`, `postcss.config.js`, `middleware.ts`, `vercel.json`,
`next-env.d.ts`) into a consumer repo, any file already present is left
untouched and reported as `preserved` (reason: `config file already present`).

This is deliberate — it protects a consumer's customizations — but it has a
sharp edge: **re-running init does NOT pull in config fixes shipped in newer
plugin versions.** If you scaffolded before a config fix landed, your repo keeps
the stale file.

The headline example is the **`trailingSlash` fix from v0.2.4**:

- Next.js's default trailing-slash behavior 308-redirected `/slides/<slug>/` to
  `/slides/<slug>`, so the browser resolved `./theme.css` against `/slides/` and
  returned 404 for every theme except those that happened to look acceptable
  under unstyled defaults.
- The fix sets `trailingSlash: true` in `templates/repo/config/next.config.js`.
- A consumer who ran init **before v0.2.4** still has `trailingSlash` unset (or
  `false`) in their own `next.config.js`. Re-running init will report it as
  `preserved` and the broken asset resolution persists.

### What you need to do

**Recommended — `--migrate-config` (shipped, v0.2.4+).** Re-run init with the
opt-in flag. `detectStaleConfig()` auto-detects a missing or `false`
`trailingSlash` in your `next.config.js`, backs the original up to
`.dxcare-slide-backup/`, then adopts the template default:

```bash
dxcare-web-slide:init --migrate-config
```

The original is preserved under `.dxcare-slide-backup/`, so the change is
reversible. Even without the flag, init prints a `WARN` when it detects a stale
config and points you here.

**Fallback — manual reconciliation** (for config files `--migrate-config` does
not auto-detect). For each file flagged `preserved` on re-init, diff it against
the shipped template and merge by hand:

```bash
diff -u next.config.js \
  "$(node bin/locate.mjs --plugin-root)/templates/repo/config/next.config.js"
```

Minimum for the v0.2.4 fix — ensure root `next.config.js` has
`trailingSlash: true`, then verify `/slides/<slug>/` serves `theme.css`
(HTTP 200, not a 308 redirect → 404).

> Why init preserves by default: it cannot tell an intentional customization
> apart from a stale default, so it never overwrites silently. `--migrate-config`
> is the explicit, backed-up opt-in; the `preserved` list is your manual
> checklist for anything it does not auto-detect.

---

## 3. Re-running init and dependencies

Re-running `dxcare-web-slide:init` on an already-scaffolded repo is safe and
idempotent for the parts it owns:

- **Template-owned files** (`_shared/`, `_templates/`) — copied if missing.
  If a same-named file differs by content hash, it is **preserved** (a warning
  is printed) unless you pass `--force`, which **backs up** the existing file to
  `.dxcare-slide-backup/<path>` before overwriting.
- **Root config files** — **preserved** if already present (see §2). Never
  force-overwritten, even with `--force`.
- **`.gitignore`** — written only if the repo has none; an existing ignore file
  is never touched.
- **`package.json`** — **non-destructively merged.** Your existing
  `dependencies`, `devDependencies`, and `scripts` are kept; entries the
  template adds are layered in, and any key-level conflicts are reported rather
  than silently overwritten.

### Dependencies

- `officeparser` is an **optional** dependency — consumers who only use
  `.md`/`.txt` references can skip the heavy install. If you do use
  `.pdf`/`.pptx`/`.docx` references, note that **v0.2.4 fixed the officeparser
  v6 API**: the extractor now calls `parseOffice` (not the removed
  `parseOfficeAsync`) and flattens v6's structured node tree into text. After
  re-init, run `pnpm install` so your lockfile picks up `officeparser@^6.1.0`,
  then re-run `pnpm extract-refs --slug <slug>` and confirm office files report
  as extracted rather than `skipped`.
- After any re-init that merged `package.json`, run `pnpm install` to sync the
  lockfile, then `pnpm test` inside the consumer repo to confirm the bundled
  suite still passes.

---

## Quick checklist

- [ ] (Forks only) Manifest at `.claude-plugin/plugin.json`; skills under
      `skills/<name>/SKILL.md` with `name:` + `description:` frontmatter.
- [ ] Re-run init; review every `preserved` config file.
- [ ] Ensure `next.config.js` has `trailingSlash: true` (v0.2.4 fix).
- [ ] `pnpm install` to sync the lockfile (officeparser v6 + merged deps).
- [ ] `pnpm test` in the consumer repo passes.
- [ ] Browser-verify `/slides/<slug>/` loads `theme.css` with HTTP 200.
