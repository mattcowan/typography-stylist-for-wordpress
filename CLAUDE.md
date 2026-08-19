# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WordPress plugin that adds advanced OpenType typography features (ligatures, stylistic sets, swashes) to headlines in the Gutenberg block editor. It provides an inline text selection interface with live preview for applying CSS `font-feature-settings` to heading blocks.

## Architecture

### Core Plugin Structure

**Main Plugin File:** [typography-stylist.php](typography-stylist.php)
- Singleton class `Typost` handles all WordPress integration
- Enqueues block editor and frontend assets
- Registers REST API endpoints at `/wp-json/typost/v1/`
- Manages presets stored in `wp_options` table (`typost_presets` — note: all option keys are lowercase `typost_*`; PHP constants are the uppercase ones)
- Constants: `TYPOST_VERSION`, `TYPOST_PLUGIN_DIR`, `TYPOST_PLUGIN_URL`, `TYPOST_PLUGIN_BASENAME`
- Font subsystem modules in `includes/`: `Typost_Font_Sources` (option-backed font storage, shared font ID sequence, replacements) and `Typost_Font_Library_Bridge` (WP Font Library read/registration/adoption, WP 6.5+ feature-gated). `Typost` keeps delegating wrappers, so the public extension API (`get_custom_fonts()` etc.) is unchanged.

**Block Editor Integration:**

The plugin provides two distinct interfaces for applying OpenType features:

1. **Inline Editor** [assets/js/block-editor.js](assets/js/block-editor.js)
   - **What:** Toolbar button (with the swash "T" icon) available on standard rich text blocks (core/heading, core/paragraph, etc.)
   - **When:** Use for applying features to complete words/phrases in any heading or paragraph block
   - **How:** Opens a popover with presets, individual features, font controls, and preview
   - **Implementation:** Registers custom format type `typost/features` using WordPress `@wordpress/format-api`
   - **Output:** Applies formatting using inline `<span class="typost-styled" data-features="..." style="font-feature-settings: ...">`
   - **Storage:** Features are stored directly in post content (no separate meta table)
   - **Note:** Features must be explicitly applied via the "Apply" button (not automatic on toggle)

2. **Typography Stylist Block** [blocks/typography-stylist/](blocks/typography-stylist/)
   - **What:** Custom Gutenberg block with block-level controls in the sidebar PLUS inline text styling
   - **When:** Use for complex typography with accessibility features or when styling partial words
   - **Components:**
     - **Inspector Controls (Sidebar):** Block-level settings for font family, weight, size, letter spacing, and OpenType features
     - **Quick Feature Toggles (Popover):** Appears when text is selected within the block, allows inline styling of selected text with `<span class="typost-styled">` elements. Provides controls for letter spacing, font size, font family, font weight, and OpenType features (similar to inline editor but scoped to Typographic Stylist block content)
   - **Features:**
     - Dual content approach: clean semantic heading for screen readers, styled version for visual display
     - Built with JSX/React using `@wordpress/scripts` build toolchain
     - Supports responsive/fluid font sizing
     - ARIA markup with configurable screen reader classes (visually-hidden, sr-only, custom)

**Responsive Font Sizing:**
- Uses CSS `clamp()` function with three independent size values
- **Mobile (320px+):** Minimum size for small screens
- **Intermediate:** Preferred size for medium screens (calculated via viewport units)
- **Large (up to 1920px):** Maximum size for large screens
- Breakpoint constants: `RESPONSIVE_FONT_MIN_VIEWPORT = 320`, `RESPONSIVE_FONT_MAX_VIEWPORT = 1920`
- Size controls operate independently with soft validation (warnings only, no auto-adjustment)
- CSS `clamp(min, val, max)` does **not** auto-sort out-of-order values; it evaluates to `max(min, min(val, max))`, so when `min > max` the expression effectively collapses to `min` and may clamp to an unintended size. The UI warns when values are out of order to prevent this and does not auto-correct them.
- Default sizes for new blocks: 16px / 32px / 64px

