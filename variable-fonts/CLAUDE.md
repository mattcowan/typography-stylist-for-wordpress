# CLAUDE.md — Variable Fonts module

Self-contained module added in v2.1, structured like the Glyphs Panel: it consumes core's *public* extension API rather than core internals. Adds variable font axis detection and per-axis slider controls.

## Loading

`typography-stylist.php` (`typost_init()`) does `require_once TYPOST_PLUGIN_DIR . 'variable-fonts/variable-fonts.php'` then `Typost_Variable_Fonts::get_instance()`, guarded by `! class_exists('Typost_Variable_Fonts')` so the `final class` can never fatally redeclare if the file is loaded twice. Constants are guarded by `! defined('TYPOST_VF_VERSION')` for the same reason. This file has **no plugin header** and no `plugins_loaded` bootstrap.

## Data model

- `typost_variable_font_axes` — axes keyed by **string** font ID (`kit-…`, `adobe-…`, `manual-…`, `wpl-…`). Axes belong to the binary, not the WP Font Library registration, so keys stay string IDs regardless of migration state.
- `typost_variable_font_flags` — per font `{isVariable, hideWeights}` (legacy plain-boolean values are migrated on read).
- `typost_vf_axes_cache` — 12h transient, cleared on `typost_cache_clear`.

## Data flow

1. **Font upload** → `typost_font_uploaded` → `Typost_Font_Parser` reads the OpenType `fvar` table (`.ttf`/`.otf` only; `.woff2` skipped) → axes auto-saved.
   - **Every family in one kit ZIP shares `upload_path`** (it is the kit directory, set in `Typost::process_font_kit_zip()`). Detection must therefore be scoped to the files each entry's own `font_faces[*]['src']` reference — scanning the directory hands every family the first parseable file's axes. The directory scan survives only as a fallback for entries carrying no `font_faces` at all; if an entry *has* faces that resolve to nothing usable, the answer is "no axes", not "the neighbour's axes". Resolved paths are confined to `upload_path` (kit CSS is untrusted — it arrives inside the ZIP).
2. **Admin UI** → per-font axis rows injected via `typost_after_weight_checkboxes` → saved via REST `POST /typost/v1/variable-font-axes/{id}`. The save is registered with the `waitUntil(promise)` collector on the `typost:font-saved` jQuery event, so core holds its page reload until the save settles rather than racing a fixed timeout.
   - **Re-detect** (`POST .../variable-font-axes/{id}/redetect`) re-runs the server parser for uploaded kits and *returns* the axes without writing the option; `admin.js` repopulates the rows and the user saves. Remote sources (Adobe, manual) and WOFF2-only kits fall through to the browser parser via the Glyphs Panel loader. The button confirms before replacing rows that already exist.
3. **Editor** → `typost_editor_data` filter injects `variableFontAxes` keyed by **numeric** `font_id` (`add_editor_data()` maps string→numeric across all four sources, including adopted WP Library fonts) → `editor.js` renders sliders via `typostHooks` (`typost_weight_control` filter+action, `typost_inline_after_font_controls`, `typost_qft_after_font_controls`, `typost_inspector_after_font_weight`) → dispatches `typost-apply-block-properties` with `properties.fontVariationSettings`. How core applies it depends on `source`: `'inline'` and `'qft'` scope it to the current text selection (inline `data-font-variation-settings` span; QFT falls back to the block attribute when the caret isn't in styled text), `'inspector'` sets the block attribute. Panels initialize from the host-provided `state.fontVariationSettings` when present (`resolveInitialSettings()`), falling back to the top-document selection walk only for the inline surface.

## Conventions

- REST capability is deliberately `manage_options` (axes are site-wide config), unlike core's `edit_posts` font CRUD — rationale documented at `check_permissions()`.
- `REGISTERED_AXES` lives once, as a class constant on `Typost_Variable_Fonts`; the parser references it.
- No `error_log()` (repo policy) — parser failures degrade silently to "no axes".
- Pure JS logic lives in `assets/js/lib/variation-utils.js` (UMD-lite: `window.typostVFUtils` + CommonJS export), enqueued as a dependency of `editor.js` and covered by Jest in `__tests__/` (auto-collected by core `npm test`).
- Own text domain `typost-variable-fonts` with its own `languages/` (.pot, fr_FR/es_ES .po/.mo, and JED .json files for `wp_set_script_translations`).
- **Axis names differ by parser.** The browser path (opentype.js, via the Glyphs Panel loader) reads real axis names out of the font's `name` table — "Softness" for `SOFT`. The PHP parser has no name-table reader and falls back to the uppercased tag — "SOFT". That is why the re-detect button tries the browser first and only falls back to the server. Upload-time detection is PHP, so a font added programmatically (no admin page, so no `typost:fonts-added` sweep) gets tag-name axes until someone re-detects.
