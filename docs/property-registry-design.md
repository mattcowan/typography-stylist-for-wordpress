# Property registry: design, proof and decision (#359)

Status: **decided on 2026-11-11: the run-time registry is dropped (option A).** The one-property proof described here was built, measured and reviewed, and was not merged. This document is the record: what the registry would be, what the proof showed, why it was dropped, and what would change the answer. Part of #355. Measured on `main` at 936ebff (after #356, #357 and #360 were merged).

The question: should one description per typography property (a "registry") drive the code paths that today list every property by hand — capture, diff, normalize, sanitize, CSS, Based On, export — so that a new property is one entry instead of the ~40 steps in [typography-property-checklist.md](typography-property-checklist.md)?

## 0. Summary

- **Edit sites per new plain property.** In the Paragraph Styles module, `letterSpacing` is handled at 17 sites: 10 in the generic paths (capture, diff, normalize, client CSS, sanitize, server CSS, `EMPTY_PROPERTY_VALUES` ×2, `propertyValuesEqual()` / `property_values_equal()`) and 7 that stay code under any registry (Detach, the admin card row, three admin form sites, the form field, the Detach notice label). A registry turns the 10 into one entry. Across the plugin the property is on 248 lines in 30 shipped JS and PHP files, 216 of them in 25 files outside the module (case-insensitive search for `letterSpacing`, `letter-spacing` and `data-letterspacing`; tests, builds, minified files, `deprecated.js` and catalogs excluded; a few matches are unrelated UI `letter-spacing` declarations). Those outside lines are both editors, `save.js`, the Quick Feature Toggles, the apply bridge and the span readers and writers, which a registry reaches only in small part (section 2).
- **Proof.** For `letterSpacing`, one entry in a JSON file replaced the six hand-written branches in capture, diff, normalize, client CSS, sanitize and server CSS. Output was byte for byte the same: PHP characterization (125 to 126 cases), JS characterization (2,571 to 2,574 cases; the counts depend on how many styles the shared test site held at each run), the real editor through Save, (modified), Update Style, apply and Detach, 12 existing posts opened in the editor and on the frontend with the same block validity, saved content and attributes, and the end-to-end suite. An independent review run gave the same result. Not merged (section 9).
- **What the machinery costs.** The registry's own code added 26 decision points of JS and 16 of PHP; the first property removed 6. For a full module migration the estimate is 302 → about 225 decision points in the seven functions it touches, about −25 %, with the rule kinds counted in the machinery (section 5). Because `ps-utils.js` has no build step, the run-time version also needs a browser global printed by PHP, with a silent data-loss failure mode if it is missing (section 3).
- **How much becomes data.** Of the 21 style properties, between 7 and 17 need an escape hatch, depending on where the line between "a rule kind" and "a function the entry names" is drawn (section 2.3). Under the generous rule hatches are a minority, so the issue's own test ("a registry that needs an escape hatch for most properties is not a win") does not settle the question.
- **Why it was dropped.** The roadmap. The next style properties are #198 (rules, borders, shading: three groups with colors), #209 (a language: an HTML attribute, not a CSS declaration), #210 (a drop cap that references another style and uses `::first-letter`) and #216 (underline and strikethrough: two groups with colors). None is a plain single-value property, so the rule kinds a registry would build first serve only properties that already exist, while every new property would arrive as an escape hatch. The edit-site saving is real but small (10 → 1 per plain property, with no plain property planned), and the run-time risk of section 3.2 is not.
- **What would change the answer:** several more plain single-value properties planned. Then option (a) of section 3.2 (per-language data tables held by one parity test) is the cheap way to start, with no run-time file, global or build step.
- **What a test can and cannot catch.** The motivating bug, `fontStyle`, was not a property wired in core and missed in some module paths: before commit f4b131a (2026-08-23) `paragraph-styles.php` did not mention `fontStyle` at all, and the `normalizeApplyProperties()` docblock in `ps-utils.js` excluded it on purpose ("styles cannot express italic"). It was a reasoned exclusion that was wrong. A test that classifies every key core reports or bridges, as a style property or as excluded with a reason, catches a key nobody has classified, and a classified property missing from a list it reads (`EMPTY_PROPERTY_VALUES`, the CSS fixtures, `everyProperty()`); catching one missing from capture, diff or normalize needs the path-driving step of section 7. Neither it nor a registry can catch a wrong decision: the author of that time would have listed `fontStyle` as excluded with the reason already written. A registry does make partial wiring inside the module impossible for its own properties, but that alone does not outweigh section 2.3, so the proposed follow-up is the classification test (section 7).

## 1. Inventory

Built from the code, not the checklist. "Block attr" is `blocks/typography-stylist/block.json`; "span" is what the inline editor and the Quick Feature Toggles (QFT) write on `<span class="typost-styled">` (format attributes in `assets/js/block-editor.js`, writers in `assets/js/inline-editor/apply-features.js` and `blocks/typography-stylist/utils.js`); "style key" is what `sanitize_properties()` (`paragraph-styles/paragraph-styles.php`) stores. "Owned" = style-owned: `normalizeApplyProperties()` gives it a default so applying a style without it resets the editor. "Reported" = `isStyleModified()` compares it only when the editor state has the key. "Empty" = the Based On unset value (`EMPTY_PROPERTY_VALUES`, `groupEmptyValue()`). "Export" = handling in `Typost_PS_Transfer` (plain = the stored value is copied and re-sanitized on import).

### 1.1 Style properties (paragraph styles)

