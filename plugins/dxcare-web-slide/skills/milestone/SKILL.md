---
name: dxcare-web-slide:milestone
description: Snapshot the current slide state (HTML + skeleton) into `slides/<slug>/milestones/YYYY-MM-DD-<label>/` for frozen delivery versions. Also saves a summary insight to SecondBrain. Use when the user has finished a deliverable version of a slide deck and wants to preserve it. Trigger keywords (Korean) — 마일스톤, 박제, 오늘 버전 저장, 미팅 버전 저장, 확정본. Trigger keywords (English) — milestone, snapshot, save this version, freeze current state.
---

# dxcare-web-slide:milestone

Snapshot the current state of `slides/<slug>/` into `milestones/<date>-<label>/` and record an insight in SecondBrain.

## Prerequisites

Requires a DXCare-slide-compatible repo (has `slides/` + `_shared/`). All bash blocks resolve the project root via:

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
```

If `locate.mjs` exits non-zero, surface its error to Noel and stop.

## Procedure

### 1. Identify target slide

If Noel mentions the slug explicitly, use it. Otherwise:
- Check current working context — which `slides/<slug>/` was recently edited?
- If still ambiguous, list `slides/*/` dirs and ask.

### 2. Ask for label

Prompt: "Milestone label? (short, lowercase-dash, e.g. `kickoff`, `v10-final`, `pre-review`)"

Default if Noel declines: `manual-<HHmm>` (e.g. `manual-1532`).

### 3. Snapshot via script

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
pnpm milestone --slug "<slug>" --label "<label>"
```

On success, the script prints `{ path: "slides/<slug>/milestones/..." }`. Capture the path.

### 4. Fill note.md

Ask Noel for a 2-3 sentence note: "Context for this milestone? (meeting / audience / event)"

Write the answer to `slides/<slug>/milestones/<date>-<label>/note.md`, replacing the placeholder.

### 5. SecondBrain save

Call `mcp__secondbrain__save_insight` with:

```json
{
  "project": "<slug>",
  "type": "slide-milestone",
  "date": "<date>",
  "audience": "<from meta.json audience field>",
  "summary": "<note.md body, stripped>",
  "url": "https://slides-two-ashy.vercel.app/slides/<slug>/milestones/<date>-<label>/"
}
```

Reads `audience` from `slides/<slug>/meta.json`. If SecondBrain call fails, continue and warn Noel — do NOT abort the milestone.

### 6. Commit

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
git add slides/<slug>/
git commit -m "chore(slides): milestone <slug>/<date>-<label>"
```

### 7. Confirm

Reply: "Milestone saved: `slides/<slug>/milestones/<date>-<label>/`. Insight logged to SecondBrain."

## Guardrails

- If `slides/<slug>/` is dirty in git (uncommitted edits), first ask Noel to decide: snapshot current working copy, or commit first?
- Never overwrite an existing milestone directory — the script's collision check handles this; if Noel insists, require him to pick a different label.
- If `meta.json` is malformed, fall back to `audience: ""` and note it in the reply.
