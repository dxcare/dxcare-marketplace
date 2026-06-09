# dxcare-web-slide

**Claude Code plugin for building, versioning, and deploying HTML presentations with production discipline.**

Build a polished deck from natural language, then share it as a web link. As of v0.3.6:
- **16 theme presets + a visual gallery picker** — see all 16 rendered, pick in the terminal (`dxcare-web-slide:new`)
- **Brand logos by role** — drop your logos in `brand-assets/`; new decks auto-apply them as a theme-aware corner mark, a cover hero, and a favicon (ships with the DXCare set)
- **Data charts** (Chart.js opt-in) + **9 diagram patterns** + dark/light toggle with a dual-theme contrast gate
- **AI-slop generation guards** so drafts don't read auto-generated
- **Two PDF exports** — fast in-browser button (html2canvas) + WYSIWYG `pnpm export-pdf` (real Chromium screenshot, effects pixel-identical)
- **Flatten + multi-host deploy** — `pnpm bundle` → host-agnostic static folder → Vercel / GitHub Pages / Cloudflare Pages, or an account-free `cloudflared` quick tunnel for instant sharing

See [CHANGELOG.md](CHANGELOG.md) for the full history.

---

## Quickstart

### Install via marketplace (recommended)

```
claude plugin marketplace add dxcare/dxcare-marketplace
claude plugin install dxcare-web-slide@dxcare
```

### Install via local clone (for plugin development)

```bash
git clone git@github.com:dxcare/dxcare-web-slide.git ~/Dev/dxcare-web-slide
ln -s ~/Dev/dxcare-web-slide ~/.claude/plugins/dxcare-web-slide
```

Restart Claude Code. The five skills register automatically.

---

## Your first deck (3 steps)

Everything is natural language — you never memorize command names.

1. **Set up a repo** (once per project): say *"여기 슬라이드 레포 세팅해줘"* / *"bootstrap slides here"* → `init` scaffolds the project + `pnpm install`.
2. **Make a deck**: say *"새 슬라이드 만들자"* / *"new deck"* → `new` interviews you (title/audience), **opens the 16-theme gallery** so you pick a look, applies your **brand logos** (from `brand-assets/`) by role — theme-aware corner mark, cover hero, and favicon — and scaffolds `slides/<slug>/`. Preview with `pnpm dev` → `http://localhost:3000/slides/<slug>/`.
3. **Refine + share**:
   - refine: *"카피 다듬어"* / *"테마 바꿔"* / *"차트 넣자"* / *"리뷰해줘"* → `work`
   - **share a link**: *"공유 링크"* / *"배포"* → `deploy` asks **temporary (cloudflared tunnel, no account) or permanent (Vercel / GitHub Pages / Cloudflare)**
   - **export a PDF**: `pnpm export-pdf --slug <slug>` (WYSIWYG, what you see on screen)

---

## Workflow

Every skill picks up natural-language triggers — you don't have to memorize names.

| You say... | Skill fires | What it does |
|-----------|-------------|--------------|
| "새 슬라이드 레포 파줘" / "bootstrap slides here" | `dxcare-web-slide:init` | Scaffold an empty repo into a full DXCare-slide project (`_templates`, `_shared`, `app`, `scripts`, `docs`, `package.json`) |
| "새 슬라이드 만들자" / "new deck" | `dxcare-web-slide:new` | Interview audience/title, **open the 16-theme gallery + pick in terminal**, scaffold `slides/<slug>/`, optional reference extraction, optional skeleton draft |
| "뼈대 수정" / "카피 다듬어" / "테마 바꿔" / "차트 넣자" / "리뷰해줘" / "재렌더" | `dxcare-web-slide:work` | Natural-language router over edit intents (skeleton-edit, html-tweak, theme, charts, review, re-render). Review runs the dual-theme contrast + AI-slop gate. |
| "마일스톤 찍어" / "박제" | `dxcare-web-slide:milestone` | Snapshot `slides/<slug>/` into `milestones/<date>-<label>/` plus SecondBrain insight |
| "공유 링크" / "배포" / "프로덕션 반영" | `dxcare-web-slide:deploy` | Pick **temporary** (cloudflared tunnel, account-free) or **permanent** (Vercel / GitHub Pages / Cloudflare Pages). Flattens the deck (`pnpm bundle`) then deploys; legacy `pnpm deploy` does the dynamic-monorepo Vercel path. |

