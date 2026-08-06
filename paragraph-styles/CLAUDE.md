# CLAUDE.md — Paragraph Styles module

Self-contained module bundled into core in v2.3 (formerly the standalone `typography-stylist-paragraph-styles` extension plugin). Saves and loads named paragraph style presets — font, weight, size (fixed or responsive), letter spacing, line height, OpenType features, and variable font axes — applied from a dropdown panel in both editors and rendered by CSS class on the frontend. It consumes core's *public* extension API only, never core internals.

## Loading

`typography-stylist.php` (`typost_init()`) does `require_once TYPOST_PLUGIN_DIR . 'paragraph-styles/paragraph-styles.php'` then `Typost_Paragraph_Styles::get_instance()`, guarded by `! class_exists('Typost_Paragraph_Styles')` so the `final class` can never fatally redeclare — a still-active standalone copy of the former extension wins gracefully. Constants are guarded by `! defined('TYPOST_PS_VERSION')` for the same reason. This file has **no plugin header** and no `plugins_loaded` bootstrap.

## Data model

- `typost_paragraph_styles` — array of `{id, name, created, modified, properties}` in wp_options. `properties` mirrors editor state keys: `fontId` (numeric), `fontWeight`, `fontSize` (`'responsive'`, `'fit'`, or px value), `fontSizeMin/Preferred/Max`, `fitMaxSize` (fit styles only — always stored, 0 = uncapped), `letterSpacing` (thousandths of em), `lineHeight`, `features[]`, `fontVariationSettings`.
- `typost_paragraph_styles_next_id` — sequential integer ID counter. Legacy timestamp IDs (`ps_1709312345_123`) are migrated on load; `legacyId` is kept so old CSS selectors keep matching.
- `typost_paragraph_styles_cache` / `typost_paragraph_styles_css` — 12h transients (data / generated CSS), cleared on CRUD and `typost_cache_clear`. All cleaned up in core's `uninstall.php`.

## CSS rendering

`generate_style_css()` emits a dual selector per style: `.typost-ps-{id}` (block-level `styleClass` attribute) and `.typost-styled[data-style-id="{id}"]` (inline spans), plus legacy-ID variants. Font family is `var(--font-{fontId})` so core's font detection/@font-face loading applies unchanged. Responsive sizes use `clamp()` with core's 320/1920 viewport constants. Fit-to-width styles (`fontSize: 'fit'`) emit the **same fallback clamp** — on fit blocks the per-line `calc(...cqi)` sizes in content override it (the clamp restores the no-container-query fallback that save.js skips under `styleClass`); on inline spans fit degrades to the clamp by design. Applying a fit style block-level switches the target block into fit mode (it re-measures its own `fitLineSizes`; the stored `fitMaxSize` cap rides along). Output paths:

- **Frontend:** `wp_head` priority 6 (right after core's font variables at 5) prints `<style id="typost-paragraph-styles-css">`.
- **Editor:** `enqueue_block_assets` + `wp_add_inline_style()` on a dummy handle (`typost-paragraph-styles-inline`) — this reaches **iframed** editors (WP 6.3+) as well as non-iframed ones; guarded by `is_admin()` to avoid double output on the frontend. Verified against the checklist in `todo/editor-iframe-testing.md`.

## Editor integration

`assets/js/editor.js` renders `ParagraphStylesPanel` (ES5 `wp.element`, no build step) into three hook points: `typost_inline_modal_top`, `typost_qft_modal_top`, `typost_inspector_top` (re-rendered on `typost_inline_modal_opened`). It reads state via the `typost_current_editor_state` filter (inspector maps to the `qft` state provider) and applies styles by dispatching the **`typost-apply-block-properties`** CustomEvent with `{properties, paragraphStyleId, styleClass, source}` — core's generic write bridge. (The standalone extension still dispatched the pre-2.0 `typost-apply-paragraph-style` name, which nothing listens to; fixed when bundling.) Active-style detection uses `state.paragraphStyleId`; the panel offers Update / Save as New / Detach when a style is active, with a `(modified)` badge computed by diffing state against stored properties.

Pure logic lives in `assets/js/lib/ps-utils.js` (UMD-lite: `window.typostPSUtils` + CommonJS export) — `findFontName`, `isStyleModified`, `buildPropertiesFromState`, `buildApplyEventDetail` — enqueued as a dependency of `editor.js` and covered by Jest in `__tests__/` (auto-collected by core `npm test`).

## Admin tab

Registered via `typost_admin_tabs` (priority 15) + `typost_admin_tab_content_paragraph-styles`. `includes/admin-tab.php` builds its font-name lookup from the public API on the passed `$instance`: `get_custom_fonts()`, `get_adobe_fonts()`, `get_manual_fonts()`, and `get_adopted_wp_fonts_by_slug()` (adopted entries carry their numeric ID in `font_id`, not `id`). The standalone extension read `get_option('TYPOST_custom_fonts')` — wrong case, so every card showed "Default"; do not reintroduce direct option reads. `assets/js/admin.js` (jQuery) handles inline rename + delete against the REST routes.

## REST API

CRUD at `typost/v1/paragraph-styles` (GET/POST) and `/paragraph-styles/{id}` (PATCH/DELETE), all requiring `edit_posts` — styles are author-facing content, unlike variable-font axes (`manage_options`). `sanitize_properties()` whitelists keys; `fontVariationSettings` is re-validated at CSS generation time (`"tag" number` pairs only).

## Conventions

- Own text domain `typost-paragraph-styles` with its own `languages/` (.pot, fr_FR/es_ES .po/.mo, and JED .json files for `wp_set_script_translations`; JED filenames hash the plugin-relative script path, e.g. `paragraph-styles/assets/js/editor.js`).
- No console logging / `error_log()` (repo policy); REST failures surface as HTTP error responses, saves fail quietly in the panel.
- Editor panel CSS is injected once by `editor.js` into the top document (the panel renders in popovers/sidebar, not the editor canvas iframe).
