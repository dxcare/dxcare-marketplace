---
name: dxcare-web-slide:init
description: Bootstrap the current (or specified) directory into a DXCare-slide-compatible repo. Copies templates, scripts, and a Next.js deployment scaffold into the target, and merges package.json snippets non-destructively. Use when the user starts a new slides repo from scratch, or wants to retrofit an existing repo. Trigger keywords (Korean) — 슬라이드 레포 세팅, 새 슬라이드 프로젝트, 슬라이드 부트스트랩, 프로젝트 초기화. Trigger keywords (English) — init slides repo, bootstrap dxcare-web-slide, scaffold slides project, set up a new slides repo.
---

# dxcare-web-slide:init

Bootstrap a target directory into a working DXCare-slide repo. After this, the other skills (`new`, `work`, `milestone`, `deploy`) all function against that directory.

## When to use

- Noel is in an empty or unrelated directory and says "새 슬라이드 레포 하나 파줘" / "set up a slides repo here".
- An existing Next.js repo wants to adopt the DXCare-slide structure (retrofit).
- Testing the plugin against a sandbox — e.g. verifying that portable skills actually work outside Strategy.

## Procedure

### 1. Identify target and check state

Default target is `$(pwd)`. If Noel specified a directory, resolve it absolutely (`cd <dir> && pwd`).

Check the target:
- Is it empty, or does it have unrelated files? (listing with `ls -A` is fine)
- Does it already have a `slides/` directory with subdirectories? If yes, confirm: "Target has existing slides — overlay templates anyway? (force)"

### 2. Run init (dry-run first, always)

```bash
node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/init.mjs" "<target>" --dry-run
```

`--dry-run` reports exactly what would be created, preserved (template file collides with a user-modified copy), and overwritten — without writing anything. **Always run dry-run first on a non-empty directory** and surface the summary to Noel before committing the real thing.

### 3. Run init for real

```bash
node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/init.mjs" "<target>"
# Add --force to overwrite user-modified files that collide with templates
# (originals are backed up to <target>/.dxcare-slide-backup/)
```

The script prints a JSON summary with four arrays:
- `copied` — files/dirs newly created
- `preserved` — user files that differed from the template and were kept (no force)
- `overwritten` — user files overwritten in force mode (each backed up in `.dxcare-slide-backup/`)
- `conflicts` — package.json scripts/deps where user had a different value

Report all four to Noel.

Exit codes:
- `0` — success, no package.json conflicts
- `2` — `InitConflictError` (existing slides/ with subdirs, re-run with `--force`)
- `7` — success but package.json scripts conflict — Noel must reconcile before running `pnpm install`

### 3. Post-init actions

After a successful init, tell Noel exactly what to do next:

```bash
cd <target>
pnpm install
pnpm test         # sanity check — should be 10+ passing
pnpm dev          # http://localhost:3000 — decks open at /slides/<slug>/, root = deploy-gated dashboard
```

Then prompt: "첫 슬라이드 만들까요? (`dxcare-web-slide:new` 로 진행 가능)".

### 4. Commit the scaffold

If the target is a git repo (check `git rev-parse --show-toplevel`), offer:

```bash
cd <target>
git add .
git commit -m "chore: bootstrap dxcare-web-slide v<version>"
```

If not a git repo, suggest Noel run `git init` first and re-commit.

### 5. Vercel project link (optional)

Do NOT auto-link to Vercel. Instead, tell Noel:

> "배포하려면 `cd <target> && vercel link` 로 새 Vercel 프로젝트를 연결하세요. 기존 대시보드 인증을 쓰려면 `DASHBOARD_PASSWORD`, `DASHBOARD_SECRET` 환경변수를 추가해야 합니다."

## Guardrails

- Never run `--force` without explicit user approval.
- Never delete existing files — init is copy-only; user files not in the template always survive.
- If package.json conflicts appear (`__conflicts__` non-empty in merged output), do not silently mask them — surface the conflict list to Noel so he decides manually.
- If the plugin's `templates/` directory is missing (e.g. the plugin was installed without templates), stop with a clear error and point to Phase 4G marketplace install as the intended path.