---

## Core layout

A bootstrapped repo looks like this:

```
<your-repo>/
├── _templates/                   # scaffolding source
│   ├── index.html                # base slide shell + toolbar
│   ├── meta.json                 # meta schema
│   ├── skeleton.md               # skeleton schema
│   ├── theme/                    # 16 presets (each: category + description + mood)
│   │   ├── corporate.json        # base: corporate / warm / minimal / keynote-dark
│   │   ├── apple-keynote.json    # + 12 trend presets (midnight-jewel, neon-terminal, …)
│   │   └── ...
│   └── theme-examples/           # visual gallery (index.html) + per-preset sample decks
│       └── index.html            # the 16-preset picker `new` opens
├── _shared/                      # runtime assets (CSS + JS)
│   ├── css/
│   │   ├── base.css              # layout + design-system tokens
│   │   ├── diagrams.css          # 3-tier diagram catalog CSS
│   │   └── ...
│   └── js/
│       ├── slide-core.js
│       ├── theme-toggle.js       # dark/light with T hotkey
│       └── pdf.js                # html2canvas + jspdf export
├── brand-assets/                 # logo library — per brand: logo files + brand.json (roles)
│   └── dxcare/                    # bundled default (mark / hero / favicon variants)
├── slides/<slug>/
│   ├── skeleton.md               # content source of truth
│   ├── index.html                # current rendered deck
│   ├── theme.json                # preset + overrides
│   ├── theme.css                 # auto-generated from theme.json
│   ├── meta.json                 # audience, meeting date, status
│   ├── assets/                   # brand logos copied for this deck (self-contained)
│   ├── references/               # source material (PDF/PPTX/MD/TXT)
│   │   └── _extracted/           # auto-converted markdown
│   ├── milestones/<date>-<label>/
│   └── CLAUDE.md                 # per-slide project notes
├── scripts/
│   ├── create-slide.ts
│   ├── snapshot-milestone.ts
│   ├── deploy.ts
│   ├── generate-theme-css.ts
│   ├── extract-references.ts
│   └── lib/                      # helpers, all TDD'd
├── app/                          # Next.js 15 dashboard + slide route
├── middleware.ts                 # password gate for `/`
├── next.config.js
├── vercel.json
└── package.json
```

---

## Content layers (the key design decision)

Every `slides/<slug>/` has **two** content layers that you edit deliberately:

| Layer | File | When to edit |
|-------|------|--------------|
| **Content** (source of truth) | `skeleton.md` | New slides, message changes, reordering — anything structural |
| **Visualization** | `index.html` | Small copy polish, single-section tweaks, local color overrides |

Large edits go through `skeleton.md` and trigger an auto-milestone + re-render. Small edits touch `index.html` directly.

If the change is ambiguous, `dxcare-web-slide:work` will ask once.

---

## 16 theme presets + visual gallery

`dxcare-web-slide:new` **opens the gallery** (`_templates/theme-examples/index.html` — all 16 rendered as cards) so you choose a look by eye, then confirms the pick in the terminal (`AskUserQuestion`, grouped by category with a one-line blurb each). The list comes from a single source of truth — `node scripts/theme-catalog.mjs` reads `_templates/theme/*.json`, so it never drifts.

Apply directly via:

```bash
pnpm create-slide --slug my-deck --theme apple-keynote --title "..." ...
```

Presets ship with both **light** (`bg`, `fg`, `primary`) and **dark** (`bgDark`, `fgDark`, `primaryDark`) values. `theme.css` is regenerated on every `pnpm generate-theme --slug <slug>` with a `:root` block plus a `[data-theme="dark"]` override block. Toggle at runtime with the theme button (or press `T`).

Want to override one token? Edit `slides/<slug>/theme.json`:

```json
{
  "preset": "apple-keynote",
  "overrides": { "color": { "primary": "#D4121A" } }
}
```

...then `pnpm generate-theme --slug <slug>` and commit.

---

## Brand assets (logos by role)

Your company logos live in `brand-assets/<brand>/`. `dxcare-web-slide:new` picks a brand
(one → auto, several → it asks, or "none") and `create-slide` copies that brand's logos into
the deck's own `assets/` (so deploys stay self-contained) and wires them **by role**:

| Role | Where it shows | Theme |
|------|----------------|-------|
| `mark`    | subtle corner watermark on every slide | dark/light auto-swap |
| `hero`    | large logo on the cover slide, above the title | dark/light auto-swap |
| `favicon` | browser-tab icon | single |