**Admin Interface:** [includes/admin-page.php](includes/admin-page.php)
- Tabbed interface showing: Presets, Font Features, Custom Fonts, Accessibility, Options, Help
- Font management: Upload webfont kits, Adobe Fonts integration, custom font definitions
- Font preview for testing OpenType features
- Options tab: Clear confirmation settings, archive page font detection, manual cache clear button
- Inline styles and jQuery for tab switching
- Located at Settings → Typography Stylist
- **No-reload AJAX architecture (v2.3+):** every font action refreshes the page in place instead of reloading. `GET /typost/v1/admin/refresh` returns server-rendered fragments from the shared template functions `typost_render_font_list_section()` / `typost_render_preview_font_options()` (so PHP extension hooks render identically in fragments), plus refreshed `typostAdmin` data arrays and font CSS (`--font-N` variables, admin @font-face, Adobe stylesheet URLs). JS swaps `#typost-fonts-region`, repopulates the preview select (selection preserved), re-inits sortable, and re-attaches dismiss buttons on `.is-dismissible` notices (WP core only wires those at page load). The Options/Accessibility/Clear Cache forms POST to `admin/options`, `admin/accessibility`, `admin/clear-cache` (all `manage_options`), keeping their PHP POST handlers as the no-JS fallback; the color scheme restyles live by swapping `#typost-admin-color-scheme-inline-css`. Updates are announced through the polite `#typost-live-region`; the `typost:font-saved` / `typost:fonts-added` `waitUntil` contract still gates the refresh (see HOOKS.md). On refresh failure the page falls back to `location.reload()` so it can never sit stale.

### Font Loading Architecture (v1.1.9+)

**Hook Timing for Font Detection:**
The plugin uses different WordPress hooks for font detection depending on page type:

**Archive Pages** (blog home, category, tag, date, author archives):
- `template_redirect` (priority 1) → `detect_frontend_fonts()` detects fonts AFTER main query executes
- `wp_enqueue_scripts` (priority 10) → `enqueue_frontend_assets()` uses cached detection results
- `wp_enqueue_scripts` (priority 10) → `enqueue_custom_fonts_optimized()` outputs @font-face CSS

**Singular Pages** (posts, pages, custom post types):
- `wp_enqueue_scripts` (priority 10) → Uses existing detection logic with `get_queried_object()`
- No changes to singular page code path (already works correctly)

**Why This Architecture:**
- WordPress executes the main query AFTER `wp_enqueue_scripts` fires
- On archive pages, `$wp_query->posts` is empty during `wp_enqueue_scripts`
- `template_redirect` fires AFTER query execution, so `$wp_query->posts` is populated
- Detection results cached in instance variables (`$detected_fonts`, `$has_styled_content`, `$fonts_detected`)
- Singular pages use `get_queried_object()` which doesn't depend on `$wp_query->posts` array

**Cache Management:**
- Font detection results cached in transients for 12-24 hours
- Manual cache clear button available in Settings → Typography Stylist → Options
- Cache automatically cleared when plugin options change
- Cache keys: `typost_has_styled_*`, `typost_used_fonts_*`, `typost_font_css_*`

### Data Flow

1. User selects text in heading block → clicks toolbar button
2. Popover shows presets (from `typostData.presets`) and features (from `typostData.features`)
3. User toggles features or selects preset → clicks Apply
4. JavaScript applies inline format with `data-features` attribute and `font-feature-settings` style
5. Frontend displays with CSS only (no JavaScript required)

### Inline Styling Architecture

**Data Attributes (v1.1.6+):**
All inline styles are stored using standardized data attributes in `<span class="typost-styled">` elements:
- `data-font-id` - Font family ID (matches block-level `fontId` naming convention)
- `data-fontsize` - Font size value
- `data-fontweight` - Font weight value
- `data-features` - Comma-separated OpenType feature codes
- `data-style-id` - Paragraph style ID (v2.0.0+, set by extension). When present, inline `style` is omitted; a CSS class provides rendering
- `data-fitscale` - Fit-relative scale factor (v2.2.3+), emitted as `font-size: Nem`. Strictly separate from `data-fontsize` (which fit mode neutralizes): em sizes scale linearly with the fitted line, so scaled spans are INCLUDED in fit measurement and never share a span with `data-fontsize`
- `data-fitshift` - Fit-relative vertical shift in em (v2.2.3+, negative = down), emitted as `vertical-align: Nem`; moves the inline box without changing its advance, so it never affects fit measurement

**CSS Variable System (v1.1.6+):**
Inline fonts use CSS variables for consistent font loading:
- **Inline fonts:** `font-family: var(--font-12)` (uses CSS variable)
- **Block-level fonts:** `font-family: var(--font-12)` (uses CSS variable)
- **Both follow same loading chain:** fontId → CSS variable → PHP detection → @font-face enqueueing

**Attribute Preservation:**
When applying sequential inline styles (e.g., first font-family, then line-height), the preservation system ensures existing attributes aren't lost:
- Functions check for existing `data-font-id`, `data-fontsize`, `data-fontweight` attributes
- Preserved attributes are copied to new styling operations
- Style properties matching preserved attributes aren't overwritten
- See `applyOrMergeStyling()` and `applyStylingSafeStringMethod()` in [utils.js](blocks/typography-stylist/utils.js)

