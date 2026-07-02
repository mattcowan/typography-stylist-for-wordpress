# CLAUDE.md — Variable Fonts module

Bundled module (formerly the standalone "Typography Stylist - Variable Fonts" extension plugin, merged into core in v2.1 following the Glyphs Panel template). Adds variable font axis detection and per-axis slider controls.

## Loading

`typography-stylist.php` (`typost_init()`) does `require_once TYPOST_PLUGIN_DIR . 'variable-fonts/variable-fonts.php'` then `Typost_Variable_Fonts::get_instance()`, guarded by `! class_exists('Typost_Variable_Fonts')` so a still-active standalone copy wins gracefully (no fatal redeclare). Constants are guarded by `! defined('TYPOST_VF_VERSION')` for the same reason. This file has **no plugin header** and no `plugins_loaded` bootstrap. Standalone-plugin settings carry over automatically — the option keys are unchanged.

## Data model

- `typost_variable_font_axes` — axes keyed by **string** font ID (`kit-…`, `adobe-…`, `manual-…`, `wpl-…`). Axes belong to the binary, not the WP Font Library registration, so keys stay string IDs regardless of migration state.
- `typost_variable_font_flags` — per font `{isVariable, hideWeights}` (legacy plain-boolean values are migrated on read).
- `typost_vf_axes_cache` — 12h transient, cleared on `typost_cache_clear`.

## Data flow

1. **Font upload** → `typost_font_uploaded` → `Typost_Font_Parser` reads the OpenType `fvar` table (`.ttf`/`.otf` only; `.woff2` skipped) → axes auto-saved.
2. **Admin UI** → per-font axis rows injected via `typost_after_weight_checkboxes` → saved via REST `POST /typost/v1/variable-font-axes/{id}`. The save is registered with the `waitUntil(promise)` collector on the `typost:font-saved` jQuery event, so core holds its page reload until the save settles (the old standalone version raced a 1500 ms timeout).
3. **Editor** → `typost_editor_data` filter injects `variableFontAxes` keyed by **numeric** `font_id` (`add_editor_data()` maps string→numeric across all four sources, including adopted WP Library fonts) → `editor.js` renders sliders via `typostHooks` (`typost_weight_control` filter+action, `typost_inline_after_font_controls`, `typost_qft_after_font_controls`, `typost_inspector_after_font_weight`) → dispatches `typost-apply-block-properties` with `properties.fontVariationSettings`.

## Conventions

- REST capability is deliberately `manage_options` (axes are site-wide config), unlike core's `edit_posts` font CRUD — rationale documented at `check_permissions()`.
- `REGISTERED_AXES` lives once, as a class constant on `Typost_Variable_Fonts`; the parser references it.
- No `error_log()` (repo policy) — parser failures degrade silently to "no axes".
- Pure JS logic lives in `assets/js/lib/variation-utils.js` (UMD-lite: `window.typostVFUtils` + CommonJS export), enqueued as a dependency of `editor.js` and covered by Jest in `__tests__/` (auto-collected by core `npm test`).
- Own text domain `typost-variable-fonts` with bundled `languages/` (.pot, fr_FR/es_ES .po/.mo, and JED .json files for `wp_set_script_translations`).
