# Typography property integration checklist

Use this checklist whenever a new text/typography property (a `fontStyle`, a `textTransform`, a word-spacing…) or any author-facing setting that styles text is added to the plugin. It exists because `fontStyle` (visual italic) shipped fully wired into core — both editors, the state filter, the apply bridge, span serialization — and still silently broke Paragraph Styles: saving a style from italic text dropped the italic, because five module-side touchpoints were never updated. Core compiling and tests passing does **not** mean the property is integrated.

The rule of thumb: a property is not done until it round-trips through **every** path below — editor → span/block → frontend CSS, editor → saved paragraph style → CSS class → frontend, saved style → export file → another site (#205), and back into the editor state that extensions read.

## 1. Core editor state (both editors)

- [ ] **Inline editor** ([assets/js/block-editor.js](../assets/js/block-editor.js)): component state + a `getActiveX()` reader that resolves the value at the selection (span attribute first, then computed/rendered value if consumers need the *effective* value — see `getRenderedFontStyle`).
- [ ] **Inline editor state provider** (`typost_current_editor_state` filter for `'inline'`, in the constructor): report the property. Extensions — including the bundled Paragraph Styles and Glyphs modules — see only what this filter reports.
- [ ] **Block editor** ([blocks/typography-stylist/edit.js](../blocks/typography-stylist/edit.js)): block attribute in [block.json](../blocks/typography-stylist/block.json), Inspector control, and the QFT selection-level detection (`parseInlineStylesAtCursor` in [utils.js](../blocks/typography-stylist/utils.js)).
- [ ] **Shared QFT state** (`buildQftEditorState` in [blocks/typography-stylist/utils.js](../blocks/typography-stylist/utils.js)): add the key, deciding inline-span-at-selection vs block-attribute precedence explicitly.
- [ ] **Rendered vs explicit channels**: if the state reports a *rendered/effective* value (theme CSS, semantic markup like `<em>`/`<strong>`), decide whether persisting consumers need a separate explicit-only channel. `fontStyle` (rendered, for previews/Glyphs) is paired with `explicitFontStyle` (set values only) precisely because capturing `<em>`-derived italic into a paragraph style produced CSS that could neither reproduce nor reset it, plus a permanently-lying "(modified)" badge.
- [ ] **Pending-changes tracking** (inline editor `_pendingChanges` / `_recordChange`): register the property so mixed selections only patch what the author actually changed.

## 2. Apply bridge (how extensions write)

- [ ] **Inline handler** (`typost-apply-block-properties` listener in block-editor.js): map `props.yourProperty` into state with the `!== undefined` partial-update pattern, and record it in the pending-changes branch.
- [ ] **Block handler** (same event, edit.js): map `props.yourProperty` to `newAttrs`.

## 3. Serialization

- [ ] **Inline span** (`applyFormatting` in block-editor.js): `data-*` attribute + inline style declaration — and the declaration must be **skipped under `hasActiveStyle`** (spans with `data-style-id` render from the style's CSS class; the data attribute is still written for detection).
- [ ] **Block save** ([blocks/typography-stylist/save.js](../blocks/typography-stylist/save.js)): emit the style — noting that *all* typography inline styles are skipped when `styleClass` is set, so whatever the property does must also be expressible by the paragraph-style CSS class (next section) or it vanishes on styled blocks.
- [ ] **Deprecation check**: if the block's *save output changes for existing attribute values*, add a deprecation entry ([deprecated.js](../blocks/typography-stylist/deprecated.js)). A new attribute that only adds output for new content usually doesn't need one — verify by loading an existing post in the editor and checking for block validation errors.
- [ ] **Editor preview parity** (edit.js preview node + inline editor preview): the editor always renders inline styles for preview; make the preview honour the property.

## 4. Paragraph Styles module — the part `fontStyle` missed

All in [paragraph-styles/](../paragraph-styles/):

- [ ] **Capture**: `buildPropertiesFromState()` in [assets/js/lib/ps-utils.js](../paragraph-styles/assets/js/lib/ps-utils.js) — without this, "Save Current Settings as Style" silently drops the property.
- [ ] **Diff**: `isStyleModified()` (same file) — without this, the "(modified)" badge lies.
- [ ] **Normalize**: `normalizeApplyProperties()` (same file) — decide explicitly whether the property is *style-owned* (gets a default, so applying a style without it resets the editor — the usual case) or *deliberately not normalized* (like `fontSizeMin/Preferred/Max`); record the decision in the docblock either way.
- [ ] **Client CSS**: `buildStyleCssBlock()` (same file) — the JS twin of the PHP generator, used to inject CSS for styles saved in-session. **Must stay byte-identical to the PHP output.**
- [ ] **Server sanitize**: `sanitize_properties()` in [paragraph-styles.php](../paragraph-styles/paragraph-styles.php) — it whitelists keys, so an un-listed property is stripped at the REST layer even if the client sends it.
- [ ] **Server CSS**: `generate_style_css()` (same file) — emit the declaration, mirroring the JS twin.
- [ ] **Based On** (#200): a property inherits from a parent style with no extra code, key by key. Decide whether it belongs to a group that must inherit as a whole (`BASED_ON_GROUPS` in both `paragraph-styles.php` and `ps-utils.js`, like the size and the case), give it an empty value a child can store to unset it (`EMPTY_PROPERTY_VALUES` in both ps-utils.js and `paragraph-styles.php`, and let `sanitize_properties()` keep that value when `$keep_empty`), and add a compare case to `property_values_equal()` / `propertyValuesEqual()` when a plain string compare is wrong for it (an array, a float). Add a case to `paragraph-styles/__tests__/fixtures/based-on.json`.
- [ ] **Admin tab card** (`render_card_details()` in [paragraph-styles.php](../paragraph-styles/paragraph-styles.php)): show the property in the style card details, with the keys it shows (for its Inherited/Override label, #200) and a "None" row for an empty override (new strings go in the *module's* catalog — see i18n below).
- [ ] **Style browser preview**: usually free — rows carry the style's real CSS class — but check `buildStylePreviewStyle()` doesn't override the property away (it deliberately overrides size/line-height).

## 5. Frontend PHP

- [ ] **kses**: a post saved by a user without `unfiltered_html` goes through `safecss_filter_attr()`, which drops every declaration whose property is not on the `safe_style_css` list. Test serialized markup (the value as the serializer writes it, with `&quot;`) with `wp_kses_post()` or `wp_filter_post_kses()`: that is the path a saved post takes. For a direct `safecss_filter_attr()` test, use decoded CSS (`"`) on WordPress 7.0.1+, which decodes the attribute before that call; use `&quot;` only to test the raw-value behavior of older versions. If the property is dropped, add it to `Typost::SAFE_CSS_PROPERTIES` in [typography-stylist.php](../typography-stylist.php) (#277). `font-feature-settings` and `font-variation-settings` were dropped for those users until 2.3.3, and a block with them became invalid. A value with quotes is kept only on WordPress 7.0.1+, which decodes the attribute before the check; on older versions kses cuts it at the `;` in `&quot;`.

- [ ] **Font/asset detection**: if the property affects which assets load (like `fontId` does for @font-face), extend the detection in [typography-stylist.php](../typography-stylist.php). Pure CSS properties (italic, spacing) need nothing here — but a property that selects a different *font file* (e.g. an italic face file) does.
- [ ] **Caches**: style CSS and editor data are cached (`Typost_Paragraph_Styles::CSS_CACHE_KEY`, currently `typost_paragraph_styles_css_v2`, and `typost_editor_data_{user}` transients). New data flowing through them is invisible for up to the TTL — check the invalidation paths cover the new writes, and remember the transient can hold pre-fix values right after deploying (cast/parse defensively, as `isFlagEnabled()` does).

## 6. Other bundled modules and extensions

- [ ] **Glyphs Panel**: reads the shared editor state and *writes back* what it read onto inserted spans — a property it doesn't know about must at least pass through unharmed. Check [glyphs-panel/assets/js/editor.js](../glyphs-panel/assets/js/editor.js) for state keys it copies.
- [ ] **Variable Fonts**: only relevant if the property interacts with axes (like weight ↔ `wght`).
- [ ] **HOOKS.md**: if the shared state or apply-bridge payload gained a key, document it — external extensions (Layered Fonts, Animations) read the same contract.

## 7. Export and import (#205)

A paragraph style property and a plugin option travel to other sites through Settings → Typography Stylist → Export & Import. Two tests in `tests/Unit/ExportRegistryTest.php` fail until each new one has a decision:

- [ ] **Style property:** add it to `everyProperty()` in `ExportRegistryTest.php` (the test reads `sanitize_properties()` and fails on a key the fixture does not set). A plain value (number, keyword, boolean, list of codes) then round-trips with no other change, because the section writes stored properties and import runs `sanitize_properties()`. Check whether a child style can unset it, and add that to the child round-trip test.
- [ ] **A value that names something on one site** — a font ID, another style (Next style #201, nested and GREP rules #195/#196, a drop cap letter style #210), a theme palette slug (#215), an attachment — cannot be copied as is. Write a file-local key on export and map it on import, as `Typost_PS_Transfer` does for `fontId` (`$fonts->key_for_font_id()` / `$fonts->import_font_id()`) and `basedOn` (style keys, parents imported first). Add a test that imports it on a site where the IDs differ.
- [ ] **New `typost_*` option:** add it to `uninstall.php` (the registry test also fails on an option in code that uninstall does not delete), then either to a section's `options` (and export it there) or to `Typost_Export::NOT_EXPORTED` with the reason (a cache, a one-time flag, state about this site). A setting on the Options or Accessibility tab goes into `Typost_Admin_Options::definitions()` (label, type, default) and is saved through `Typost_Admin_Options::sanitize()` in every path; the options section then exports it with no other change. An extension checkbox needs only a `typost_export_option_details` entry for its label.
- [ ] **New per-font setting:** key it by font in the file through `$fonts->key_for_font_id()`, return those keys from `fontKeys`, and build the preview with `Typost_Export_Settings::font_settings_row()` so it asks the same keep/replace question as Feature Visibility.
- [ ] **Style record metadata** outside `properties` (such as `nextStyleId`): the section only writes `key`, `name`, `basedOn` and `properties`, so add the field to `Typost_PS_Transfer::export()` / `plan()` and to the round-trip fixture by hand — the source scan does not see it.
- [ ] **Import warnings:** if the property depends on what the font can do (like features and axes), add a check to `font_support_warnings()`.

## 8. i18n

- [ ] Core strings → [languages/typography-stylist.pot](../languages/typography-stylist.pot) + fr/es .po, compile with `wp i18n make-mo languages languages` (see [languages/README.md](../languages/README.md)).
- [ ] Module strings → the module's own catalog (e.g. `paragraph-styles/languages/typost-paragraph-styles.*`, its own text domain). Compile it with `wp i18n make-mo <module>/languages <module>/languages`. JS-facing strings additionally need the JED .json (filename hashes the plugin-relative script path, so a module file made by `make-json` must be renamed; see languages/README.md).
- [ ] The .po/.pot files are CRLF — scripts that split on `\n\n` must normalize first.

## 9. Tests and docs

- [ ] Jest: unit tests for every pure function touched (utils.js, ps-utils.js) — including the "property is absent" defaults, since that's exactly where `fontStyle` broke.
- [ ] Update tests that pinned the old behavior *deliberately*, stating the intent moved.
- [ ] `npm test` before and after `npm run build` (modules have no build step; core blocks do).
- [ ] CLAUDE.md (root + affected module), README.md/readme.txt/DOCUMENTATION.md if author-facing.

## Known deliberate exclusions (don't "fix" these)

- **Extension-owned keys** (`layeredConfigId`, `animationConfigId`): ride through the apply bridge but are never captured into paragraph styles — extensions own their full format.
- **Raw indexed alternates** (`data-feature-settings`, written by the Glyphs Panel): per-glyph, not exposed in the shared editor state, and intentionally not a paragraph-style property.
- **`fontSizeMin/Preferred/Max`** are not normalized on style apply — defaults would clobber a block's tuned responsive values while rendering identically.
- **`fontSizeUnit`** (#233) is not an editor-state key and not in the apply bridge. It records whether a block or a style was saved before rem existed, so the block attribute and the style property are each set by their own save path (new content takes the site's new-content unit — `'rem'`, or `'px'` under the #248 Options setting — and older content `'px'`) and never copied from one to the other. Inline spans store no unit: a size the author sets is written in the new-content unit, and a size the author did not change keeps the unit the span already has when the span is re-applied (`resolveSpanFontSizeUnit()` in `assets/js/font-size-units.js`). A span that leaves a paragraph style takes that style's unit.
