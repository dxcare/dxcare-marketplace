---
name: dxcare-web-slide:work
description: Natural-language router for everyday slide work — edits to skeleton.md (big changes), direct HTML tweaks (small changes), theme application, review, and re-render. Use when the user wants to modify an existing slide deck in any way. Trigger keywords (Korean) — 뼈대 수정, 슬라이드 수정, 렌더, 재생성, 테마 바꿔, 카피 다듬어, 리뷰해줘, 이 부분 고쳐. Trigger keywords (English) — edit slide, update deck, re-render, change theme, polish copy, review presentation, fix this section.
---

# dxcare-web-slide:work

Natural-language router for everyday slide work. Classifies the user request into one of five intents and dispatches.

## Prerequisites

Requires a DXCare-slide-compatible repo (has `slides/` + `_shared/` + `scripts/`). All bash blocks resolve the project root via:

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
```

If `locate.mjs` exits non-zero, report its stderr to Noel and stop.

At skill start:
1. Identify the target slide (current context or ask).
2. Call `mcp__secondbrain__get_project_context` with the slug. If it returns context, summarize silently — use for informed edits but don't dump to Noel unless asked.

## Intent classification

Match the user's request against these intents (in priority order):

| # | Intent | Trigger signals |
|---|--------|----------------|
| 1 | **review** | "리뷰", "검토", "review", "체크해줘" |
| 2 | **theme** | "테마", "색상", "폰트", "theme", "color" |
| 3 | **re-render** | "재렌더", "다시 만들어", "뼈대부터", "처음부터", "rebuild" |
| 4 | **skeleton-edit** | "뼈대", "슬라이드 추가/삭제", "순서 바꿔", "메시지 변경" |
| 5 | **html-tweak** | "카피 다듬어", "색 바꿔 (국지적)", "이 문구만", "한 줄만", "fix this line" |

### Ambiguity rule (design §5.2)

If the request could reasonably be **skeleton-edit** OR **html-tweak**, ask **once**:

> "이건 뼈대 수정(큰 변경)인가요, HTML 미세편집(작은 변경)인가요?"

Accept the first answer. If the answer is still ambiguous, default to **html-tweak** (less destructive).

## Guardrails (apply to every intent)

- Never edit files outside `slides/<slug>/` without explicit permission.
- Before any destructive action (re-render, large skeleton rewrite), check git state via:
  ```bash
  ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
  cd "$ROOT"
  node --input-type=module -e "import('./scripts/lib/git-safety.js').then(m => console.log(JSON.stringify(m.getGitState(process.cwd()))))"
  ```
  If dirty, ask Noel to commit or confirm.
- After any file-writing action, run `pnpm test` in the background. If it fails, surface the failure.

## Intent procedures

### review

Delegate to the `slide-reviewer` agent (already in this plugin).

1. Invoke `Agent` tool with `subagent_type: "slide-reviewer"` and prompt:
   > "Review `slides/<slug>/index.html` against the viewport/a11y/PDF checklist. Report violations in a table: file:line, severity, suggested fix. Do not modify files."
2. Relay the agent's table to Noel verbatim (it's the review output).
3. Offer: "Want me to apply these fixes?" — if yes, dispatch to `html-tweak` per violation.

### theme

Update `slides/<slug>/theme.json` (preset swap or token overrides).

1. Ask: "Switch to a different preset (corporate/warm/minimal), or override specific tokens (e.g. primary color)?"
2. **Preset swap:**
   - Read `_templates/theme/<preset>.json`, merge Noel's `overrides` if any, write to `slides/<slug>/theme.json`.
3. **Token override only:**
   - Read current `slides/<slug>/theme.json`, update `overrides` map, write back.
4. **Regenerate `theme.css`** from the updated `theme.json`:
   ```bash
   ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
   cd "$ROOT"
   pnpm generate-theme --slug "<slug>"
   ```
   The generator merges preset tokens with user overrides and writes `slides/<slug>/theme.css` as a `:root` block plus a `[data-theme="dark"]` override block. `index.html` should reference `theme.css` via `<link rel="stylesheet" href="theme.css">`; if the template is older and lacks that link, add it manually near the top of `<head>`.
5. Commit:
   ```bash
   ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
   cd "$ROOT"
   git add slides/<slug>/theme.json slides/<slug>/theme.css
   git commit -m "style(<slug>): update theme"
   ```

### re-render

Regenerate `slides/<slug>/index.html` from `slides/<slug>/skeleton.md` + `theme.json`. **DANGEROUS** — the current HTML is replaced.

#### Step 1: Auto-milestone (non-negotiable)

Before touching `index.html`:

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
pnpm milestone --slug "<slug>" --label "auto-$(date +%H%M%S)"
```

