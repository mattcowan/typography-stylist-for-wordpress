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
- `glyphs-modal.js` / `editor.js` — the modal UI + editor buttons injected at `typost_inline_before_features` and `typost_qft_before_features`. The modal renders core's **word-boundary accessibility notice** at its top from `context.accessibility` (supplied only on a toolbar launch — opened from inside an editor modal, that modal shows the notice itself), and offers the conversion through the `typost-convert-to-block` CustomEvent, closing afterwards because the conversion replaces the very block the panel is pointed at. `editor.js` also registers an **optional block toolbar button** (v1.3+) on core's `typost_editor_toolbar_buttons` filter when `typost_glyphs_toolbar_button` is on (default off; setting rendered into core's Options tab via `typost_admin_options_rows`, flag exposed as `typostData.glyphsPanel.toolbarButton`). Its `GlyphsIcon` is an outlined Bookmania Regular `salt` alternate #2 "G", scaled to the same cap height as core's swash "T". The toolbar context uses the *same field names* as the existing hook snapshots (`clientId`/`capturedSelection`, `savedSelectionStart`/`savedSelectionEnd`/`selectedText`), so `openModal(context.source, context)` works unchanged; it additionally reads `context.state` (in preference to the shared state filter) and threads `context.reopenHost` into the `typost_glyphs_panel_closed` payload so a toolbar launch does not pop open a host modal on close.
- `__tests__/` — Jest suites (auto-collected by core `npm test`).
- `languages/` — own `typost-glyphs-panel` text domain (.pot, fr/es .po/.mo, JED .json for script translations).

## Conventions

- Glyph cells are text-rendered (real Unicode characters + `font-feature-settings`), never outline-rendered — this is both the accessibility model and the EULA compliance model.
- Version constant `TYPOST_GP_VERSION` in glyphs-panel.php is the source of truth (the module's package.json is for standalone tooling only).
