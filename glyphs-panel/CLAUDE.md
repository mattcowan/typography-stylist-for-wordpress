# CLAUDE.md — Glyphs Panel module

Bundled module (formerly a standalone extension plugin, merged into core for v2.0). An Illustrator-style full-font glyph browser with insertion into the editor. Core's CLAUDE.md describes how bundling works (class_exists/defined guards, no plugin header); this file covers module internals.

## Structure

- `glyphs-panel.php` — singleton `Typost_Glyphs_Panel`: hook registration (`typost_editor_data`, `typost_editor_assets`, `typost_admin_tabs`/`typost_admin_tab_content_glyphs`/`typost_admin_assets`), asset enqueueing, text domain.
- `includes/font-files.php` — resolves font file URLs per source (uploaded kits, Adobe, WP Font Library/theme.json via `typost_gp_get_wp_font_files()`), emits hardened @font-face CSS.
- `assets/js/lib/` — hand-written ES5, no build step; each file is UMD-lite (`window.*` + CommonJS export for Jest):
  - `font-loader.js` — fetches the font binary (CORS), decompresses WOFF2 via wawoff2, parses with opentype.js (both lazy-loaded).
  - `metadata.js` — builds metadata-only structures: cmap coverage and GSUB feature→substitution maps, including type-3 alternate counts per codepoint (`salt`/`aalt`). **EULA constraint: metadata only — no glyph outlines/paths/SVG are ever read or stored.**
  - `idb-cache.js` — IndexedDB-only caching (nothing font-derived touches the server).
  - `parse-worker.js` — web worker wrapper for parsing.
  - `search.js`, `window-grid.js`, `insertion.js` — search/filtering, virtualized ARIA grid, and insertion via the `typost-insert-content` CustomEvent (indexed alternates use `data-feature-settings`, e.g. `"salt" 2`).
- `glyphs-modal.js` / `editor.js` — the modal UI + editor buttons injected at `typost_inline_before_features` and `typost_qft_before_features`.
- `__tests__/` — Jest suites (auto-collected by core `npm test`).
- `languages/` — own `typost-glyphs-panel` text domain (.pot, fr/es .po/.mo, JED .json for script translations).

## Conventions

- Glyph cells are text-rendered (real Unicode characters + `font-feature-settings`), never outline-rendered — this is both the accessibility model and the EULA compliance model.
- Version constant `TYPOST_GP_VERSION` in glyphs-panel.php is the source of truth (the module's package.json is for standalone tooling only).
