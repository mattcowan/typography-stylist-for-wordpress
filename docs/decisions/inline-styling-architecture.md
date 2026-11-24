# Inline styling architecture

- **Topic:** how styled text is stored in `<span class="typost-styled">` elements: the data flow from the toolbar to the frontend, the `data-*` attributes, the font CSS variables, attribute preservation, the Quick Feature Toggles preview and nested spans.
- **Issues:** none (v1.1.6, v1.2.0, v2.2.3; the Case attributes are #214)
- **Code:** `assets/js/block-editor.js`, `assets/js/inline-editor/`, `blocks/typography-stylist/utils.js`

Moved from the root [CLAUDE.md](../../CLAUDE.md) by #361. Every `data-*` attribute the inline editor writes must also be registered on the format type: see [text-case.md](text-case.md). The inline editor rebuilds a span's whole style on every apply; the unit rules for that rebuild (`resolveSpanFontSizeUnit()`, and reading `pending.keys` before `_resetPendingChanges()`) are in [font-size-units-and-zoom.md](font-size-units-and-zoom.md).

## Data Flow

1. User selects text in heading block → clicks toolbar button
2. A modal shows presets (from `typostData.presets`) and features (from `typostData.features`)
3. User toggles features or selects preset → the change applies at once (sliders, selects and the font size apply after a debounce)
4. JavaScript applies inline format with `data-features` attribute and `font-feature-settings` style
5. Frontend displays with CSS only (no JavaScript required)

## Inline Styling Architecture

**Data Attributes (v1.1.6+):**
All inline styles are stored using standardized data attributes in `<span class="typost-styled">` elements:
- `data-font-id` - Font family ID (matches block-level `fontId` naming convention)
- `data-fontsize` - Font size value
- `data-fontweight` - Font weight value
- `data-features` - Comma-separated OpenType feature codes
- `data-textcase` / `data-fakesmallcaps` - Case (v2.3.3+, #214), written by the inline editor; `data-fakesmallcaps="false"` only with a small caps value
- `data-style-id` - Paragraph style ID (v2.0.0+, set by extension). A style apply writes no inline `style`; a CSS class provides rendering. Since #450 a change the author makes in the inline editor on that text writes a declaration for that key only (the apply patches the span, `isStyleSpanChange()` / `buildStyleSpanAttributes()` in `block-editor.js`), and Inherit removes it, so "Update Style" still restyles every key the author did not change. Under a `data-style-id`, a `data-*` attribute counts as the text's own value only when the span's `style` declares that property; otherwise the editor reads the style's current value (`resolveStyleSpanAttributes()` in `inline-apply-rules.js`). The style CSS adds a bold rule (`max(700, bolder(W))`, for a style with a weight) and an emphasis rule (for `font-style: normal`), so `<strong>`/`<b>` and `<em>`/`<i>` inside or around styled text still show
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
- See `applyOrMergeStyling()` and `applyStylingSafeStringMethod()` in [utils.js](../../blocks/typography-stylist/utils.js)
- **Escape every attribute a string writer builds (#369):** the span writers set `style` with `setAttribute()`, and the serializer writes quotes as `&quot;`. The one writer that builds the span as a string, the plain-text branch of `buildPartialConvertContent()` (`assets/js/inline-editor/convert-to-block.js`), passes the style through `escapeAttribute()` so a feature's quotes do not end the attribute; its style string is the one the shared applier writes. The saved-markup spec cannot catch a broken style (such a block still loads valid); `assets/js/__tests__/partial-convert-fixture.test.js` does. Since #454 both branches write the span from one attribute map (`buildConvertSpanParts().attributes`): the attributes the Quick Feature Toggles write for the same settings (`data-font-id`, `data-fontweight`, `data-fontstyle`, `data-letterspacing`, `data-lineheight`, `data-font-variation-settings`; no `data-font`, which the Quick Feature Toggles do not write either), and a raw feature value in `data-feature-settings` as the inline editor's apply keeps it. Feature IDs, the raw value and the axes are sanitized, and every value is escaped, in both branches; `assets/js/__tests__/convert-span-attributes.test.js` compares the two branches. This builder and the inline editor's `buildFormatAttributes()` (`apply-features.js`) differ on purpose in `data-font`, the order of the declarations, the sanitizing and the paragraph-style skip; #472 is to share one builder or pin the differences in a test.

**Preview System:**
Quick Feature Toggle previews detect inline fonts at cursor position:
- `parseInlineFontFamilyAtCursor()` utility function detects `data-font-id` at selection
- Memoized for performance (see `inlineFontFamilyAtSelection` in [hooks/use-qft-selection-styles.js](../../blocks/typography-stylist/hooks/use-qft-selection-styles.js))
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