**Preview System:**
Quick Feature Toggle previews detect inline fonts at cursor position:
- `parseInlineFontFamilyAtCursor()` utility function detects `data-font-id` at selection
- Memoized for performance (see `inlineFontFamilyAtSelection` in [edit.js](blocks/typography-stylist/edit.js))
- Preview displays in inline font if detected, otherwise falls back to block-level font

**Nested Span Handling (v1.2.0+):**
The plugin uses nested `<span class="typost-styled">` elements to layer multiple typography properties (e.g., font-size wrapping font-weight wrapping OpenType features).

**Maximum Nesting Depth:** 3 levels
- Enforced in `validateNestingDepth()` utility function
- Conservative limit - can be increased if approach proves reliable
- Prevents performance degradation and editing complexity
- Typical usage: 2-3 levels (fontsize → fontweight → features)

**Multi-Node Selections:**
- When selection spans across nested spans, DOM structure is preserved
- Uses DOM Range `extractContents()` to maintain nested elements
- Automatically cleans up empty spans left behind after extraction
- Falls back gracefully if range operations fail

**Edge Cases Handled:**
- Partial selections crossing span boundaries
- Feature spans nested within font property spans
- Multiple sequential styled spans in selection
- Empty spans created during content extraction are automatically removed

### Extensibility / Hook System (v2.0.0+)

The plugin provides a lightweight action/filter system (`window.typostHooks`) for JavaScript and standard WordPress hooks for PHP. See [HOOKS.md](HOOKS.md) for the complete developer reference.

**Key concepts:**
- Extensions are generally separate WordPress plugins (the bundled Glyphs Panel module is the one exception — see below)
- JS hook containers use `data-hook` attribute for context-aware CSS: `[data-hook="typost_qft_modal_top"]`
- `typost-apply-block-properties` CustomEvent is the generic bridge for extensions to set editor properties
- Block attribute `styleClass` + inline attribute `data-style-id` provide generic infrastructure for class-based styling by extensions
- **Toolbar buttons (v2.3+) are a filter, not a container.** `typost_editor_toolbar_buttons` returns `{id, icon, label, isActive, editors, onClick}` descriptors that core renders as real `ToolbarButton`s in both editors — a foreign React root mounted into a hook `<div>` would sit outside the toolbar's roving tabindex and break keyboard navigation. The click `context` carries `state` (resolved for the clicked block — the shared `typost_current_editor_state` filter only answers for the block holding the caret, so a List View selection would report the default font) and `reopenHost: false` (no host modal was open, so `typost_glyphs_panel_closed` must not open one). Core snapshots the selection into `capturedSelection` before calling `onClick`, which is what makes `typost-insert-content` land at the selection and advance the caret between insertions. `filterToolbarButtons`/`buildQftEditorState`/`resolveBlockSelectionRange` in `blocks/typography-stylist/utils.js` hold the tested logic; `block-editor.js` duplicates the tiny filter for the usual separate-build-pipeline reason.
- **Inherited font resolution (v2.3+)**: text styled only by the theme carries no `data-font-id`, so the shared editor state used to report `fontId: 0` and the Glyphs panel fell back to the first font in the list. Both editors now resolve the *rendered* family back to a numeric id with `resolveFontIdFromFamily()` ([assets/js/font-options.js](assets/js/font-options.js), the inverse of `resolveActiveFontFamily`) and report it: inline via `getInheritedFontId()`, the block via `qftStateRef.current.inheritedFontId` (assigned after `fontIdMap` exists — the ref is built earlier in the render, so referencing the map at that point is a TDZ error). Precedence is inline span → block attribute → inherited.
- **Rendered weight, not the `'400'` default (v2.3+)**: a core heading is bold because of theme CSS, while `fontWeight` defaults to `'400'` and save always emits it. Treating unset as 400 lightened converted headings *and* made Glyphs-panel insertions lighter than the surrounding headline, because consumers wrote the reported weight onto the span they created. `getEffectiveFontWeight()` is the single source: explicit `data-fontweight` on the selection → a weight the author picked in the popover (tracked by `_pendingChanges.keys`) → the computed weight. It feeds both `convertToBlock()` and the `typost_current_editor_state` filter. `getActiveFontWeight()` hard-defaults to `'400'`, so `getExplicitFontWeight()` exists to tell "unset" from "deliberately 400". The block-menu transform can't reach the DOM through its attributes-only signature, so it uses `detectBlockComputedWeight()` in `utils.js`, locating the source through the selection and bailing when more than one block is selected.
- **Word-boundary notice reaches extension surfaces (v2.3+)**: `getSelectionAccessibility()` resolves the notice fresh from the store (not component state, which a toolbar launch never populates) and rides in the toolbar click context as `accessibility`. The Glyphs panel renders it at the top of its own modal, and offers the fix through the `typost-convert-to-block` CustomEvent — every mounted format instance handles that, which is harmless because `replaceBlocks` on an already-replaced client ID is a no-op.
- **Boolean flags in `typostData` must be cast in PHP (v2.3+)**: options are stored as `'1'`/`'0'` strings and `wp_localize_script()` stringifies everything, so an uncast `'0'` arrives as the **string `"0"` — truthy in JS**. `enableAriaLabels`, `disableAccessibilityWarning` and `showClearConfirmation` were all silently inverted when switched off. They are cast now, and `isFlagEnabled()` in `block-editor.js` parses defensively because the `typost_editor_data_{user}` transient can still hold pre-fix values for an hour. Add both when introducing a new flag.
- **Single-setting extension options (v2.3+)**: `typost_admin_options_rows` (echo `<tr>` rows into the core Options tab) + `typost_admin_options_checkboxes` (register the option key, `typost_`-prefixed, so both the REST save and the POST fallback persist it). Checkboxes marked `data-typost-option="1"` are collected generically by `admin-page.js`. Expose the value via `typost_editor_data`, which runs *after* the localized-data transient read, so toggles apply immediately instead of after the hour-long cache.
- **Editor vs Save rendering:** `edit.js` always uses inline styles (for visual preview). `save.js` uses CSS class when `styleClass` is set (for frontend). The editor iframe receives CSS via `enqueue_block_assets`.