This is design spec §6, §8.2 — auto-snapshot gives a rollback path.

#### Step 2: Parse skeleton

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
node --input-type=module -e "import('./scripts/lib/skeleton-parser.js').then(async m => { const fs = await import('node:fs'); console.log(JSON.stringify(m.parseSkeleton(fs.readFileSync('slides/<slug>/skeleton.md','utf8')))); })" | head -200
```

Load the structured skeleton + read `slides/<slug>/theme.json` + read `_templates/index.html` as the base layout.

#### Step 3: Generate HTML

Using the skeleton data, theme tokens, and `_templates/index.html` scaffold, generate one `<section class="slide">` per parsed slide. Each `<section>`:
- Has `data-slide="N"`, `aria-labelledby="s<N>-title"`
- `<h1 id="s<N>-title">` with the slide heading (drop the "Slide N:" prefix)
- Renders Core Message as a lede paragraph
- Renders Body Points as `<ul>` with one `<li>` per bullet
- Preserves `<script type="module" src="/_shared/js/slide-core.js">`

Honor constraints from `slide-reviewer` checklist:
- Each `.slide` has `height: 100dvh; overflow: hidden`.
- Fonts use `clamp()` not fixed `px`.
- Include `@media (max-height: 700px)` and `@media (prefers-reduced-motion: reduce)` blocks.

Write the full file via `Write` tool (single atomic write). Do NOT stream partial HTML.

#### Step 4: Slide reviewer check

Invoke `slide-reviewer` agent on the new HTML. If violations surface, apply fixes inline (single iteration). If the second review still fails, STOP and offer rollback:

> "재렌더 결과가 리뷰를 통과하지 못했습니다. `slides/<slug>/milestones/<date>-auto-HHMMSS/`에서 복원할까요?"

#### Step 5: Confirm in browser

Tell Noel: "재렌더 완료. http://localhost:3000/slides/<slug>/ 에서 확인 부탁. 마음에 안 들면 'rollback' 해주세요."

Do NOT auto-commit — wait for Noel's confirmation. On "OK/좋아/commit":

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
git add slides/<slug>/
git commit -m "refactor(<slug>): re-render from skeleton"
```

On "rollback":

```bash
# The auto-milestone commit is on HEAD; index.html is an uncommitted modification.
# Simplest: discard the working-copy change to restore the committed (pre-render) state.
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
git checkout -- slides/<slug>/index.html
```

### skeleton-edit

Modify `slides/<slug>/skeleton.md` and **always** chain a re-render.

1. Parse current skeleton (see re-render Step 2) to understand structure.
2. Apply Noel's requested changes via `Edit` tool on `skeleton.md`.
3. Ask: "뼈대 수정 완료. 지금 재렌더할까요?" — default yes after 10 seconds of silence or if Noel says "응/네".
4. If yes → dispatch to `re-render` procedure.
5. If no → commit skeleton change only:
   ```bash
   ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
  cd "$ROOT"
   git add slides/<slug>/skeleton.md
   git commit -m "docs(<slug>): skeleton update (render pending)"
   ```

### html-tweak

Small, surgical edits to `slides/<slug>/index.html`. No skeleton change, no auto-milestone.

1. Identify the section Noel references (by slide number, heading text, or CSS selector).
2. Use `Edit` tool to make the minimal change.
3. If the change is broader than a single-section tweak (e.g. touches more than 3 separate regions of the file), escalate to `skeleton-edit` — ask Noel to confirm.
4. After the edit, briefly describe what changed.
5. Commit:
   ```bash
   ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
  cd "$ROOT"
   git add slides/<slug>/index.html
   git commit -m "style(<slug>): <one-line summary>"
   ```

Do NOT re-render, do NOT touch skeleton.