`brand.json` declares the role → file mapping. Background-named files (`on-dark` = the mark
you put *on* a dark background = the light/white logo) map 1:1 to the deck theme:

```json
{
  "name": "DXCare",
  "default": true,
  "roles": {
    "mark":    { "on-dark": "inline-white.png",  "on-light": "inline-color.png" },
    "hero":    { "on-dark": "stacked-white.png", "on-light": "stacked-color.png" },
    "favicon": { "any": "symbol-color.png" }
  }
}
```

- Roles are optional — only declared roles wire; missing ones stay empty (graceful). `svg` preferred, `png` fallback.
- A brand with **no** `roles` block falls back to the flat `logo-on-dark` / `logo-on-light` convention for the corner mark only.
- **Add a brand**: make `brand-assets/<name>/` with logo files + a `brand.json`. **Remove**: delete the folder (no brands → logo-less decks).
- The plugin ships the full **DXCare** set (symbol / inline / stacked / English & Korean wordmarks × color/white/violet-bg). See `brand-assets/README.md`.

---

## PDF export

Two paths, by need:

**In-browser button (fast, zero-setup).** Every scaffolded `index.html` includes two download buttons — one per theme. Uses `html2canvas` + `jspdf` from CDN; mobile renders via a hidden 1920×1080 iframe. html2canvas re-implements rendering in its own canvas engine, so some effects (`color-mix()`, `backdrop-filter`, soft `box-shadow` glow) can differ from the on-screen render.

**`pnpm export-pdf` (WYSIWYG, high-fidelity).** For "exactly what the browser shows", export via a real Chromium screenshot:

```bash
pnpm export-pdf --slug <slug> [--theme light|dark] [--scale 2] [--out path]
```

It serves the deck locally, directly activates each slide (mode-agnostic — works for both absolute-fade skeleton decks and scroll-snap rich decks, no dependence on nav animation timing), and captures with Playwright `page.screenshot()` — the **real compositor**, so box-shadow / blur / gradient / glassmorphism land pixel-identical to the on-screen render. Capture is at a 1280×720 reference viewport (`--scale` multiplies resolution); `clamp()`/`vw` sizing matches that width. Pages are 16:9 (960×540 pt), one slide per page, assembled with `pdf-lib`. Output is raster (text not selectable) — the price of true WYSIWYG.

Requires the optional deps + the Chromium binary:

```bash
pnpm add -D playwright pdf-lib && npx playwright install chromium
```

A webpage cannot screenshot itself at the compositor level, so this is a dev-time tool, not an in-browser button — the shipped deck stays self-contained (Playwright never ships in the deck). Vector PDF via the browser print engine was evaluated and rejected: it drops/distorts box-shadow & blur (see `proposals/B-019-context.md`).

The html2canvas path is ported from `dxcare-web-slide@0.1.0`, validated in production for Samsung Invites V10.

---

## References auto-extraction

Drop source files into `slides/<slug>/references/`:

```
references/
├── strategy-deck.pdf
├── competitor-analysis.pptx
├── research-notes.md
└── raw-interview.txt
```

Run:

```bash
pnpm extract-refs --slug <slug>
```

Produces `references/_extracted/*.md` plus an `_index.md` manifest. `dxcare-web-slide:new` offers this step automatically before drafting the skeleton.

Office formats (PDF / PPTX / DOCX) parse via `officeparser`. MD passes through verbatim. TXT gets a minimal markdown header.

---

## Init flags

```bash
node ~/.claude/plugins/dxcare-web-slide/bin/init.mjs [target] [--force] [--dry-run]
```

| Flag | Behavior |
|------|----------|
| default | Error if `slides/` has subdirs; preserve any template-collision file (write to `preserved[]`) |
| `--force` | Overwrite template-collision files after backing up originals to `<target>/.dxcare-slide-backup/` |
| `--dry-run` | Report what would change without writing a byte |

**Always run `--dry-run` first** on a non-empty directory.

---

## Project root discovery

The plugin resolves your working project root via this order:

1. `CLAUDE_PROJECT_DIR` env var (when Claude Code sets it)
2. Walk up from `cwd()` looking for the marker pair: `slides/` + `_shared/` directories side-by-side

This means skills work correctly whether you're at the repo root or deep inside `slides/some-deck/milestones/...`.