### Bundled Glyphs Panel Module (v2.0+)

The Glyphs Panel (an Illustrator-style full-font glyph browser) was originally a separate extension plugin and is **bundled into core** for the 2.0 release. It lives in [glyphs-panel/](glyphs-panel/) and is a self-contained module that consumes core's *public* extension API exactly as an external extension would — it never calls core internals.

- **Loading:** `typography-stylist.php` (`typost_init()`) does `require_once TYPOST_PLUGIN_DIR . 'glyphs-panel/glyphs-panel.php'` then `Typost_Glyphs_Panel::get_instance()`, guarded by `! class_exists('Typost_Glyphs_Panel')` so a leftover/active standalone copy cannot cause a fatal `final class` redeclare. The bundled file also guards `! defined('TYPOST_GP_VERSION')` around its constants for the same reason.
- **No plugin header:** `glyphs-panel/glyphs-panel.php` is the former standalone main file with the `Plugin Name:` header and `plugins_loaded` bootstrap stripped. `TYPOST_GP_PLUGIN_DIR/URL` resolve to the subdirectory automatically via `plugin_dir_path/url(__FILE__)`.
- **Integration points (unchanged from the extension):** `typost_editor_data` (injects `glyphsPanel` data), `typost_editor_assets` (enqueues the lib chain + modal + `editor.js`), `typost_admin_tabs` / `typost_admin_tab_content_glyphs` / `typost_admin_assets` (the Glyphs admin tab). The editor button is injected at the `typost_inline_before_features` and `typost_qft_before_features` JS hook points; insertion uses the `typost-insert-content` CustomEvent (handlers already live in core `assets/js/block-editor.js` and `blocks/typography-stylist/edit.js`).
- **Separate concerns kept separate:** its JS is hand-written ES5 (no build step), its Jest tests live in `glyphs-panel/__tests__/` (picked up automatically by core's `npm test`), and it keeps its own `typost-glyphs-panel` text domain + bundled `glyphs-panel/languages/`. EULA constraint preserved: metadata-only parsing, IndexedDB-only caching, text-rendered glyph cells. See `glyphs-panel/CLAUDE.md` for module internals.
- Other extensions (e.g. Layered Fonts, Animations) **remain separate plugins**.

### Variable Fonts Module (v2.1+)

Variable font support was added in v2.1 as a self-contained module, structured like the Glyphs Panel so it consumes only core's public extension API. It lives in [variable-fonts/](variable-fonts/) — loaded from `typost_init()` behind a `! class_exists('Typost_Variable_Fonts')` guard (the `final class` must never fatally redeclare), constants guarded by `! defined('TYPOST_VF_VERSION')`, own `typost-variable-fonts` text domain + `variable-fonts/languages/`, and Jest tests in `variable-fonts/__tests__/` (auto-collected by core `npm test`). See `variable-fonts/CLAUDE.md` for module internals.

### Paragraph Styles Module (v2.3+)

The Paragraph Styles panel (save/load named typography presets, applied via dropdown in both editors and rendered by CSS class on the frontend) was originally the standalone `typography-stylist-paragraph-styles` extension and is **bundled into core** in v2.3, following the same module pattern. It lives in [paragraph-styles/](paragraph-styles/) — loaded from `typost_init()` behind a `! class_exists('Typost_Paragraph_Styles')` guard, constants guarded by `! defined('TYPOST_PS_VERSION')`, own `typost-paragraph-styles` text domain + `paragraph-styles/languages/`, pure JS logic in `assets/js/lib/ps-utils.js` with Jest tests in `paragraph-styles/__tests__/`. Two fixes landed with the bundling: the panel now dispatches core's `typost-apply-block-properties` event (the standalone still used the pre-2.0 `typost-apply-paragraph-style` name, which nothing listens to), and the admin tab resolves font names through the public API (`get_custom_fonts()` etc. + adopted WP Library fonts) instead of wrong-case option reads. Fit-to-width blocks can be saved as styles: `fontSize: 'fit'` is a first-class style property (stored with its `fitMaxSize` cap and min/pref/max fallback clamp; applying such a style block-level switches the target into fit mode, inline spans degrade to the fallback clamp via the style's CSS class). Options: `typost_paragraph_styles`, `typost_paragraph_styles_next_id`. See `paragraph-styles/CLAUDE.md` for module internals.

