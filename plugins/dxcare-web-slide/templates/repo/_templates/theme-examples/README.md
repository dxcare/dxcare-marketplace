# Theme examples — inspiration gallery (not canonical)

> **Heads up**: these HTML files are **hand-authored showcase pages**, not live previews of the theme presets in `../theme/*.json`.

Each file is a self-contained 8-slide sample deck styled in the spirit of the named theme — useful for *visualising the vibe* before you commit to a preset. But:

- They use legacy CSS variable names (`--bg-primary`, `--text-primary`, `--accent`) that differ from the current preset schema (`bg`, `fg`, `primary`).
- Their colours may diverge from the canonical `_templates/theme/<preset>.json` because the gallery was last tuned by hand, while the JSON presets are the source of truth for `pnpm generate-theme`.
- They are **dark-mode only**; the real presets produce both `:root` (light) and `[data-theme="dark"]` (dark) blocks.

## How to use

- **Inspiration / client pitch**: open `<preset>.html` in a browser to show a mock deck in that theme's direction.
- **Apply for real**: reference `../theme/<preset>.json` instead — that's what `pnpm create-slide --theme <preset>` consumes and what `pnpm generate-theme --slug <slug>` emits to your slide's `theme.css`.

## Roadmap

A future phase will regenerate these HTML pages deterministically from the JSON presets so the examples match 1:1. Until then, treat the JSON presets as canonical and this folder as marketing-grade art.

## Index

See `index.html` for a single-page navigator across all 12 sample decks.