| Style key | Block attr (default) | Span | Sanitize (PHP) | Capture (`buildPropertiesFromState`) | Diff (`isStyleModified`) | Normalize | CSS (main rule unless noted) | Based On | Export | Special cases |
|---|---|---|---|---|---|---|---|---|---|---|
| `fontId` | `fontId` (0); legacy `fontFamily` ('') | `data-font-id`, `data-font`; `font-family: var(--font-N)` | `absint` | `persistableFontId()`: `explicitFontId`, else `fontId`/`selectedFontId`; stored when truthy | `String()` compare of the persistable id vs stored, 0 default | 0 | `font-family: var(--font-N)` (PHP `absint`, JS `abs(phpInt)`) | empty 0; compare `abs(int)` | **mapped**: file font key (`key_for_font_id()` / `import_font_id()`) | rendered vs explicit channel (#278); font detection loads the face (`resolved_font_id()`) |
| `fontWeight` | `fontWeight` ('400') | `data-fontweight`; `font-weight` | `sanitize_text_field` (no validation) | `persistableFontWeight()`, stored when non-empty | unset = '400' on both sides | '400' | numeric 1–1000 → int, or `normal`/`bold`/`lighter`/`bolder` | empty '' | plain | rendered vs explicit (#278); `resolveWeightToWrite()` decides whether a span writes it (#254) |
| `fontStyle` | `fontStyle` ('') | `data-fontstyle`; `font-style` | enum `normal`/`italic`/`oblique`; '' kept with `$keep_empty` | `persistableFontStyle()` (`explicitFontStyle`), stored when non-empty | explicit value vs stored, '' default | '' | enum, `font-style: X` | empty '' | plain | `<em>`-derived italic must never be captured (paragraph-styles/CLAUDE.md) |
| `fontSize` + `fontSizeUnit`, `fontSizeMin`, `fontSizePreferred`, `fontSizeMax`, `fitMaxSize` | `fontSize` ('inherit'), `fontSizeUnit` ('rem', enum), min/pref/max (16/32/64), `fitMaxSize` (0); content attrs `fitLineSizes`, `fitWordSizes` | `data-fontsize`, `-min`, `-preferred`, `-max`; `font-size` (px, rem, `clamp()`); `data-fitscale` (em, QFT) | `sanitize_text_field` for the mode; trio `absint` only for responsive/fit; `fitMaxSize` `absint`; unit enum `px`/`rem` | mode when not 'inherit'; unit = site's new-content unit; trio for responsive/fit; `fitMaxSize` for fit | mode, then trio (16/24/32 defaults), then fit cap | 'inherit'; trio and cap deliberately not normalized | fixed: `Npx` or `px_to_rem` rem; responsive/fit: `clamp()` with `responsive_zoom_vw()` for rem | **group** led by `fontSize`, empty 'inherit' | plain | unit kept on Update Style (`buildPropertiesForStyleSave`); fit lines measured in content; #233/#234/#235/#248 traps (root CLAUDE.md) |
| `letterSpacing` | `letterSpacing` (0) | `data-letterspacing`; `letter-spacing: N/1000em` | `intval` when `isset` (no range) | `state.letterSpacing` as is when truthy | `(a \|\| 0) !== (b \|\| 0)`, always compared | 0 | `letter-spacing: intval/1000 em` when non-empty | empty 0; compare `(int)` | plain | the proof property |
| `lineHeight` | `lineHeight` (0); separate core support `typography.lineHeight` | `data-lineheight`; `line-height` | `round(floatval, 3)` | `roundLineHeight()` when truthy | tolerance 0.0005 | 0 | `line-height: floatval` (JS `phpFloatStr`) | empty 0; compare tolerance | plain | float noise (QA PS-8) |
| `features` | `features` ([]) | `data-features` (comma list); `font-feature-settings`; raw `data-feature-settings` (Glyphs, never a style) | `array_map('sanitize_key')` | `features` or `selectedFeatures` when non-empty | sorted lists | [] | `"tag" 1` list (PHP `esc_attr`, JS `^[a-z0-9_-]+$`) | empty []; compare sorted | plain | import warns on features the font hides (`font_support_warnings()`); nested First line merges lists |
| `fontVariationSettings` | `fontVariationSettings` ('') | `data-font-variation-settings`; `font-variation-settings` | `sanitize_text_field` when non-empty; '' with `$keep_empty` | when truthy | string, '' default | '' | parsed and rebuilt from `"tag" n` pairs | empty '' | plain | import warns on axes the font lacks; kses before WP 7.0.1 (root CLAUDE.md) |
| `initialHang` | `initialHang` (0); content `fitLineHangs` | none (block only) | `normalize_hang()`, stored when > 0; 0 with `$keep_empty` | `normalizeHang() > 0` | reported only; `normalizeHang()` | 0 | `--typost-hang: N`, plus `core_block_hang_css()` rules after the style | empty 0; compare normalized | plain | three `normalizeHang()` copies; `buildPropertiesForStyleSave` carries it from the base style |
| `textCase` + `fakeSmallCaps` | `textCase` (''), `fakeSmallCaps` (true) | `data-textcase`, `data-fakesmallcaps`; `caseDeclarations()` | enum `TEXT_CASE_VALUES`; `fakeSmallCaps` only `false`, only with small caps | when set; `fakeSmallCaps: false` only | reported only; normalized + effective fake small caps | '' / true | `case_declarations()` (2–3 declarations) | **group**, empty '' | plain | three `caseDeclarations()` copies |
| `alignment` + `alignLast` | none (block `textAlign` is separate and overrides) | none | `normalize_alignment()`, `normalize_align_last()` | normalized, last only for justify | reported only | not normalized (style-only) | **second, guarded rule** (`ALIGNMENT_GUARD`), not for fit | **group**, empty '' | plain | Detach keeps it as the block's own (#207) |
| `wordSpacing` | none | none | `intval` clamped to −500…1000 | `phpInt` when non-zero | reported only, `phpInt` | not normalized | `word-spacing: N/1000em`, not for fit | empty 0; compare `(int)` | plain | same value writer as `letterSpacing`, plus a fit guard and a range |
| `textWrap` | none | none | enum; '' with `$keep_empty` | normalized when set | reported only | not normalized | `text-wrap: X` + `text-wrap-mode: inherit`, not for fit | empty '' | plain | |
| `hyphens` + `hyphenateLimitWord`/`Before`/`After`, `hyphenateCharacter` | none | none | `hyphenation_properties()` | `hyphenationProperties()` | reported only, group signature | not normalized | `hyphenation_declarations()` (up to 5), not for fit | **group**, empty '' | plain | character validated against CSS/HTML breakouts |
| `indentStart`, `indentEnd`, `spaceBefore`, `spaceAfter` | none (core spacing support is separate) | none | `normalize_length()` loop over `SPACING_PROPERTIES` | `copyLayoutProperties()` | reported only, normalized | not normalized | **separate rule set** `paragraph_layout_css()` (padding + border-box, `:has()` on the wrapper), never on spans | empty ''; compare normalized | plain | already list-driven today |
| `firstLineIndent` + `indentAfterSame` | none (core `textIndent` support is separate, #348) | none | `normalize_length(…, true)`; `indentAfterSame` only `true`, only positive | `copyLayoutProperties()` | reported only, group | not normalized | layout rule set, sibling rule for "after same" | **group**, empty '' | plain | Detach keeps it in core's Text indent on WP 7.0+ (#348) |
| `textColor` | none (core `color.text` support is separate and wins) | none | `normalize_color(…, true)` | `normalizeColor()` | reported only, `comparableColor()` | not normalized | `color: …` plus a `.has-text-color` rule and a forced-colors rule | empty ''; compare by palette slug | **mapped**: palette slug + fallback | contrast notice in the admin form |
| `textStrokeWidth` + `textStrokeColor`, `textStrokePosition` | none | none | `normalize_stroke_width()`, color, `'behind'` only | `strokeProperties()` | reported only, group | not normalized | `stroke_declarations()` | **group**, empty 0 | **mapped** color | |

Not style properties, listed so the boundary is explicit: `paragraphStyleId` / `styleClass` / `data-style-id` (the style reference itself), `layeredConfigId` / `animationConfigId` / `data-animation-id` (extension-owned, never captured), `data-feature-settings` (Glyphs, per glyph), `data-fitshift` (QFT), `fitLineSizes` / `fitWordSizes` / `fitLineHangs` (content measured by the block), `tagName`, `screenReaderClass`, `content`, and the record fields `basedOn`, `grepRules`, `nestedRules`.

### 1.2 Existing per-property tables

The code already has small registries, each with its own copy of a property list:

- `EMPTY_PROPERTY_VALUES` and `BASED_ON_GROUPS` (`ps-utils.js` and `paragraph-styles.php`, twins).
- `SPACING_PROPERTIES`, `HYPHENATE_LIMIT_KEYS` (both languages).
- `DETACH_SPAN_GROUPS`, `PARAGRAPH_STYLE_OWNED_ATTRS`, `PARAGRAPH_STYLE_OWNED_PROPS` (`blocks/typography-stylist/utils.js`): property ↔ span attribute ↔ CSS property, for Detach from a selection and for the conflict check.
- Two defaults objects that drifted apart: `normalizeApplyProperties()` (`ps-utils.js`) has 11 keys; `resolveSelectionStyleState()` (`utils.js`) has 14 — it adds `fontSizeMin`, `fontSizePreferred`, `fontSizeMax` and `fitMaxSize`, has no `initialHang`, and defaults `fontWeight` to `''` where the other has `'400'`. Each difference may be deliberate (a selection has no hang; an unset weight is not 400 there), but nothing records which.

**One property, three equalities.** `letterSpacing` is compared three ways: `isStyleModified()` uses `(a || 0) !== (b || 0)` (so `'40'` differs from `40`), `propertyValuesEqual()` / `property_values_equal()` use `phpInt` / `(int)` (equal), and `stylePropertyOverrides()` (`utils.js`) uses `Number()` (equal). Keeping output unchanged, the proof kept all three. A registry that gives each property one `compare` rule forces a decision here, which is a behavior change; one that keeps all three needs three rule fields for one idea.

## 2. Which checklist steps become data

Method: each step of `docs/typography-property-checklist.md`, the function that does it today, and whether a registry entry could replace the per-property code there.

### 2.1 The walk

| § | Step | Today | With a registry | Why |
|---|---|---|---|---|
| 1 | Inline editor state + `getActiveX()` reader | `assets/js/block-editor.js` class state, `getActiveLetterSpacing()` etc. | **Code** | React state and readers with per-property fallbacks (computed values, `<em>`/`<strong>`). A registry could list the span attribute to read (`data-letterspacing` → int), not the fallbacks. |
| 1 | Inline state provider (`typost_current_editor_state`) | `assets/js/inline-editor/extension-bridge.js` | **Data for the key list**, code for rendered vs explicit channels | The plain keys are a copy loop; `fontId`/`fontWeight`/`fontStyle` have two channels each (#278). |
| 1 | Block attribute, Inspector control, QFT detection | `block.json`, `components/inspector/*`, `parseInlineStylesAtCursor()` | **Code** (attribute stays in `block.json`) | `block.json` is the block's contract and is read by WordPress; panels are UI. The `parseInlineStylesAtCursor()` readers could take the span attribute name from a registry. |
| 1 | `buildQftEditorState` | `utils.js` | **Data** for plain keys, code for precedence | Precedence (span vs block) is a per-property decision the checklist asks to make explicitly. |
| 1 | Rendered vs explicit channels | three `persistable*()` helpers | **Data** (`source: 'explicitFontStyle'`) | A field naming the explicit key covers all three. |
| 1 | Pending-changes tracking | `_recordChange()` calls in the inline editor | **Code** | Called from UI handlers. |
| 2 | Inline apply handler | `extension-bridge.js` | **Data** | `if (props[key] !== undefined)` per key. |
| 2 | Block apply handler | `hooks/use-apply-block-properties.js` (about 15 lines of `if (props.x !== undefined) newAttrs.x = …`) | **Data**, with a normalizer name for `initialHang`, `textCase`, `fakeSmallCaps` | A loop over entries with an `attribute` field. The block build is webpack, so it can import JSON; but then core reads a module file (section 3.4). |
| 3 | Inline span (`data-*` + declaration, skipped under `hasActiveStyle`) | `apply-features.js` | **Partly data**: attribute name and value writer | The skip-under-style rule and the size/case special cases stay code. |
| 3 | Block save | `save.js` | **Code, frozen** | Saved markup must not change; `save.js` and `deprecated.js` must not read a registry that can change. |
| 3 | Deprecation check | `deprecated.js` | **Code, frozen** | |
| 3 | Editor preview parity | `edit.js`, `qft-preview.js`, inline preview | **Code** | UI. |
| 4 | Capture | `buildPropertiesFromState()` | **Data** for plain properties, a named function or group function for the rest | The proof did this for `letterSpacing`. |
| 4 | Diff | `isStyleModified()` | **Data** (`compare` kind + `reportedOnly` flag) | The proof did this for `letterSpacing`. 16 of its 28 compares (the four spacing lengths counted one by one, the features list as one), or 13 of the 21 properties, run only when the state reports the key: one flag. |
| 4 | Normalize | `normalizeApplyProperties()` | **Data** (`default`, or none for style-only keys) | The proof did this for `letterSpacing`. |
| 4 | Client CSS | `buildStyleCssBlock()` | **Data** for plain declarations, code for the size, case, hyphenation, outline, alignment rule, layout rule set, color rules, hang rules | The proof did this for `letterSpacing`. Declaration order is part of the byte-identical output (section 4.2). |
| 4 | Server sanitize | `sanitize_properties()` | **Data** (`sanitize` kind, `keepEmpty`) | The proof did this for `letterSpacing`. |
| 4 | Server CSS | `property_declarations()` / `generate_style_css()` | Same as client CSS | The proof did this for `letterSpacing`. |
| 4 | Based On (group, empty value, compare) | `BASED_ON_GROUPS`, `EMPTY_PROPERTY_VALUES`, `propertyValuesEqual()`, `compact*`, `group_signature()` | **Data** for `group`, `empty`, compare kind; **code** for the six group signatures | |
| 4 | Admin tab card | `render_card_details()` (109 decision points) | **Code** | Translated labels must stay in PHP/JS for `make-pot`; formatting is per property. |
| 4 | Style browser preview | `buildStylePreviewStyle()` | **Code** | Deliberate size/line height override. |
| 5 | kses | `Typost::SAFE_CSS_PROPERTIES` | **Data** (`kses: true` on the CSS property) | A list today. |
| 5 | Font/asset detection | `typography-stylist.php` | **Code** | Only `fontId`. |
| 5 | Caches | transients | **Code** | |
| 6 | Glyphs Panel, Variable Fonts, HOOKS.md | module code and docs | **Code / docs** | |
| 7 | Export: plain property | `ExportRegistryTest::everyProperty()` | **Data** (the test would read the registry's keys, as the proof's version did) | |
| 7 | Export: value naming something on one site | `Typost_PS_Transfer` | **Code** with an `export: 'fontKey' \| 'paletteColor'` field naming it | |
| 7 | Options, per-font settings, record metadata, import warnings | `Typost_Admin_Options`, `Typost_Export_Settings`, `font_support_warnings()` | **Code** | Not style properties. |
| 8 | i18n | catalogs | **Code** | Strings cannot live in a JSON registry that `make-pot` does not read. |
| 9 | Tests and docs | Jest, PHPUnit, CLAUDE.md | **Data for coverage tests** | |

Count: the checklist has 39 checkboxes (the table merges a few). For plain properties, 13 rows can become data, 3 partly (span writer, the two CSS generators), and the rest stay code: UI, frozen save output, i18n, caches, other modules, docs.

### 2.2 The special cases

| Property | Data | Stays a function the entry names |
|---|---|---|
| Fit to width | `fontSize: 'fit'` as an enum value, `fitMaxSize` in the size group, "not for fit" as a CSS condition (`cssUnless: 'fit'`) on `wordSpacing`, `textWrap`, hyphenation, alignment | Line measurement (`measureFitLines()`, `use-fit-measurement.js`), the fallback clamp, the content attributes. |
| Case | the enum `TEXT_CASE_VALUES`, `fakeSmallCaps` as a group member, empty '' | `caseDeclarations()` (three copies), the effective-fake-small-caps compare |
| First letter hang | default 0, range 0–1, three decimals, empty 0, `reportedOnly` | `normalizeHang()` textual rounding (three copies), the core-block hang rules appended after the style |
| Font size + unit | group membership, the mode enum, the trio defaults | `styleFontSizeCss()` / the PHP size branch (px vs rem, zoom slope), the unit rules of `buildPropertiesForStyleSave()`, the editors' unit resolution (#233, #248) |
| First line indent | group membership, empty '', length kind | `paragraph_layout_css()` (a different rule set and selector), the hang switch, Detach to core's Text indent (#348) |
| Color | empty '', `reportedOnly` | `normalizeColor()`, `comparableColor()`, the palette `var()` writer, the block-color rule, the forced-colors rule, export slug mapping |

### 2.3 Escape hatches, counted

The count depends on one rule: is a value writer or normalizer that the entry names by kind (`featureList`, `float`, `fontWeightCss`) part of the registry, or an escape hatch?

- **Generous rule — a writer the registry names is a kind:** only properties that need logic spanning several rules or keys need a hatch: the 6 groups (size, case, alignment, first line indent, outline, hyphenation) and `textColor` (three CSS rules, palette mapping). **7 of 21.** The four spacing lengths are not hatches under this rule: they share one writer and are already list-driven (`SPACING_PROPERTIES`, `copyLayoutProperties()`); `fontId`'s special case is the export mapping, outside the six generic paths.
- **Strict rule — a writer used by one property only is a hatch:** add `lineHeight` (`float`), `features` (list writer), `fontVariationSettings` (parser), `fontWeight` (validator), `fontId` (`var(--font-N)`), `initialHang` (core-block rules) and, if the layout rule set counts as one property's function, the four lengths. **13 to 17 of 21**; only `fontStyle`, `letterSpacing`, `wordSpacing` and `textWrap` stay pure data.

Under the generous rule hatches are a minority, so the issue's own test does not settle the question. What settles it is which properties are coming. Checked against the issues: #198 adds three groups (rule above/below, border, shading), each with a color; #209 is a language, which CSS cannot set (`lang` is an HTML attribute written at render time); #210 is a drop cap whose letter style references another style and renders with `::first-letter`; #216 adds underline and strikethrough groups with colors. None is a plain single-value property. A registry's first rule kinds would serve only properties that exist today, and each planned property would arrive as a group function or a hatch.

## 3. How PHP and JS would read the same definitions

### 3.1 Facts that decide it (verified)

- `paragraph-styles/assets/js/lib/ps-utils.js` is hand-written ES5 with no build step. `enqueue_utils_script()` (`paragraph-styles.php`) enqueues the file itself as `typost-paragraph-styles-utils`; it is the only place the handle is enqueued (both editors, the settings page and an editor mounted on a frontend page call it). It ends with `window.typostPSUtils = api` and `module.exports = api`; Jest and `admin.js` (under Jest) `require()` it. In the browser it cannot import a JSON file.
- The block is built by webpack (`@wordpress/scripts`), the inline editor by browserify; both can import JSON. The `admin-*.js`, Glyphs Panel and Variable Fonts scripts are no-build ES5 too.
- `.distignore` excludes `/docs`, `/tests`, `__tests__`; a JSON file under `paragraph-styles/` ships with no change (checked with the `ignore` package against the real `.distignore`). A JSON data file is its own source for WordPress.org; a generated PHP or JS file needs its source shipped and the step named in `BUILD.txt`/`SOURCE.md`.
- `wp_localize_script()` turns only top-level scalars into strings (the `typostData` boolean trap in root CLAUDE.md); nested values keep their JSON types.
- The REST update replaces a style's whole `properties` object (see the `buildPropertiesForStyleSave()` docblock), so a key the editor fails to send on Update Style is deleted on the server.
- PHP 7.4 and WordPress 5.8 are the floor. Public API that must not change: `window.typostPSUtils` and its keys, `window.typostSharedUtils`, `typostData` keys, public PHP methods, `typost_*` filters, script handles.

### 3.2 The options

| | (1) One JSON file read at run time by both (the proof) | (2) PHP array is the source, JS gets it from PHP | (3) JSON source; PHP and JS generated at build time and committed | (a) Per-language data tables + one parity test | (4) Status quo: hand-kept twins + shared fixtures (#358) |
|---|---|---|---|---|---|
| PHP read | `file_get_contents` + `json_decode` once per request (static memo) | `require` of a PHP file returning an array (opcached) | generated PHP array (opcached) | a class constant | constants and code |
| Run-time cost | 79–146 µs for a 1-entry file, 217–394 µs for 40 entries (Windows 11, PHP 7.4.33 and 8.2 CLI, two independent runs). Paid on every page that prints style CSS, but at 0.1–0.4 ms negligible | none | none | none | none |
| Browser, no-build `ps-utils.js` | `wp_localize_script()` in `enqueue_utils_script()`: one new global | same as (1) | a generated `property-registry.js` (UMD-lite) enqueued as a dependency of the utils handle: one new global, no PHP print | an array inside `ps-utils.js`: no global | none |
| Jest | `require()` the JSON | a committed JSON copy of the PHP array, checked by a test | `require()` the JSON or the generated JS | `require('ps-utils.js')` as today | as today |
| Copies of the data | none | the JSON copy | none if CI regenerates and compares | two, held equal by one parity test (PHPUnit reads the JS table, or both read a fixture) | every list and every function |
| Failure modes | file missing or invalid → empty registry → `sanitize_properties()` drops the property on the next save; global missing → the editors stop capturing it, Update Style sends `properties` without the key, and the REST update deletes the stored value | PHP fatal on a broken file (loud) | generated file out of date → caught by the CI check; an extension loading `ps-utils.js` by its own handle misses the dependency | the two tables drift → the parity test fails | a list drifts → caught only where a fixture covers it |
| Build and new concepts | none; a global, a loader, a load-order dependency | none; the copy and its check | a generator, a CI step, `BUILD.txt` | none beyond the rule kinds | none |

Option (a) gets the generic loops and the edit-site saving of a registry without its run-time costs: the data twins are the cheap ones to hold equal (section 6.3). If a registry is ever built, it should start there, and move to (3) only when the editors read the same definitions.

### 3.3 What the proof used

Option (1), because it is the only one with no copy of the data, and the hard part (reaching the no-build script) had to be solved for real. `paragraph-styles/property-registry.json` held one entry (`key`, `default`, `capture: truthy`, `compare: strict`, `sanitize: int`, `css {property, value: thousandthsEm}`). PHP read `__DIR__ . '/property-registry.json'` once per request; `enqueue_utils_script()` printed `{properties: […]}` with `wp_localize_script()`; `ps-utils.js` used `require()` when `module.exports` existed and `window.typostPSPropertyRegistry` otherwise. A first version printed it with `wp_add_inline_script()` and checked `wp_scripts()` for a duplicate; that broke six Brain Monkey tests that stub only the enqueue functions.

### 3.4 Where a shared file would live, and extensions

The Paragraph Styles module consumes core's public extension API only. A registry that the block's apply bridge and the inline editor also read must live in core and reach the module through a public accessor (`Typost::get_property_registry()`, a `typostData` key), which adds public API. A `typost_property_registry` filter that lets extensions add properties was not built; it would need a closed set of rule kinds (a value writer is a CSS injection point), Based On and export semantics for unknown keys, and it cannot touch the frozen `save()`. The current rule — extension keys ride the apply bridge and are never captured — is safer.

## 4. Migration method, one property at a time

Kept as the method for any future change of this kind (a registry, option (a), or a refactor of the generators).

### 4.1 The proof of each step

For each property, before and after, `main` versus the branch:

1. **PHP characterization** with WordPress and the test site's database loaded: `generate_style_css()` and `nested_css()` for every stored style (called directly, not through `CSS_CACHE_KEY`, which another code version may have filled), `prepare_style_for_client()`, the REST GET shape; and for an edge grid of the property's values (absent, '', 0, '0', negative, numeric string, non-numeric string, float, exponent string, very large, `PHP_INT_MAX`, `true`, `false`, `null`, `[]`, `[5]`, spaces) alone, beside every other property, and in a fit style: `property_declarations()`, `generate_style_css()`, `sanitize_style_properties()` with both `$keep_empty` values. Based On: the empty override (0, '0', ''), inheriting, overriding, equal to the parent. The case count depends on the number of stored styles at that moment: take base, branch, base back to back.
2. **JS characterization:** the same grid plus `undefined`, `NaN`, `-0` through `buildStyleCssBlock()`, `normalizeApplyProperties()`, `buildPropertiesFromState()` (both units), `buildPropertiesForStyleSave()` (update, new, no base), every state value against every stored value through `isStyleModified()` for three editor states, `resolveStyleList()` / `buildStyleUpdateProperties()` for Based On, and the API's key list; serialized with key order, so a reordered object fails. Run through `require()` and through the browser load path (the script evaluated in a context that has only `window`).
3. **A shared CSS fixture generated from the old generator**, read by Jest and PHPUnit.
4. **Existing fixtures that must pass unchanged:** `paragraph-styles/__tests__/fixtures/*.json` and the PHPUnit tests that read them, `ExportRegistryTest.php` (its scan of `sanitize_properties()` must still find a moved key: extend it to the new source of keys, and prove that a planted key it does not know fails), and the #358 parity tests.
5. **Real editor**, `main` versus branch, on a TEMP draft and style: Save Current Settings as Style, change → "(modified)", Update Style, apply to a block and to a core Paragraph, Detach; compare block attributes, serialized content, stored properties and computed CSS. Also the settings tab and an editor mounted on a frontend page, for anything enqueued.
6. **Mutation:** break the new code once and see the characterization and the new tests fail.

### 4.2 Order

Declaration order is part of the byte-identical CSS, and a registry loop emits its entries at one point. `letterSpacing` and `lineHeight` are adjacent (after `features`, before `fontVariationSettings`); `wordSpacing` and `textWrap` come after the case declarations inside the not-fit block, and `color` after hyphenation. So either the generators first become one ordered list of all properties, with "custom" entries for the special ones, or plain properties migrate in declaration order and the loop grows outward. Smallest steps: `lineHeight`; `fontStyle`; `features`; `fontVariationSettings`; then (after the ordered list) `wordSpacing`, `textWrap`, the four lengths; then `fontWeight`, `fontId`, `initialHang`, `textColor`; groups last, if at all.

### 4.3 What each migrated property would delete

Its branch in `buildPropertiesFromState()`, `isStyleModified()`, `normalizeApplyProperties()`, `buildStyleCssBlock()`, `sanitize_properties()`, `property_declarations()`; its `EMPTY_PROPERTY_VALUES` entry in both languages and its `propertyValuesEqual()` / `property_values_equal()` case; for style-only keys, its `buildPropertiesForStyleSave()` carry. Not deleted: Detach, the admin form and card, the Inspector panel, the span reader with its fallbacks, `save.js`.

## 5. What it buys, measured

### 5.1 Method

JS: ESLint 9.39's own `complexity` rule (1 + `if`, `else if`, `?:`, `&&`, `||`, `??`, loops, `case`, `catch`, default parameters), run through the `Linter` API at `max: 0`; callbacks count as their own functions. PHP: the same rule counted from `token_get_all()` (PHP 7.4); closures count inside their method. An independent review run reproduced the figures.

### 5.2 Edit sites first

For a new plain property like `letterSpacing`, the module has 17 edit sites today (counted on `main` by locating every `letterSpacing` line in the module):

- **10 in the generic paths:** `ps-utils.js` capture, diff, normalize, client CSS, `EMPTY_PROPERTY_VALUES`, `propertyValuesEqual()`; `paragraph-styles.php` `sanitize_properties()` (with its `$keep_empty` decision), `property_declarations()`, `EMPTY_PROPERTY_VALUES`, `property_values_equal()`. A registry makes these **one entry**.
- **7 that stay code:** `buildDetachBlockSettings()`, `render_card_details()`, three sites in `admin.js` (fill the form, read it, build the payload), the field in `includes/admin-tab.php`, the Detach notice label in `editor.js`. Plus two test sites (`ExportRegistryTest::everyProperty()`, a `based-on.json` case) and every editor-side step of checklist sections 1–3.

### 5.3 Branch counts

| Function | Issue's figure | `main` (936ebff) | After the proof | Full module migration of the 15 non-group properties (estimate) |
|---|---|---|---|---|
| `resolveSelectionStyleState` (`utils.js`) | ~78 | 78 | 78 (not touched) | not in scope of a module registry |
| `buildDetachBlockSettings` (`ps-utils.js`) | ~59 | 77 (grew with #348) | 77 (not touched) | not in scope (Detach stays code) |
| `isStyleModified` | ~67 | 67 | 65 | ~20 |
| `buildStyleCssBlock` | ~55 | 46 | 45 | ~12 |
| `buildPropertiesFromState` | | 30 | 29 | ~10 |
| `sanitize_properties()` (PHP) | | 82 | 81 | ~35 |
| `property_declarations()` (PHP) | | 38 | 37 | ~12 |
| `property_values_equal()` (PHP) | | 18 | 18 | ~5 |
| `generate_style_css()` (PHP) | | 21 | 21 | 21 |
| **The seven module functions (rows 3–9), total** | | **302** | **296** | **~115** |
| Registry machinery: loader, generic helpers and every rule kind (compare, capture, sanitize, value writers) in both languages | | 0 | 42 (JS 26, PHP 16) | ~110 (JS ~60, PHP ~50) |
| **Total** | | **302** | **338** | **~225 (−25 %)** |

The rule kinds are inside the machinery row. The proof's +36 is a one-time cost set against one property; the estimate is rough (±30). The saving comes mostly from the repeated `state.x !== undefined &&` guard and the per-property `if` becoming one loop; the special functions (size, case, hyphenation, outline, color, alignment, layout) and `render_card_details()` (109) do not change.

### 5.4 Costs set against it

New files and concepts (rule kinds, a loader, the declaration-order constraint, and where a special case lives); indirection (reading `isStyleModified()` no longer tells how a property compares — #355 notes the code reads well line by line today); a full characterization per migrated property; and, for option (1), the run-time failure mode of section 3.2. The run-time read cost is negligible.

## 6. Order with the other work

### 6.1 #379 (split `Typost_Paragraph_Styles`)

No dependency now that the registry is dropped. If a registry or option (a) is taken up later, do it after #379, so the edits land in a small property-store class and a CSS class; #379 should then keep `sanitize_properties()` and `property_declarations()` reachable from one class, and move `ExportRegistryTest::sanitizedPropertyKeys()`'s source scan (it reads `paragraph-styles.php` by path) with the method.

### 6.2 #381 (split `utils.js` and `ps-utils.js` by topic)

#381 asked to do the `ps-utils.js` part after this design was agreed. With the registry dropped there is no constraint; the proposed classification test calls exported functions and reads exported lists by name, so a split that keeps the exports does not touch it.

### 6.3 #358 twin inventory

A registry would remove the **data twins** only: `EMPTY_PROPERTY_VALUES` and `BASED_ON_GROUPS` (`ps-utils.js` / `paragraph-styles.php`), `SPACING_PROPERTIES`, `HYPHENATE_LIMIT_KEYS`, the enum lists (`TEXT_CASE_VALUES` — three copies, but one is in core `assets/js/text-case.js`, so a module registry removes at most two — `ALIGNMENT_VALUES`, `ALIGN_LAST_VALUES`, `TEXT_WRAP_VALUES`) and the limits (`TEXT_STROKE_MAX`, `LENGTH_MAX`, `INITIAL_HANG_MAX`/`HANG_MAX`, `HYPHENATE_LIMIT_MAX`, `HYPHENATE_CHARACTER_MAX`). It does **not** remove the function twins (`normalizeHang()` ×3, `normalizeLength()`, `normalizeColor()`, `caseDeclarations()` ×3, `responsiveZoomVw()`/`pxToRem()` ×3, the two CSS generators, `groupSignature()`, `compactStyleProperties()`, `mergeStyleProperties()`); they would become rule kinds, still one per language. Data twins are the cheap ones to hold equal, which is why option (a) costs little and why removing them is a small gain.

## 7. Decision and proposed follow-ups

**Decided 2026-11-11: option A — drop the run-time registry.** The proof was not merged.

The options that were on the table:

- **A — drop the run-time registry (chosen).** Keep the hand-written paths. Protect against unclassified or partly wired properties with a test, not with run-time indirection.
- **A-narrow** is the proposed first step of A: the classification test below, and nothing that drives every path.
- **(a) — per-language data tables + one parity test.** The registry's edit-site saving without a JSON read, a global, a build step or a silent failure. The route to take if the answer changes.
- **B — run-time registry, Paragraph Styles only, plain properties only.** Rejected: its first rule kinds serve only existing properties (section 2.3), and its run-time JSON delivery adds a global with a data-loss failure mode. Its one real advantage over a test: a property in the registry cannot be wired into only some module paths. That alone does not outweigh section 2.3.
- **C — full registry for both editors and the module.** Rejected: the editor side is mostly UI and frozen save output (section 2.1), and the registry would move to core and become public API (section 3.4).

Why: one plain property is 10 module edit sites, which a registry turns into one, but no planned property is plain (#198, #209, #210, #216 are groups, an HTML attribute and a cross-style reference); the machinery costs about 110 decision points to save about 190 across a full migration of properties that already exist; and the run-time delivery to a no-build script brings a global whose absence deletes stored values. **What would change the answer:** several more plain single-value properties expected. Then start with option (a).

Proposed follow-ups (not agreed work, no issues created):

1. **Classification test (A-narrow), first and smallest.** One test with a closed world: every key that core reports or bridges — the keys of the inline state provider and of `buildQftEditorState()`, the keys of both apply bridges, `PARAGRAPH_STYLE_OWNED_ATTRS` / `PARAGRAPH_STYLE_OWNED_PROPS`, `DETACH_SPAN_GROUPS` — and every key `sanitize_properties()` stores must appear in one list, as a style property (with the paths it must reach: owned or style-only, Based On group or empty value, export plain or mapped; `fontSizeUnit` is one whose value comes from the site's new-content unit, not from the editor state) or as excluded with a reason (`layeredConfigId`, `animationConfigId`, `data-feature-settings`, the fit content attributes). Where the source lists are not exported, read them as `ExportRegistryTest` reads `sanitize_properties()`, with a control that the scan finds a known key. Acceptance: a new key in any source list fails until it is classified; a classified style property missing from `EMPTY_PROPERTY_VALUES` (or, for a group member, from its group in `BASED_ON_GROUPS`), the CSS fixtures or `everyProperty()` fails; no source file changes. It cannot catch a wrong classification, and does not claim to.
2. **Path-driving manifest, optional second step.** For each style property in the list of (1), a sample value and its expected declaration; Jest and PHPUnit drive capture, diff, normalize, `buildPropertiesForStyleSave()`, both CSS generators, the sanitizer and the Based On helpers with it. Over (1) it adds behavior checks (a property that is listed but not handled in one path); over the #358 parity tests and `ExportRegistryTest` it adds the capture, diff and normalize paths, which those do not drive per property. Worth it only if (1) shows gaps.
3. **One equality rule for `letterSpacing`** (`isStyleModified()` strict, `propertyValuesEqual()` / `property_values_equal()` int, `stylePropertyOverrides()` `Number()`), as its own issue because it changes behavior.

## 8. Open decisions

Closed on 2026-11-11: drop vs narrow vs full (A); what to merge (this document only). Left for whoever reopens the question:

1. Data delivery if a registry is built: option (a) first, (3) when the editors read it. (1) only if the failure mode of section 3.2 is guarded.
2. File location: in the module while only module code reads it; in core with a public accessor if the editors do.
3. Extensions registering properties: no, until an extension needs it.

## 9. The proof (not in the repository)

What was built and measured on 2026-11-11, then removed; kept here as a description so the numbers above can be checked against what was done.

- **Files:** `paragraph-styles/property-registry.json` (one entry). In `ps-utils.js`, a "Property registry (#359)" block before `isStyleModified()` (`loadPropertyRegistry()`, `REGISTRY_CSS_VALUES`, `captureRegistryProperties()`, `registryPropertyModified()`, `addRegistryApplyDefaults()`, `registryDeclarations()`) replaced the `letterSpacing` branches of `isStyleModified()`, `buildPropertiesFromState()`, `normalizeApplyProperties()` (literal split so key order stayed) and `buildStyleCssBlock()`; `window.typostPSUtils` got no new key. In `paragraph-styles.php`, `property_registry()`, `registry_sanitized_properties()` and `registry_declarations()` replaced the branches of `sanitize_properties()` and `property_declarations()`, and `enqueue_utils_script()` called `wp_localize_script()`. Tests: a Jest file (47 tests, `require()` and browser paths), a PHPUnit file (26 tests), a 20-case CSS fixture generated from the old generator; `ExportRegistryTest::sanitizedPropertyKeys()` read the registry keys; `ParagraphStylesFrontendCssTest` stubbed `wp_localize_script()` in two methods. No existing expectation or fixture changed.
- **Exercised:** the six generic module paths on both sides, key order of stored and normalized properties, the browser delivery, and the REST, export and admin paths through `sanitize_properties()`. **Not exercised:** a reported-only or style-only property, a group, an export mapping, a declaration away from the loop's position, the Based On helpers, Detach, the apply bridges and the editors' span code.
- **Results:** PHP and JS characterization files identical between `main` and the branch (125 to 126 PHP cases, 2,571 to 2,574 JS cases, depending on the stored styles at each run); real editor 7 of 7 steps identical, the only difference the new global; settings tab and frontend-mounted editor identical apart from the global (an independent review run); 12 existing posts opened in the editor and on the frontend with the same block validity, saved content and attributes; e2e 21 passed; Jest 92 suites / 2,624 tests and PHPUnit 906 tests passed; renaming two rule kinds in the JSON broke both characterizations, as it should.
- **Bugs it found, older than the proof:** the CSS twins disagree on out-of-range `letterSpacing` (1e20 and `PHP_INT_MAX` print in PHP's E notation, plain digits in JS) and on non-scalar values (`true`, `[]`, `[5]`); `sanitize_properties()` has no range for `letterSpacing` although `wordSpacing` is clamped; and the three equality rules of section 1.2.