### WP Font Library Integration (v2.1+, WP 6.5+)

- **Identity:** the numeric `font_id` stays canonical forever. Registration adds `wp_slug`/`wp_post_id`/`wp_registered_date` fields to the font entry and stamps `_typost_font_id` post meta on the created `wp_font_family` post (ownership marker — rollback never deletes user-created families). Font binaries are NOT copied; `wp_font_face` posts reference the plugin's existing upload URLs.
- **CSS:** entries with a live registration emit `--font-N: var(--wp--preset--font-family--{slug}, "Family", fallbacks)` — the literal `var()` fallback covers plain admin pages (no preset vars) and stale registrations, so content can never break. The frontend `@font-face` path skips a font only when WordPress will **actually print** its faces (`entry_faces_printed_by_wordpress()`: family present in `WP_Font_Face_Resolver::get_fonts_from_theme_json()`, i.e. theme fonts + Library fonts *activated* in global styles). A live registration alone is installed-not-activated — `wp_print_font_faces()` emits nothing for it, so the plugin keeps printing its own `@font-face` (the frontend would otherwise silently fall back to local/system fonts while the editor looks correct). Editor-iframe/admin-preview paths intentionally keep the plugin CSS.
- **Lifecycle:** new uploads auto-register when `typost_auto_register_wp_fonts` is on (default) and WP ≥ 6.5; existing fonts are opt-in (per-font/bulk buttons + dismissible notice on the Custom Fonts tab). A `deleted_post` watcher rolls back registration fields if the family is deleted via the Library UI. Registration REST endpoints require `manage_options`; the editor's adopt endpoint (`POST /typost/v1/wp-fonts/adopt`) requires `edit_posts`.
- **Adoption:** picking an unadopted Library font in the editor allocates a `font_id` and stores a manual-fonts-shaped entry in `typost_adopted_wp_fonts` — the block save format never changes. Adobe Fonts (remote Typekit CSS, EULA) and manual definitions stay plugin-managed by design.

### REST API Endpoints

**Presets:**
- `GET /wp-json/typost/v1/presets` - Get all presets
- `POST /wp-json/typost/v1/presets` - Save new preset (requires `edit_posts` capability)
- `DELETE /wp-json/typost/v1/presets/{id}` - Delete preset (requires `edit_posts` capability)

**Custom Fonts (Uploaded Webfont Kits):**
- `GET /wp-json/typost/v1/fonts` - Get uploaded font kits
- `POST /wp-json/typost/v1/fonts` - Upload font kit ZIP file (multipart/form-data, requires `edit_posts`)
- `DELETE /wp-json/typost/v1/fonts/{id}` - Delete font kit and files (requires `edit_posts`)
- `PATCH /wp-json/typost/v1/fonts/{id}/fallback` - Update fallback fonts (requires `edit_posts`)

