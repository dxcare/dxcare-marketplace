---
name: dxcare-web-slide:new
description: Scaffold a new slide project under `slides/<slug>/` in a DXCare-slide repo. Use when the user wants to start a new presentation, create a new slide deck, or initiate a pitch document. Trigger keywords (Korean) — 새 슬라이드, 슬라이드 시작, 슬라이드 프로젝트 파줘, 슬라이드 만들자. Trigger keywords (English) — new slide, start a presentation, scaffold slide, create deck.
---

# dxcare-web-slide:new

Scaffold a new slide project under `slides/<slug>/` in whichever DXCare-slide-compatible repo the session is working in.

## Prerequisites

This skill expects a DXCare-slide-compatible repo at the project root — i.e. a directory containing both `slides/` and `_shared/`. If you are in an empty or unrelated repo, run `dxcare-web-slide:init` first (Phase 4B+).

All bash blocks below use this locator pattern to `cd` into the project root regardless of where Noel invoked Claude from:

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
```

If `locate.mjs` fails (exit 1), surface its stderr to Noel and stop — don't guess.

## Procedure

### 1. Interview the user (one message per turn, as needed)

Collect, defaulting gracefully when Noel is terse:
- **Title** — working title of the deck (required)
- **Audience** — e.g. "Partners executives"
- **Audience org** — e.g. "ACME Corp" (one-word slug candidate)
- **Meeting date** — YYYY-MM-DD or "TBD"
- **Theme preset** — one of **16 presets** (default `corporate`). Don't hardcode the list — fetch it (with categories + blurbs) via `node scripts/theme-catalog.mjs`, and let Noel pick visually via step 1a.
- **Core message** — one-sentence headline for Slide 1

Ask at most **one clarifying question per turn**. If Noel says "just do it," proceed with reasonable defaults (`theme=corporate`).

### 1a. Theme selection (visual gallery + terminal pick)

When Noel hasn't named a theme, run this before scaffolding (step 4):

1. **Catalog** — get the 16 presets grouped by category with one-line blurbs. This is the single source of truth (`_templates/theme/*.json`); never hardcode the list — it drifts.

   ```bash
   ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
   cd "$ROOT"
   node scripts/theme-catalog.mjs
   ```

2. **Open the gallery (visual reference, optional)** — if the `mcp__claude-in-chrome__navigate` tool is available, open the gallery as a `file://` URL (no dev server needed) so Noel sees all 16 rendered:
   - `navigate` → `file://<ROOT>/_templates/theme-examples/index.html`
   - Tell Noel: "갤러리는 16 preset 시각 참고용입니다 — 클릭으로는 선택되지 않으니, 눈으로 보고 아래 선택지에서 고르세요."
   - The gallery is a static page; a card click cannot talk back to this session, so the actual pick happens in the terminal (step 3).

3. **Pick in the terminal (the actual selection)** — present `AskUserQuestion` with the presets from step 1, grouped by category, each option's description = that preset's blurb. Pass the chosen preset to `--theme` in step 4.

4. **Fallback (skip the gallery, still selectable)** — go straight to step 3 (`AskUserQuestion` only) when **any** of these hold:
   - the `claude-in-chrome` tools are unavailable in this session,
   - `navigate` returns an error or rejects the `file://` URL,
   - the page loads blank / 404.

   The gallery is a bonus; selection never depends on it.

### 1b. Brand selection (corner logo)

The deck's corner brand-mark comes from `brand-assets/<brand>/`. Pick which brand (if any) before scaffolding:

1. **List available brands:**

   ```bash
   ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
   cd "$ROOT"
   for d in brand-assets/*/; do [ -f "$d/brand.json" ] && node -e "const m=require('./$d/brand.json');console.log((m.default?'* ':'  ')+'$(basename "$d")'+' — '+(m.name||''))"; done 2>/dev/null
   ```

2. **Decide without nagging:**
   - **0 brands** (no `brand-assets/` or empty) → pass `--brand none`; the deck ships with no logo. Don't ask.
   - **exactly 1 brand** → use it silently, pass `--brand <name>`. Mention it: "로고는 `<name>` 로 들어갑니다."
   - **2+ brands** → `AskUserQuestion`: one option per brand (default-flagged first) + a "로고 없이" option. Pass the pick (or `--brand none`).

3. `create-slide` copies the chosen brand's role files into `slides/<slug>/assets/` and wires them by role — **mark** (corner watermark), **hero** (cover-slide logo), **favicon** (browser tab) — theme-aware where applicable. Roles come from the brand's `brand.json`; a brand with no `roles` falls back to a flat `logo-on-dark`/`logo-on-light` corner mark. Any missing role or file stays empty (graceful). See `brand-assets/README.md`.

### 2. SecondBrain context lookup (OPTIONAL — skip silently if not connected)

**Most users do not have SecondBrain set up. This step is a bonus, never a requirement — never let it error or block deck creation.**

- First check the SecondBrain MCP is available. If `mcp__secondbrain__*` tools are not connected (no SecondBrain server), **skip this entire step silently** and move on to step 3. Do not surface an error, do not mention SecondBrain to the user.
- If connected, call in parallel with the interview (do not block it):
  - `mcp__secondbrain__search_vault` with query = `<audience_org> <title>`
  - If `audience_org` looks like a known company, also `mcp__secondbrain__get_project_context` with the slug
  - If a call fails or returns empty, treat as "no context found" and continue silently — never retry-loop or error out.
- If it returned useful hits, summarize the top 3 to the user in bullets. Do **not** paste raw document bodies.

### 3. Suggest slug

Use the helper via a tiny ESM one-liner (argv-safe, no shell):

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
node --input-type=module -e "import('./scripts/lib/slug-generator.js').then(m => console.log(m.suggestSlug(process.argv[1])))" "<title>"
```

