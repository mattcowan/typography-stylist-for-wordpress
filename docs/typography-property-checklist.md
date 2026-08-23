# Typography property integration checklist

Use this checklist whenever a new text/typography property (a `fontStyle`, a `textTransform`, a word-spacing…) or any author-facing setting that styles text is added to the plugin. It exists because `fontStyle` (visual italic) shipped fully wired into core — both editors, the state filter, the apply bridge, span serialization — and still silently broke Paragraph Styles: saving a style from italic text dropped the italic, because five module-side touchpoints were never updated. Core compiling and tests passing does **not** mean the property is integrated.

The rule of thumb: a property is not done until it round-trips through **every** path below — editor → span/block → frontend CSS, editor → saved paragraph style → CSS class → frontend, and back into the editor state that extensions read.

## 1. Core editor state (both editors)

- [ ] **Inline editor** ([assets/js/block-editor.js](../assets/js/block-editor.js)): component state + a `getActiveX()` reader that resolves the value at the selection (span attribute first, then computed/rendered value if consumers need the *effective* value — see `getRenderedFontStyle`).
- [ ] **Inline editor state provider** (`typost_current_editor_state` filter for `'inline'`, in the constructor): report the property. Extensions — including the bundled Paragraph Styles and Glyphs modules — see only what this filter reports.
- [ ] **Block editor** ([blocks/typography-stylist/edit.js](../blocks/typography-stylist/edit.js)): block attribute in [block.json](../blocks/typography-stylist/block.json), Inspector control, and the QFT selection-level detection (`parseInlineStylesAtCursor` in [utils.js](../blocks/typography-stylist/utils.js)).
- [ ] **Shared QFT state** (`buildQftEditorState` in [blocks/typography-stylist/utils.js](../blocks/typography-stylist/utils.js)): add the key, deciding inline-span-at-selection vs block-attribute precedence explicitly.
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
- [ ] **Admin tab card** ([includes/admin-tab.php](../paragraph-styles/includes/admin-tab.php)): show the property in the style card details (new strings go in the *module's* catalog — see i18n below).
- [ ] **Style browser preview**: usually free — rows carry the style's real CSS class — but check `buildStylePreviewStyle()` doesn't override the property away (it deliberately overrides size/line-height).

## 5. Frontend PHP

- [ ] **Font/asset detection**: if the property affects which assets load (like `fontId` does for @font-face), extend the detection in [typography-stylist.php](../typography-stylist.php). Pure CSS properties (italic, spacing) need nothing here — but a property that selects a different *font file* (e.g. an italic face file) does.
- [ ] **Caches**: style CSS and editor data are cached (`typost_paragraph_styles_css`, `typost_editor_data_{user}` transients). New data flowing through them is invisible for up to the TTL — check the invalidation paths cover the new writes, and remember the transient can hold pre-fix values right after deploying (cast/parse defensively, as `isFlagEnabled()` does).

## 6. Other bundled modules and extensions

- [ ] **Glyphs Panel**: reads the shared editor state and *writes back* what it read onto inserted spans — a property it doesn't know about must at least pass through unharmed. Check [glyphs-panel/assets/js/editor.js](../glyphs-panel/assets/js/editor.js) for state keys it copies.
- [ ] **Variable Fonts**: only relevant if the property interacts with axes (like weight ↔ `wght`).
- [ ] **HOOKS.md**: if the shared state or apply-bridge payload gained a key, document it — external extensions (Layered Fonts, Animations) read the same contract.

## 7. i18n

- [ ] Core strings → [languages/typography-stylist.pot](../languages/typography-stylist.pot) + fr/es .po, compile with `php scripts/compile-po.php`.
- [ ] Module strings → the module's own catalog (e.g. `paragraph-styles/languages/typost-paragraph-styles.*`, its own text domain). The core compile script does **not** cover modules; point the `PO_to_MO_Compiler` class at the module dir. JS-facing strings additionally need the JED .json (filename hashes the plugin-relative script path).
- [ ] The .po/.pot files are CRLF — scripts that split on `\n\n` must normalize first.

## 8. Tests and docs

- [ ] Jest: unit tests for every pure function touched (utils.js, ps-utils.js) — including the "property is absent" defaults, since that's exactly where `fontStyle` broke.
- [ ] Update tests that pinned the old behavior *deliberately*, stating the intent moved.
- [ ] `npm test` before and after `npm run build` (modules have no build step; core blocks do).
- [ ] CLAUDE.md (root + affected module), README.md/readme.txt/DOCUMENTATION.md if author-facing.

## Known deliberate exclusions (don't "fix" these)

- **Extension-owned keys** (`layeredConfigId`, `animationConfigId`): ride through the apply bridge but are never captured into paragraph styles — extensions own their full format.
- **Raw indexed alternates** (`data-feature-settings`, written by the Glyphs Panel): per-glyph, not exposed in the shared editor state, and intentionally not a paragraph-style property.
- **`fontSizeMin/Preferred/Max`** are not normalized on style apply — defaults would clobber a block's tuned responsive values while rendering identically.