**Adobe Fonts (Typekit):**
- `GET /wp-json/typost/v1/adobe-fonts` - Get Adobe Fonts projects
- `POST /wp-json/typost/v1/adobe-fonts` - Add Adobe Fonts project via embed code (requires `edit_posts`)
- `DELETE /wp-json/typost/v1/adobe-fonts/{id}` - Delete Adobe Fonts project (requires `edit_posts`)
- `PATCH /wp-json/typost/v1/adobe-fonts/{id}/fallback` - Update fallback fonts (requires `edit_posts`)

**Custom Font Definitions (Theme/Plugin/CDN Fonts):**
- `GET /wp-json/typost/v1/manual-fonts` - Get custom font definitions
- `POST /wp-json/typost/v1/manual-fonts` - Add custom font definition (requires `edit_posts`)
- `DELETE /wp-json/typost/v1/manual-fonts/{id}` - Delete custom font (requires `edit_posts`)

**WP Font Library (v2.1+, WP 6.5+):**
- `POST /wp-json/typost/v1/fonts/{id}/wp-library` - Register an uploaded font in the Font Library (requires `manage_options` — site-wide configuration)
- `DELETE /wp-json/typost/v1/fonts/{id}/wp-library` - Remove from the Font Library (requires `manage_options`)
- `POST /wp-json/typost/v1/fonts/wp-library/bulk` - Register all unregistered uploaded fonts (requires `manage_options`)
- `POST /wp-json/typost/v1/wp-fonts/adopt` - Adopt a Library font for editor use, allocating a numeric font_id; idempotent (requires `edit_posts` — authors pick fonts)

**Variable Fonts (bundled module):**
- `GET|POST|DELETE /wp-json/typost/v1/variable-font-axes[/{id}]` - Axis definitions per font string ID (requires `manage_options` — site-wide configuration)
- `POST /wp-json/typost/v1/variable-font-axes/{id}/redetect` - Re-read axes from an uploaded font's own files and return them **without** writing the option; the admin form repopulates its rows for review and the user still saves (requires `manage_options`). Uploaded kit fonts only — Adobe/manual fonts have no server-side files and fall back to the browser parser.

**Paragraph Styles (bundled module, v2.3+):**
- `GET|POST /wp-json/typost/v1/paragraph-styles` - List / create paragraph styles (requires `edit_posts` — styles are author-facing content)
- `PATCH|DELETE /wp-json/typost/v1/paragraph-styles/{id}` - Rename/update properties / delete (requires `edit_posts`)

All endpoints include:
- Rate limiting (50 requests/minute per user)
- Nonce verification
- Transient caching where appropriate

### Available OpenType Features

The plugin supports these feature categories (51 features total):
- **Ligatures:** liga, dlig, calt, clig, hlig
- **Stylistic Sets:** ss01-ss20
- **Swashes & Alternates:** swsh, cswh, salt, titl, hist
- **Decorative:** ornm
- **Numerals & Figures:** pnum, tnum, lnum, onum, frac, zero
- **Capitals & Case:** smcp, c2sc, pcap, case
- **Positional Forms:** init, medi, fina, isol
- **Superscript & Ordinals:** sups, subs, ordn
- **Other Features:** kern, locl, rand

Feature data structure in [typography-stylist.php](typography-stylist.php):
```php
array(
    'id' => 'calt',           // OpenType feature code
    'name' => 'Contextual Alternates',
    'category' => 'ligatures', // Used for UI grouping
    'description' => '...'
)
```

### WordPress Dependencies

Block editor JavaScript requires:
- `wp-blocks`, `wp-element`, `wp-components`, `wp-data`
- `wp-rich-text`, `wp-block-editor`, `wp-i18n`, `wp-compose`

## Development Workflow

**Before making any code changes:**
1. Understand the existing code structure
2. Check if tests exist for the code you're modifying
3. Run `npm test` to ensure all tests pass

**When making code changes:**
1. Extract testable logic to utility functions in `utils.js`
2. Update or add tests for modified/new functionality
3. Run `npm test` frequently during development
4. Keep changes focused and atomic

**After making code changes:**
1. Run `npm test` to verify all tests pass
2. Run `npm run build` to rebuild assets
3. Run `npm test` again to ensure build didn't break anything
4. Manually test in WordPress if UI/functionality changed
5. Update documentation if behavior changed

**Development best practices:**
- Write tests BEFORE fixing bugs (test-driven development)
- Never commit code without running tests
- If tests fail, fix them before proceeding
- Extract complex logic to pure functions for easier testing
- Keep tests simple and focused on one thing

## Development

### Environment Requirements

