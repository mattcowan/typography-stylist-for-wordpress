# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file is the short guide: what the plugin is, where things live, how to work, and the hard rules. The reasoning behind the rules (measurements, rejected alternatives, review findings) is in the design notes under [docs/decisions/](docs/decisions/), one file per topic. Before you change code that a row of "Before you change it, read the note" names, open that note: it records traps that cost days to find.

## Project Overview

This is a WordPress plugin that adds advanced OpenType typography features (ligatures, stylistic sets, swashes) to headlines in the Gutenberg block editor. It provides an inline text selection interface with live preview for applying CSS `font-feature-settings` to heading blocks.

## Hard rules

Each rule protects saved content, block validity or a release. The link names the note that explains it.

- **Saved markup:** do not change what `save()` writes for existing blocks without a block deprecation, and never edit the frozen v2 deprecation; px sizes saved before #233 stay byte for byte. Read [font-size-units-and-zoom.md](docs/decisions/font-size-units-and-zoom.md) before you change `save.js` or `deprecated.js`.
- **Block supports reach the frontend at render time** (`Typost::add_block_support_attributes()`): do not change `save()` to fix a block support. See [block-supports-at-render-time.md](docs/decisions/block-supports-at-render-time.md).
- **Saved-markup fixtures:** `tests/e2e/saved-markup.spec.js` opens one fixture per save format. A change to `save()` or to the inline span writers regenerates them with `generate.js` and reviews each file's diff: a changed fixture is a changed save format. See [tests/e2e/fixtures/saved-markup/README.md](tests/e2e/fixtures/saved-markup/README.md).
- **`fontSizeUnit` in `block.json` keeps the default `'rem'`:** it also decides how saved blocks parse, so a per-site default would make them invalid. See [font-size-units-and-zoom.md](docs/decisions/font-size-units-and-zoom.md).
- **Fit line data is content:** `fitLineSizes`, `fitWordSizes` and `fitLineHangs` never go into the apply bridge or into paragraph styles. See [font-size-units-and-zoom.md](docs/decisions/font-size-units-and-zoom.md) and [first-letter-hang.md](docs/decisions/first-letter-hang.md).
- **kses:** a new CSS property written into post content must be checked against kses (serialized markup with `&quot;` through `wp_kses_post()`), and added to `Typost::SAFE_CSS_PROPERTIES` when kses drops it. See [kses.md](docs/decisions/kses.md).
- **Format attributes:** every `data-*` attribute the inline editor writes must be listed in `registerFormatType('typost/features', { attributes })`, or a rebuild drops it. See [text-case.md](docs/decisions/text-case.md).
- **Hooks:** HOOKS.md and the code list the same hooks; `__tests__/hooks-doc.test.js` fails otherwise. Add the HOOKS.md entry with the hook ([TESTING.md](TESTING.md), "When You Add or Change a Hook").
- **`typostData` flags:** cast a boolean option in PHP before it is localized (an uncast `'0'` arrives as the truthy string `"0"`), and parse it defensively in JS (`isFlagEnabled()`). See [extension-api.md](docs/decisions/extension-api.md).
- **Twins:** logic that exists in more than one place (PHP and JS style CSS generators, `normalizeHang()`, `caseDeclarations()`, …) changes in every copy in the same commit. [docs/twins.md](docs/twins.md) lists each twin and the test that pins it.
- **Code shared by the two editor builds** goes in a CommonJS module in `assets/js/` that both load; never `require` `utils.js` from the inline editor's browserify build. See [docs/twins.md](docs/twins.md), "How to add a twin".
- **Save explicit values only:** these four paths persist only `explicitFontId` / `explicitFontWeight` / `selectionFontWeight`, never the inherited or rendered value: Detach, Save as style, Update Style, and inserted glyphs. Convert to block and the block transform write the rendered weight on purpose (`getEffectiveFontWeight()`, `detectBlockComputedWeight()`), so a theme-bold heading stays bold; do not change them to explicit values. The exception is a source with no text, which gets `fontWeight: ''` (no weight, the theme's), like "Remove all styling" (#412). See [font-and-weight-resolution.md](docs/decisions/font-and-weight-resolution.md).
- **Remove all styling:** every attribute in `block.json`, and every attribute a `supports` key adds, is in exactly one list of `assets/js/theme-look.js`; `assets/js/__tests__/theme-look.test.js` fails otherwise. A weight reset is `fontWeight: ''`, never `'400'` (which writes `font-weight: 400`). See [remove-all-styling.md](docs/decisions/remove-all-styling.md).
- **No side effects in a constructor:** the inline editor (`TypographyFeaturesControl` in `assets/js/block-editor.js`) only creates its extension callbacks in the constructor and registers them in `componentDidMount()`, removing them in `componentWillUnmount()`; with `SCRIPT_DEBUG` on, StrictMode constructs an instance it never mounts and runs mount, unmount, mount on the one it keeps (#386). Every registration that a component makes needs its removal in a mount and unmount pair (or a `useEffect` with cleanup). See [extension-api.md](docs/decisions/extension-api.md).
- **The new-block variation:** one default inserter variation, `typost-new-block` (`assets/js/new-block-tag.js`), carries the #248 unit and the remembered tag on every site, and its `isActive` matches every Typography Stylist block no other variation claims, so code that reads the active variation of `typost/block` gets it. Give it no title or icon, register no second default variation, and keep block.json's `tagName` default `'h2'`. See [new-block-variation.md](docs/decisions/new-block-variation.md).
- **JSON post content** goes into `wp_insert_post()` / `wp_update_post()` as `wp_slash( wp_json_encode( … ) )`. See [font-library-integration.md](docs/decisions/font-library-integration.md).
- **Admin REST calls** wrap the URL in `typostWithUserLocale()` (`_locale=user`) and set `dataType: 'json'`. See [admin-settings-page.md](docs/decisions/admin-settings-page.md).
- **Localized admin strings** in a nested array (`typostAdmin.strings`) arrive entity-encoded: decode them with `typostDecodeEntities()` before `.text()`, `textContent`, `alert()` or `confirm()`. See [admin-settings-page.md](docs/decisions/admin-settings-page.md).
- **Editor font scan:** never `getBlocks()` (it leaves out the inner blocks of synced patterns and template parts); use `getClientIdsWithDescendants()` + `getBlockAttributes()`. See [font-loading.md](docs/decisions/font-loading.md).
- **Modals:** a notice that mounts with a plugin modal passes `spokenMessage=""`; scroll containers get `tabIndex={-1}`; the settings tabs have no `aria-controls`. See [screen-reader-rules.md](docs/decisions/screen-reader-rules.md).
- **New option:** delete it in `uninstall.php`, and export it or list it in `Typost_Export::NOT_EXPORTED` with a reason (`tests/Unit/ExportRegistryTest.php` fails otherwise). See [export-import.md](docs/decisions/export-import.md).
- **Write bursts:** all `typost/v1` write routes share 50 writes per minute per user; debounce admin saves. See [rest-api.md](docs/decisions/rest-api.md).
- **New typography property or text-styling setting:** walk [docs/typography-property-checklist.md](docs/typography-property-checklist.md) end to end.
- **No logging:** no `console.*` in JavaScript and no `error_log()` in PHP, in production code or tests. See [code-patterns.md](docs/decisions/code-patterns.md).
- **Translations:** wrap user-facing strings in `__()` and its variants with the file's text domain; after adding strings, update the `.pot` and the fr_FR and es_ES `.po` of that catalog (each bundled module has its own). See [code-patterns.md](docs/decisions/code-patterns.md).
- **Floor:** PHP 7.4+ and WordPress 5.8+: no PHP 8 syntax, and no WordPress API newer than 5.8 without a feature check.
- **Version numbers:** do not update the version number unless asked.

## Before you change it, read the note

| If you are about to change … | Read first |
|---|---|
| how a font size is written (block, inline span, paragraph style), `fontSizeUnit`, the responsive clamp, the zoom notice, or the new-content unit setting | [font-size-units-and-zoom.md](docs/decisions/font-size-units-and-zoom.md) |
| fit-to-width measurement, fit line markup, the `.typost-fit` CSS, or a pseudo-element on the block wrapper | [font-size-units-and-zoom.md](docs/decisions/font-size-units-and-zoom.md), [fit-to-width-natural-width.md](docs/decisions/fit-to-width-natural-width.md) |
| the First Letter Hang, any `::first-letter` rule, or `.typost-plain` | [first-letter-hang.md](docs/decisions/first-letter-hang.md) |
| Case, `text-transform`, small caps, or the attributes registered on the format type | [text-case.md](docs/decisions/text-case.md) |
| how inline spans are written, merged, nested, or rebuilt on apply | [inline-styling-architecture.md](docs/decisions/inline-styling-architecture.md), [font-size-units-and-zoom.md](docs/decisions/font-size-units-and-zoom.md) |
| a block support in `block.json`, the `render_block` filters, or the Line indent | [block-supports-at-render-time.md](docs/decisions/block-supports-at-render-time.md) |
| any CSS property written into post content | [kses.md](docs/decisions/kses.md) |
| the settings page, `admin-page.js`, or a REST call or localized string in an admin script | [admin-settings-page.md](docs/decisions/admin-settings-page.md) |
| which fonts load on the frontend or in the editor, or the detection caches | [font-loading.md](docs/decisions/font-loading.md) |
| Font Library registration, adoption or `@font-face` printing | [font-library-integration.md](docs/decisions/font-library-integration.md) |
| a REST route, a permission callback, or the rate limit | [rest-api.md](docs/decisions/rest-api.md) |
| a hook, a toolbar button, the apply bridge, a `typostData` flag, or an extension option | [extension-api.md](docs/decisions/extension-api.md), [HOOKS.md](HOOKS.md) |
| the font id or weight that the editors report or save | [font-and-weight-resolution.md](docs/decisions/font-and-weight-resolution.md) |
| the heading level button, the tag a new block starts with, or the block's inserter variation | [new-block-variation.md](docs/decisions/new-block-variation.md) |
| "Remove all styling", "Reset Entire Block", a block made from an empty block, `fontWeight: ''`, or the weight a font pick writes | [remove-all-styling.md](docs/decisions/remove-all-styling.md), [font-and-weight-resolution.md](docs/decisions/font-and-weight-resolution.md) |
| a modal, a notice inside a modal, focus handling, or the settings tabs | [screen-reader-rules.md](docs/decisions/screen-reader-rules.md) |
| how a bundled module loads, or the Paragraph Styles module | [bundled-modules.md](docs/decisions/bundled-modules.md), then the module's own `CLAUDE.md` |
| Export & Import, or the list of stored options | [export-import.md](docs/decisions/export-import.md), [stored-options.md](docs/decisions/stored-options.md) |
| the OpenType feature list or the default presets | [opentype-features.md](docs/decisions/opentype-features.md) |
| what Enter does in the block, or the block RichText's props (`identifier`) | [enter-key-splitting.md](docs/decisions/enter-key-splitting.md) |
| tests, or what to check by hand | [testing-practices.md](docs/decisions/testing-practices.md), [TESTING.md](TESTING.md) |
| sanitization, nonces, logging, PHPCS exceptions, or translation catalogs | [code-patterns.md](docs/decisions/code-patterns.md) |
| logic that has a copy elsewhere | [docs/twins.md](docs/twins.md) |
| how properties are listed by hand (before you propose a property registry) | [docs/property-registry-design.md](docs/property-registry-design.md) |

## Architecture

### Core Plugin Structure

**Main Plugin File:** [typography-stylist.php](typography-stylist.php)
- Singleton class `Typost` handles all WordPress integration
- Enqueues block editor and frontend assets
- Registers REST API endpoints at `/wp-json/typost/v1/`
- Manages presets stored in `wp_options` table (`typost_presets` — note: all option keys are lowercase `typost_*`; PHP constants are the uppercase ones)
- Constants: `TYPOST_VERSION`, `TYPOST_PLUGIN_DIR`, `TYPOST_PLUGIN_URL`, `TYPOST_PLUGIN_BASENAME`
- Font subsystem modules in `includes/`: `Typost_Font_Sources` (option-backed font storage, shared font ID sequence, replacements) and `Typost_Font_Library_Bridge` (WP Font Library read/registration/adoption, WP 6.5+ feature-gated). `Typost` keeps delegating wrappers, so the public extension API (`get_custom_fonts()` etc.) is unchanged.
- Services in `includes/` (#360): `Typost_Rest_Controller` (REST routes, their handlers and the write rate limit), `Typost_Font_Kit_Upload` (font kit ZIP processing), `Typost_Assets` (editor, canvas and admin enqueueing), and `includes/available-features.php` (the feature list). Each takes the `Typost` instance, calls only its public methods, and registers no hook itself (the three classes contain no `add_action` or `add_filter`). Every public method `Typost` had before #360 is still public on `Typost`; the ones whose body moved are one-line wrappers that call the service. Eight former private helpers became public, marked `@internal`.

**Block Editor Integration:**

The plugin provides two distinct interfaces for applying OpenType features:

1. **Inline Editor** [assets/js/block-editor.js](assets/js/block-editor.js)
   - **What:** Toolbar button (with the swash "T" icon) available on standard rich text blocks (core/heading, core/paragraph, etc.)
   - **When:** Use for applying features to complete words/phrases in any heading or paragraph block
   - **How:** Opens a modal with presets, individual features, font controls, and preview
   - **Implementation:** Registers custom format type `typost/features` using WordPress `@wordpress/format-api`
   - **Code (#357):** `assets/js/block-editor.js` keeps the class component and the format registration; its logic is in `assets/js/inline-editor/` (11 CommonJS modules), bundled with browserify into `block-editor.min.js`
   - **Output:** Applies formatting using inline `<span class="typost-styled" data-features="..." style="font-feature-settings: ...">`
   - **Storage:** Features are stored directly in post content (no separate meta table)
   - **Note:** There is no "Apply" button: since 2.0.0 each change applies on its own. A feature toggle and a preset apply at once; sliders (400 ms), selects (300 ms) and the font size (600 ms) are debounced

2. **Typography Stylist Block** [blocks/typography-stylist/](blocks/typography-stylist/)
   - **What:** Custom Gutenberg block with block-level controls in the sidebar PLUS inline text styling
   - **When:** Use for complex typography with accessibility features or when styling partial words
   - **Components:**
     - **Inspector Controls (Sidebar):** Block-level settings for font family, weight, size, letter spacing, and OpenType features
     - **Quick Feature Toggles (Modal):** Appears when text is selected within the block, allows inline styling of selected text with `<span class="typost-styled">` elements. Provides controls for letter spacing, font size, font family, font weight, and OpenType features (similar to inline editor but scoped to Typography Stylist block content)
   - **Features:**
     - Dual content approach: clean semantic heading for screen readers, styled version for visual display
     - Built with JSX/React using `@wordpress/scripts` build toolchain
     - Code (#356): `edit.js` is the composition root; effects and listeners are in `hooks/`, the Quick Feature Toggles and sidebar handlers in `qft/` (factories that take one context object and are attached in a fixed order, `__tests__/qft-factory-context.test.js`), and the QFT modal and Inspector panels are render functions in `components/` that `Edit` calls as plain functions, so they must not call React hooks (`__tests__/render-functions-no-hooks.test.js`)
     - Block toolbar (v2.4.0): "Change heading level" shows the current tag and remembers the last pick for new blocks (#409, #410), and "Remove all styling" takes the block back to the theme's look (#411)
     - Supports responsive/fluid font sizing
     - ARIA markup with configurable screen reader classes (visually-hidden, sr-only, custom)

### Modules and subsystems

- **Bundled modules:** the Glyphs Panel (`glyphs-panel/`), Variable Fonts (`variable-fonts/`) and Paragraph Styles (`paragraph-styles/`) modules use only core's public extension API; each has its own `CLAUDE.md`. Bundling rules: [bundled-modules.md](docs/decisions/bundled-modules.md).
- **Export & Import** (`includes/class-typost-export*.php`, `assets/js/admin-export.js`): [export-import.md](docs/decisions/export-import.md).
- **WP Font Library integration** (WordPress 6.5+, `includes/class-typost-font-library-bridge.php`): [font-library-integration.md](docs/decisions/font-library-integration.md).
- **REST API** (namespace `typost/v1`): [rest-api.md](docs/decisions/rest-api.md). **Stored options:** [stored-options.md](docs/decisions/stored-options.md).

### WordPress Dependencies

Block editor JavaScript requires:
- `wp-blocks`, `wp-element`, `wp-components`, `wp-data`
- `wp-rich-text`, `wp-block-editor`, `wp-i18n`, `wp-compose`

## Development Workflow

**Before making any code changes:**
1. Understand the existing code structure
2. Check if tests exist for the code you're modifying
3. Run `npm test` to ensure all tests pass

**When adding a new typography property or text-styling setting:** walk [docs/typography-property-checklist.md](docs/typography-property-checklist.md) end to end. A property can be fully wired in core (editors, state filter, apply bridge, spans) and still silently break the Paragraph Styles round-trip — `fontStyle` shipped exactly that way and saved styles dropped italic until the module-side touchpoints were added.

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

### Testing the Plugin

**Unit Tests:**
- This plugin has Jest unit tests for utility functions and business logic
- Test files are located in the `__tests__/` folders: `blocks/typography-stylist/`, `assets/js/`, each module (`glyphs-panel/`, `paragraph-styles/`, `variable-fonts/`), `scripts/`, `tests/e2e-sr/` and the plugin root; PHPUnit tests are in `tests/Unit/`, Playwright tests in `tests/e2e/`
- Tests verify the actual implementation by importing from `utils.js`
- **CRITICAL: Always run tests after making code changes**

**Test commands:**
```bash
npm test                  # Run all tests once
npm run test:watch        # Run tests in watch mode
npm test -- --coverage    # See test coverage report
```

PHPUnit: `npm run test:php` (`tests/Unit/`). Playwright: `npm run test:e2e` (`tests/e2e/`); `npm run test:sr` runs the NVDA journeys (`tests/e2e-sr/`) and takes over the keyboard. CI (`.github/workflows/ci.yml`) runs the tests and the build on pushes to main and on pull requests, and the e2e suite in wp-env on pull requests to main and pushes to main (#373).

## Important Notes

- Typography features are stored **inline in post content**, not in post meta
- **Inline styling uses CSS variables (v1.1.6+):** Both block-level and inline fonts use `var(--font-ID)` format for consistent PHP detection and @font-face loading
- **Data attribute naming (v1.1.6+):** Standardized to `data-font-id` (inline) matching `fontId` (block-level) for consistency
- Uploaded font files stored in `wp-content/uploads/typography-stylist/fonts/` with .htaccess protection
- Frontend has zero JavaScript - purely CSS-based rendering
- Block editor UI uses WordPress components (Modal, Button, ToggleControl, SelectControl, PanelBody, RangeControl, Notice)
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
