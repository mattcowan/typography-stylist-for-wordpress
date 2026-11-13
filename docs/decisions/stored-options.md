# Stored options

- **Topic:** the `wp_options` entries core and the bundled modules store, and the flags that keep a default or a one-time repair from running twice.
- **Issues:** #322 (toolbar buttons on by default), QA 2026-09 E-14
- **Code:** `typography-stylist.php`, `includes/class-typost-admin-options.php`, `uninstall.php`, `tests/Unit/ExportRegistryTest.php`

Moved from the "Important Notes" list of the root [CLAUDE.md](../../CLAUDE.md) by #361. Options added later are not always listed here: `uninstall.php` and the Export & Import registry ([export-import.md](export-import.md)) are the complete list.

- No database migrations needed - uses existing `wp_options` for:
  - `typost_presets` - User-created presets
  - `typost_custom_fonts` - Uploaded webfont kits metadata
  - `typost_adobe_fonts` - Adobe Fonts project configurations
  - `typost_manual_fonts` - Custom font definitions
  - `typost_adopted_wp_fonts` - WP Font Library fonts adopted from the editor picker (v2.1+)
  - `typost_font_replacements` - Replacement mappings + the shared numeric font ID sequence (`next_id`)
  - `typost_paragraph_styles` / `typost_paragraph_styles_next_id` - Paragraph style presets + their ID counter (v2.3+, bundled module)
  - `typost_block_enter_line_break` - Enter key behaviour in the Typography Stylist block (v2.3+, default `'1'` = line break)
  - `typost_glyphs_toolbar_button` / `typost_ps_toolbar_button` - Direct-access toolbar buttons for the Glyphs and Paragraph Styles modules (v2.3+; default on since 2.3.5, #322). Each module turns its button on once on `admin_init` (`maybe_turn_on_toolbar_button()`) behind its own non-autoloaded flag, `typost_glyphs_toolbar_button_default_on` / `typost_ps_toolbar_button_default_on`, because an Options save stores `'0'` for every unchecked box and a deliberate "off" cannot be told from "never turned on"; after the flag, the stored value wins
  - `typost_font_face_version` - UUID written on every `wp_font_face` save or deletion (`invalidate_font_face_css()`); folded into the frontend font CSS cache key whenever adopted Library faces are printed, so a new face rotates those keys without a wildcard delete or an object-cache flush (v2.3+)
  - `typost_allow_variable_weights` - Read-only back-compat flag: lets `sanitize_font_faces()` accept kit weights 1-1000. It has **no admin UI and nothing in the plugin writes it** (the commented-out Options row and the no-JS POST write were removed 2026-09, QA finding E-14 — a no-JS save was resetting it to `'0'` with no control on the form). Default false; the Variable Fonts module does not depend on it.