- WordPress 5.8+
- PHP 7.4+
- This is a plugin within a WordPress installation at `c:\wamp64\www\typography-stylist\`
- **Development site URL:** `http://typography-stylist:8080/`
- **Test post with Typography Stylist content:** `http://typography-stylist:8080/?p=13` (Post ID 13, displayed as ?p=13)

### Testing the Plugin

**Unit Tests:**
- This plugin has Jest unit tests for utility functions and business logic
- Test files are located in `blocks/typography-stylist/__tests__/`
- Tests verify the actual implementation by importing from `utils.js`
- **CRITICAL: Always run tests after making code changes**

**Test commands:**
```bash
npm test                  # Run all tests once
npm run test:watch        # Run tests in watch mode
npm test -- --coverage    # See test coverage report
```

**What to test:**
- Pure utility functions (`sanitizeFontFamily`, `buildFeatureSettingsString`)
- Business logic (`determineFeatureToggleAction`)
- Frontend rendering logic (`save.js` - semantic HTML structure, ARIA attributes)
- Accessibility implementation (dual semantic headings, screen reader compatibility)
- Edge cases (empty values, null handling, etc.)

**Manual WordPress Testing:**
1. Ensure plugin is activated in WordPress admin
2. Create/edit a post with heading blocks (H1-H6)
3. Select text and use the Typography Features button in the toolbar
4. Check frontend rendering with browser DevTools to verify `font-feature-settings` CSS
5. **Test responsive font sizing:**
   - Create Typography Stylist block
   - Set font size to "Responsive (Fluid)" in Inspector Controls
   - Adjust all three sliders independently - verify no auto-adjustment occurs
   - Set out-of-order values (e.g., Min: 64, Max: 16) - verify warning message appears
   - Preview in editor at different viewport widths
   - Check frontend with browser DevTools responsive mode (320px, 768px, 1920px)
   - Verify CSS `clamp()` output is correct

**Testing Guidelines:**
- Tests should import and test ACTUAL functions, not mock implementations
- Extract testable logic to `utils.js` for both component and tests to use
- Use AAA pattern: Arrange, Act, Assert
- Test both happy path and edge cases
- See [TESTING.md](TESTING.md) for beginner-friendly testing guide

### Modifying Features or Presets

**To add new OpenType features:** Edit `get_available_features()` in [typography-stylist.php](typography-stylist.php:247-328)

**To add default presets:** Edit `get_default_presets()` in [typography-stylist.php](typography-stylist.php:209-242)

**Enter key / block splitting (v2.3+):**
WordPress decides Enter entirely from core's `splitting` block support: with it, writing-flow calls `__unstableSplitSelection()`; without it, `RichText` inserts a line break. The plugin adds the flag in `filter_block_splitting_support()` (a `block_type_metadata` filter around `register_block_type()`) when `typost_block_enter_line_break` is off — server-side, because the block script and the `typostData` localization are different handles with no guaranteed order. `block.json` stays unchanged so the default is static.
Splitting additionally needs the caret's `attributeKey`, which is why `edit.js` sets `identifier="content"` on the `RichText` — the `content` attribute has no `source`, so core's `findRichTextAttributeKey()` fallback finds nothing and the split silently no-ops *after* writing-flow has already `preventDefault()`ed the key, killing the line break too (Enter would do nothing at all). The identifier is set **only when splitting is enabled**: a live `attributeKey` also arms core's "enter transforms", which would turn a URL-only block into an embed. `edit.js` reads `hasBlockSupport('typost/block', 'splitting', false)` rather than the option, so there is one source of truth. Core intentionally converts the split's tail to the default block (paragraph), matching `core/heading`.

**Filter hooks for extensibility:**
- `typost_available_features` - Filter available features
- `typost_presets` - Filter presets list (renamed from `TYPOST_default_presets`; update any custom integrations using the old hook name)
- `typost_force_enqueue_font_ids` - Force fonts (by numeric ID) to load on every page — for fonts referenced only from theme/extension CSS (v2.1+; see HOOKS.md)
### Code Patterns

**Sanitization:** All user input is sanitized using `sanitize_key()` for IDs, `sanitize_text_field()` for text, and `array_map()` for arrays

**Nonce verification:** REST API uses `wp_create_nonce('wp_rest')` and `check_permissions()` method checks `current_user_can('edit_posts')`

**Localization:** All strings use `__()` with text domain `typography-stylist`

**Debug and Console Logging:**

**JavaScript (Browser Console):**
- **NEVER** use `console.log()`, `console.warn()`, `console.error()`, or `console.debug()` in production code
- WordPress Plugin Directory standards **prohibit** console logging in submitted plugins
- All console statements must be removed before committing
- Browser DevTools and WordPress debug tools provide runtime debugging without polluting production code
- For test files (Jest, Playwright):
  - Use test framework logging mechanisms (e.g., `test.skip()` in Playwright)
  - Never use `console.log()` for conditional test skipping or debugging
  - Test output should integrate with test reporters