Confirm with Noel: "Slug `pharma-ax-v2` — OK?". If rejected, accept his slug verbatim.

### 4. Scaffold

Run:

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
pnpm create-slide --slug "<slug>" --title "<title>" --audience "<audience>" --audience-org "<audience_org>" --meeting-date "<meeting_date>" --theme "<theme>" --core-message "<core_message>" --brand "<brand>"
```

The script is idempotent-safe: it refuses reserved slugs and collisions. On exit code 2, report the error back to Noel and re-ask.

### 5. Optional reference extraction

If Noel has drag-and-dropped PDF/PPTX/DOCX/MD/TXT files into `slides/<slug>/references/` (or mentions he will), offer to extract them:

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
pnpm extract-refs --slug "<slug>"
```

This writes `slides/<slug>/references/_extracted/*.md` plus an `_index.md` manifest. Summarize top findings in 3-5 bullets before drafting the skeleton.

### 6. Optional skeleton draft

Ask the user whether to draft a fuller `skeleton.md` from what's available. Phrase it to match what actually exists — mention only the sources you found:
- references extracted → "extracted M references"
- SecondBrain hits (only if step 2 ran + returned) → "+ N SecondBrain docs"
- neither → just offer to draft from the title/core message + their input.

e.g. "M references 추출했어요. 이걸로 skeleton.md 초안 잡아드릴까요?" (SecondBrain 미연결이면 그 부분은 빼고 묻습니다.)

If yes, read the current skeleton plus any extracted markdown Noel flags as relevant, and rewrite `skeleton.md` expanding sections 1-6 with context-aware bullets (no new invented facts — only what SecondBrain / references surfaced or what Noel provided). Save with `Write` tool.

### 7. Commit

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
git add slides/<slug>/
git commit -m "feat(slides): scaffold <slug> for <audience_org>"
```

### 8. Confirm

Tell Noel where the deck landed, then make the multi-deck layout explicit so he never re-creates the project folder just to add another slide.

1. **Path + preview:**
   > "`slides/<slug>/` 에 만들어졌습니다. 미리보기: `pnpm dev` → http://localhost:3000/slides/<slug>/ . 다듬기: `dxcare-web-slide:work`."

2. **Multi-deck guidance (always say this):**
   > "이 deck 은 자기 `references/`·`skeleton.md`·테마를 가진 **독립 하위폴더**입니다. 슬라이드를 더 만들려면 \"새 슬라이드 만들자\" 만 다시 하세요 — 프로젝트 폴더·세팅은 그대로 두고 `slides/` 안에 deck 이 나란히 쌓입니다."

3. **Show the side-by-side decks** when the project already holds more than this one — concrete beats abstract:

   ```bash
   ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
   cd "$ROOT"
   ls -1 slides/ | grep -vE '^\.'
   ```

   If it lists 2+ decks, report them: "현재 이 프로젝트의 deck: `<slug-a>`, `<slug-b>`, `<slug>` — 모두 `slides/` 아래 나란히."

## Guardrails

- Never invent SecondBrain findings. If `search_vault` returns empty, say so explicitly.
- Never commit if the scaffold script failed (check exit code).
- Pick a theme from the **16 presets** (step 1a / `node scripts/theme-catalog.mjs`). If Noel wants something outside them, add a new preset JSON under `_templates/theme/` (with `category` + `description` + `mood`) and `ci-validate-presets` will keep it honest — don't fabricate a theme inline.

### Avoid "AI slop" when drafting slides

When you write or expand slide HTML (skeleton draft, `work`), do **not** produce these — they read as cheap/auto-generated. (slide-reviewer §8 flags them after the fact; avoid them up front.)

- **No decorative emoji** as bullets/icons (📊🚀✨🎯💡). Use the 9 diagram patterns (`diagrams.css`) or brand assets instead.
- **No gradient pile-up** — don't stack background mesh + `background-clip:text` + card gradients. Keep accent to the theme's 1–2 token colors.
- **No "rounded box + left accent-border" cliché on every block** — vary layout; not every paragraph needs a card.
- **No data slop** — invented stats ("99%", "10×") or icon+number grids that fill space without real data/source. If Noel didn't give the number, don't manufacture one.
- **No filler** — "Lorem ipsum", "Your text here", interchangeable buzzword adjectives. Write concrete sentences from SecondBrain/references/Noel's input only.
- **No placeholder SVG doodles** — use real diagrams/charts or nothing.
- **Don't fill slides with uniform gray card grids** — card count = real item count.
- Fonts stay Pretendard (token default); never hardcode Inter/Roboto/Arial.
