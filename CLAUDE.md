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
- Manages presets stored in `wp_options` table (`TYPOST_presets`)
- Constants: `TYPOST_VERSION`, `TYPOST_PLUGIN_DIR`, `TYPOST_PLUGIN_URL`, `TYPOST_PLUGIN_BASENAME`

**Block Editor Integration:**

The plugin provides two distinct interfaces for applying OpenType features:

1. **Inline Editor** [assets/js/block-editor.js](assets/js/block-editor.js)
   - **What:** Toolbar button (with "O" icon) available on standard rich text blocks (core/heading, core/paragraph, etc.)
   - **When:** Use for applying features to complete words/phrases in any heading or paragraph block
   - **How:** Opens a popover with presets, individual features, font controls, and preview
   - **Implementation:** Registers custom format type `typost/typography-features` using WordPress `@wordpress/format-api`
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
- CSS `clamp()` gracefully handles out-of-order values by auto-sorting
- Default sizes for new blocks: 16px / 32px / 64px

**Admin Interface:** [includes/admin-page.php](includes/admin-page.php)
- Tabbed interface showing: Presets, Font Features, Custom Fonts, Accessibility, Help
- Font management: Upload webfont kits, Adobe Fonts integration, custom font definitions
- Font preview for testing OpenType features
- Inline styles and jQuery for tab switching
- Located at Settings → Typography Stylist

### Data Flow

1. User selects text in heading block → clicks toolbar button
2. Popover shows presets (from `typostData.presets`) and features (from `typostData.features`)
3. User toggles features or selects preset → clicks Apply
4. JavaScript applies inline format with `data-features` attribute and `font-feature-settings` style
5. Frontend displays with CSS only (no JavaScript required)

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

All endpoints include:
- Rate limiting (50 requests/minute per user)
- Nonce verification
- Transient caching where appropriate

### Available OpenType Features

The plugin supports these feature categories:
- **Ligatures:** liga, dlig, calt
- **Stylistic Sets:** ss01-ss05 (hardcoded, but supports through ss20)
- **Alternates:** swsh, cswh, salt, titl, ornm

Feature data structure in [typography-stylist.php](typography-stylist.php:247-328):
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
- This is a plugin within a WordPress installation at `c:\wamp64\www\wplayground\`

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

**Filter hooks for extensibility:**
- `TYPOST_available_features` - Filter available features
- `TYPOST_default_presets` - Filter default presets

### Code Patterns

**Sanitization:** All user input is sanitized using `sanitize_key()` for IDs, `sanitize_text_field()` for text, and `array_map()` for arrays

**Nonce verification:** REST API uses `wp_create_nonce('wp_rest')` and `check_permissions()` method checks `current_user_can('edit_posts')`

**Localization:** All strings use `__()` with text domain `typography-stylist`

**Debug Logging:**
- Do NOT add error_log() statements to production code
- Only use error_log() temporarily when debugging specific issues locally
- Remove all error_log() statements before committing changes
- If persistent logging is needed, use WordPress debugging functions with WP_DEBUG_LOG

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
- No database migrations needed - uses existing `wp_options` for:
  - `TYPOST_presets` - User-created presets
  - `TYPOST_custom_fonts` - Uploaded webfont kits metadata
  - `TYPOST_adobe_fonts` - Adobe Fonts project configurations
  - `TYPOST_manual_fonts` - Custom font definitions
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