**PHP (Server-side Logging):**
- Do NOT add `error_log()` statements to production code
- Only use `error_log()` temporarily when debugging specific issues locally
- Remove all `error_log()` statements before committing changes
- If persistent logging is needed, use WordPress debugging functions with `WP_DEBUG_LOG`

**Rationale:**
- Console/error logging statements violate WordPress Plugin Directory submission standards
- Logging output can expose sensitive information or implementation details
- Production plugins should handle errors gracefully without diagnostic output
- Proper error handling (try/catch, validation) should remain intact without logging side effects

**WordPress Coding Standards Exceptions:**
- Use `// phpcs:disable RuleName -- Reason` to suppress specific PHPCS warnings when justified
- Always provide a clear reason after `--` explaining why the exception is necessary
- Re-enable the rule with `// phpcs:enable RuleName` as soon as possible
- Common valid reasons: performance optimization, security requirements, backward compatibility
- Example: Performance-critical code that reads only 4 bytes vs loading entire multi-MB files

**Translation Management:**
- All user-facing strings MUST be wrapped in translation functions (`__()`, `esc_html__()`, `esc_attr__()`, `sprintf()`)
- After adding new translatable strings, update ALL translation files in this order:
  1. **Base template:** [languages/typography-stylist.pot](languages/typography-stylist.pot)
  2. **French translation:** [languages/typography-stylist-fr_FR.po](languages/typography-stylist-fr_FR.po)
  3. **Spanish translation:** [languages/typography-stylist-es_ES.po](languages/typography-stylist-es_ES.po)
- Format for .pot and .po files:
  ```
  #: path/to/file.php:123
  msgid "String to translate"
  msgstr ""
  ```
- For .po files, the `msgstr` should contain the translation (not empty)
- For strings with placeholders, use `#, php-format` directive and `sprintf()`:
  ```
  #: path/to/file.php:123
  #, php-format
  msgid "Click to apply %s feature"
  msgstr ""
  ```
- **IMPORTANT:** Always update French and Spanish .po files when updating the .pot file - this step is often forgotten!

## Important Notes

- Typography features are stored **inline in post content**, not in post meta
- **Inline styling uses CSS variables (v1.1.6+):** Both block-level and inline fonts use `var(--font-ID)` format for consistent PHP detection and @font-face loading
- **Data attribute naming (v1.1.6+):** Standardized to `data-font-id` (inline) matching `fontId` (block-level) for consistency
- No database migrations needed - uses existing `wp_options` for:
  - `typost_presets` - User-created presets
  - `typost_custom_fonts` - Uploaded webfont kits metadata
  - `typost_adobe_fonts` - Adobe Fonts project configurations
  - `typost_manual_fonts` - Custom font definitions
  - `typost_adopted_wp_fonts` - WP Font Library fonts adopted from the editor picker (v2.1+)
  - `typost_font_replacements` - Replacement mappings + the shared numeric font ID sequence (`next_id`)
  - `typost_paragraph_styles` / `typost_paragraph_styles_next_id` - Paragraph style presets + their ID counter (v2.3+, bundled module)
  - `typost_block_enter_line_break` - Enter key behaviour in the Typography Stylist block (v2.3+, default `'1'` = line break)
  - `typost_glyphs_toolbar_button` / `typost_ps_toolbar_button` - Optional direct-access toolbar buttons for the Glyphs and Paragraph Styles modules (v2.3+, both default off)
- Uploaded font files stored in `wp-content/uploads/typography-stylist/fonts/` with .htaccess protection
- Frontend has zero JavaScript - purely CSS-based rendering
- Block editor UI uses WordPress components (Popover, Button, ToggleControl, PanelBody, RangeControl)
- **Plugin supports two usage methods:**
  1. **Inline Format** - For complete words/phrases in any heading block (H1-H6)
  2. **Typography Stylist Block** - For complex typography with accessibility features
- Do not update the version number unless asked
- **Updates on new features MUST include:**
  1. Running unit tests (`npm test`) to verify no regressions
  2. Adding tests for new utility functions or business logic
  3. Updating the readme files (readme.txt and/or README.md)
  4. Adding new translatable strings to languages/typography-stylist.pot
  5. Running build process if JavaScript/CSS was modified (`npm run build`)
  6. Running tests again after build to ensure everything still works