---

## Development

```bash
cd ~/Dev/dxcare-web-slide
git pull
# Edit plugin source (bin/*.mjs, skills/*.md, templates/*)
# The ~/.claude/plugins/dxcare-web-slide symlink picks up changes immediately.
```

The bundled `templates/repo/` is the canonical scaffold source — `init` copies it into a new repo and merges `templates/package-snippet.json` into the deck's `package.json`. Edit the scaffold here; changes flow to newly-initialized decks.

---

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — version history, architecture decisions
- [LICENSE](LICENSE) — MIT
- Skill bodies (`skills/*.md`) — per-skill procedure, guardrails, trigger keywords
- `templates/repo/docs/diagram-patterns.md` — catalog of reusable diagram patterns (flow / comparison / timeline / etc.)
- `templates/repo/docs/CHARTS.md` — data chart module (Chart.js opt-in: bar/line/pie/doughnut, theme-aware, PDF-safe)
- `templates/repo/docs/RICH-DECKS.md` — self-contained rich deck mode (scroll-snap) vs skeleton mode

---

## Troubleshooting

**"Could not locate dxcare-web-slide project root"** — you're not inside a repo with both `slides/` + `_shared/`. Run `dxcare-web-slide:init` here or `cd` into the right tree.

**`pnpm generate-theme` reports "Unknown preset"** — `theme.json` references a preset that isn't in `_templates/theme/`. Check the filename (kebab-case, matches `preset` value).

**`pnpm deploy` exits 2 (git_dirty)** — commit or stash first. We refuse to deploy a dirty tree.

**PDF export captures the UI chrome** — check that `.deck-controls`, `.nav-dots`, `.pdf-btn` are in the hide-list at `_shared/js/pdf.js:48-51`. Add your custom UI to `hiddenEls` there.

**Dark mode toggle doesn't stick across slides** — make sure your `index.html` loads `_shared/js/theme-toggle.js` before the first user interaction. `initTheme()` must run once on load.

---

## Migrating from `dxcare-web-slide@0.1.0`

Already using the legacy plugin? Here's the short path:

1. **Disable the old plugin first**:
   ```bash
   mv ~/.claude/plugins/dxcare-web-slide ~/.claude/plugins/dxcare-web-slide.disabled
   ```
   Claude Code will stop loading it on the next start. Legacy slash commands (`/slide:new`, `/slide:deploy`, etc.) stop working.

2. **Install `dxcare-web-slide`** (see Quickstart above). The new trigger surface is described below.

3. **Trigger mapping** (new plugin uses natural-language intent + the `dxcare-web-slide:` prefix):

   | Old trigger | New trigger (natural language also works) |
   |-------------|-------------------------------------------|
   | `/slide:new` | `dxcare-web-slide:new` / "새 슬라이드 만들자" |
   | `/slide:update` | `dxcare-web-slide:work` / "카피 다듬어" / "뼈대 수정" |
   | `/slide:theme` | `dxcare-web-slide:work` (theme intent) / "테마 바꿔" |
   | `/slide:deploy` | `dxcare-web-slide:deploy` / "배포" / "프로덕션 반영" |
   | (none)       | `dxcare-web-slide:milestone` / "마일스톤 찍어" — **new** |
   | (none)       | `dxcare-web-slide:init` / "슬라이드 레포 세팅" — **new** |

4. **Existing decks** authored against the legacy plugin usually still open standalone (their `index.html` had inline `:root` styles and no shared runtime). To adopt the new theme system, run `dxcare-web-slide:init` at the repo root and then `dxcare-web-slide:work` on each deck — it will offer a re-render that emits the new `theme.css`.

5. **Backup behavior** — `init --force` writes originals to `.dxcare-slide-backup/` inside the target. That directory is already in the shipped `.gitignore` so it won't be committed, but review its contents before deleting.

A full `MIGRATION.md` covering edge cases (custom theme CSS, per-deck assets folder, version-hub migration, PDF export API differences) is planned for v0.2.0 final — tracked in CHANGELOG.

---

## Credits

- **Ported from** [`dxcare-web-slide@0.1.0`](https://github.com/dxcare/dxcare-web-slide): 12 theme presets, PDF exporter, diagram catalog
- **Samsung Invites V10** (production reference for PDF + theme-toggle)
- **DXCare** (organization, ownership)
- Authored with Claude Code.
