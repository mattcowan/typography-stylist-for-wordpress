# Remove all styling and the theme's look

- **Topic:** "Remove all styling" in the Typography Stylist block's toolbar and "Reset Entire Block" in its sidebar, the block made from an empty Paragraph or Heading, the one definition of "a block with no styling of its own" they share, the `fontWeight: ''` value with the sidebar's "Theme default" option, and the weight a font pick writes on such a block.
- **Issues:** #411, #412
- **Code:** `assets/js/theme-look.js`, `blocks/typography-stylist/strip-styles/` (`strip-styles.js`, `strip-content.js`, `strip-styles-button.js`, `empty-source.js`, `theme-default-weight.js`), `blocks/typography-stylist/qft/reset-actions.js`, `blocks/typography-stylist/components/inspector/reset-panel.js`, `blocks/typography-stylist/components/inspector/font-weight-panel.js`, `blocks/typography-stylist/components/inspector/font-family-panel.js`, `blocks/typography-stylist/hooks/use-apply-block-properties.js`, `blocks/typography-stylist/index.js`, `assets/js/inline-apply-rules.js` (`buildConvertBlockAttributes()`), `assets/js/inline-editor/convert-to-block.js` (`isConvertSourceEmpty()`), `assets/js/block-editor.js` (`convertToBlock()`), `assets/js/font-weights.js` (`resolveFontPickWeight()`); tests `assets/js/__tests__/theme-look.test.js`, `assets/js/__tests__/font-pick-weight.test.js`, `blocks/typography-stylist/__tests__/strip-content.test.js`, `strip-styles.test.js`, `strip-styles-button.test.js`, `empty-source-transforms.test.js`, `theme-default-weight.test.js`, `tests/e2e/strip-styling.spec.js`

## One definition: `assets/js/theme-look.js`

Every path that takes a block back to how the theme shows its tag reads the same lists: "Remove all styling", "Reset Entire Block", both block transforms from an empty source, the `transformedBlock` filter, and Convert to block on an empty block. The module is CommonJS with no `wp.*` globals because the inline editor's browserify build (`convertToBlock()`) loads it as well as the block's build (the rule in the guide: shared code goes in an `assets/js/` module that both builds load).

Every attribute the block can store (block.json, plus the attributes its `supports` add) is in exactly one of four lists:

| List | Attributes | What happens |
|---|---|---|
| `THEME_LOOK_PLUGIN_ATTRIBUTES` | `features`, `fontFamily`, `fontId`, `fontWeight`, `fontStyle`, `fontSize`, `fontSizeMin/Preferred/Max`, `fitLineSizes`, `fitMaxSize`, `fitWordSizes`, `fitLineHangs`, `initialHang`, `letterSpacing`, `lineHeight`, `textCase`, `fakeSmallCaps`, `fontVariationSettings`, `styleClass` | set to the block.json default, except `fontWeight: ''`; `fontSize: 'inherit'` with 16/32/64 writes no size |
| `THEME_LOOK_WORDPRESS_ATTRIBUTES` | `style` (color, spacing, line height, Line indent), `textColor`, `backgroundColor`, `className`, `textAlign` | set to `undefined`, which removes them (`setAttributes`, `createBlock` and the serializer skip `undefined`) |
| `THEME_LOOK_KEPT_ATTRIBUTES` | `content` (stripped separately), `tagName`, `align` (wide/full), `anchor`, `fontSizeUnit`, `screenReaderClass`, `lock`, `metadata` | kept: not styling (the width is layout, the screen reader class is an accessibility setting, `metadata` holds the block name, notes and visibility) |
| `THEME_LOOK_UNDECIDED_ATTRIBUTES` | `layeredConfigId`, `animationConfigId` | left as they are: extension plugins store them and give them meaning |

`theme-look.test.js` reads block.json and fails when an attribute is in no list or in two, when a list names an attribute the block cannot store, and when block.json has a `supports` key at any depth that its `SUPPORT_ATTRIBUTES` table does not know (the table records which attributes each support adds, read in WordPress 7.1.3; `border.color` would add `borderColor`). Controls in the same file plant a new attribute, a duplicate and an unknown support path (`border.color`, `typography.letterSpacing`) and see them reported. So a new attribute or support cannot ship until someone decides whether "Remove all styling" resets it. What the test cannot see: attributes another theme or plugin adds to every block through a filter (not in block.json); they are not touched.

`buildThemeLookAttributes()` returns new arrays on every call, so a caller never shares an array with a block.

## `fontWeight: ''` and "Theme default"

`save.js` writes `font-weight: N` for any non-empty `fontWeight` (`if (fontWeight)`), and the editor preview does the same (`editor-style.js`). The block.json default `'400'` therefore renders a heading at 400 in a theme that makes headings bold. `''` writes nothing, so the tag renders at the theme's weight (or the paragraph style's, or a parent's). `save()` already wrote the `''` form: the old Reset Entire Block stored it. So there is no new markup form and no deprecation (#412 says "no other setting"; storing `''` was accepted as "no weight", decision D2 of the #411 report).

`''` is now common, so the sidebar Font Weight select needed an option for it: without one it showed its first option ("100 (Thin)") while the text rendered at 700. `buildSidebarWeightOptions()` (`strip-styles/theme-default-weight.js`) puts "Theme default" (value `''`) first, after `getFilteredWeightOptions()` has filtered the font's weights, so no filter removes it. When the panel shows is unchanged (`shouldShowWeightPanel()`: the font has more than one weight; "Theme default" does not count), and a variable font set to "hide weights" still gets the Variable Fonts module's slider through `typost_weight_control`. The select also got its missing accessible name: `label="Font Weight"` with `hideLabelFromVision` (an existing string; Chromium showed `name: ""` before). Measured (Chromium accessibility tree, Firefox DOM): after a strip and after an empty conversion the select shows "Theme default" and the text renders 700; a saved block with `'400'` shows "400 (Normal)" and renders 400; a saved block with `''` (old reset) shows "Theme default". A paragraph style on the block still wins with `''`. The Quick Feature Toggles' weight select is for the selected text and keeps "Inherit from block"; the inline dialog's select shows the rendered weight (`getEffectiveFontWeight()`).

## A font pick on a block with no weight (#411 review, round 2)

`getClosestWeight('', weights)` cannot place `''` (`parseInt` gives NaN) and returned the font's first weight, so a font pick turned a theme-bold heading light. `resolveFontPickWeight(currentWeight, availableWeights, renderedWeight)` in `assets/js/font-weights.js` decides instead:

- `currentWeight` not `''`: exactly what the pickers wrote before (`getClosestWeight()`, or the only weight of a one-weight font). A Jest grid holds this against a copy of the old panel logic, 10 weights × 5 fonts.
- `''` and the font has the weight the text renders at now: `''` stays, so the theme still decides.
- `''` and the font does not have it: the closest weight the font has.
- `''` and the rendered weight is unknown: `''` stays. A guess would change the look; with `''` the browser picks the nearest face itself.

The rendered weight is `detectBlockComputedWeight(clientId)` (utils.js), the computed weight of `.typost-block-content` in the canvas iframe, which includes the theme rule, a paragraph style class and inheritance from a parent; it returns the weight through `normalizeRenderedWeight()` (`font-weights.js`), the one place that maps keywords (`normal` 400, `bold` and `bolder` 700, `lighter` 300) and gives `''` for anything that is not a whole number. Callers: the sidebar Font Family control (`font-family-panel.js`; `edit.js` passes `clientId` instead of the unused `getClosestWeight`) and the apply bridge (`use-apply-block-properties.js`), only when the event sets a font and the weight would be `''`. A `fontWeight` in the event still wins; the Paragraph Styles module always sends one (`normalizeApplyProperties` defaults it to `'400'`), and the Variable Fonts module sends no font. Not changed: the Quick Feature Toggles' font control skips the check while the selection's weight is `'inherit'`, and the inline dialog uses `this.state.fontWeight || '400'`.

Measured with the real Font Family control (Chromium base and branch, Firefox branch):

| Block → font | Before | Now |
|---|---|---|
| `''` → Fira Sans (300–900) | `'300'` | `''`, renders 700 |
| `'700'` → Fira Sans | `'700'` | `'700'` |
| `''` → an Adobe Fonts family with 400 and 700 | `'400'` | `''`, renders 700 |
| `''` → a kit with only 400 | `'400'` | `'400'` (closest) |
| `''` → a variable font | `'300'` | `''`, renders 700 |
| `''` p with a paragraph style → Fira Sans | `'300'` | `''`; the style's 700 wins |

One undo restores the font and the weight together; a fit-to-width block measures again after the pick.

## Remove all styling (#411)

`StripStylesButton` (`strip-styles/strip-styles-button.js`) is the last element of the block's `BlockControls` in `edit.js`, after the alignment toolbar. It is a real component (it keeps the dialog's open state), so it lives in `strip-styles/`, not in `components/`, whose files are render functions that must not call hooks. Its icon is a draft (a "T" with an eraser, inline SVG: `@wordpress/icons` is not available to the build).

The action is `stripBlockStyles({ content, setAttributes })` (`strip-styles.js`): one `setAttributes(buildStripStylesAttributes(content))` call, so one undo step restores the block, then `speak('All styling removed from the block.', 'polite')`. "Reset Entire Block" in the sidebar runs the same function (`resetEntireBlock()` in `qft/reset-actions.js`). Before #411 it removed only the plugin's spans and wrote a responsive 16/32/64 size, and left bold, italic, links' classes, colors, spacing, alignment and the extra class.

**Confirmation.** The toolbar button asks first only when the Options tab's "Clear Button Confirmation" setting is on (`typost_show_clear_confirmation`, default on, localized as `typostData.showClearConfirmation` and read with `isFlagEnabled()`, see [extension-api.md](extension-api.md) for the string `"0"` trap). Then it has `aria-haspopup="dialog"` and opens a `Modal` titled "Remove all styling?" with the body text as its description (`aria={{ describedby }}`, an id from `useInstanceId`; the prop exists since WordPress 5.8). The dialog takes focus, keeps Tab inside, closes on Escape and Cancel with focus back on the button, and "Remove styling" strips and returns focus to the button. Its class starts with `typost-`, so `installModalFocusGuard()` covers it, and it has no `Notice`, so nothing is spoken before its name ([screen-reader-rules.md](screen-reader-rules.md)). The sidebar keeps its own inline confirmation ("Reset Entire Block?", "Yes, Reset All"), which shows every time, whatever the option says (decision D5). The two share the body text string. Neither has a "do not show again" checkbox.

## What the content stripper keeps (`strip-content.js`)

`stripBlockContent()` parses the content with `DOMParser` (no script runs, nothing loads; unclosed markup closes as a browser closes it; a RichTextData object is read through `String()`) and writes it back as RichText writes content (`escapeEditableHTML()` for text, `escapeAttribute()` for attribute values), so the stored string is what the editor would store after an edit. A second strip changes nothing (each kept form is tested for this).

- **Removed, text kept:** the plugin's spans, bold, italic, underline, strikethrough, inline code, keyboard input, highlight and inline text color (`mark.has-inline-color`), and any other element (an unknown span, a pasted `<font>`, `<del>`, `<ins>`). A `lang` on a removed element is lost.
- **Kept, formats inside removed, attributes from `KEPT_ATTRIBUTES` only:** links (`a`: `href`, `target`, `rel`, `id`, `data-type`, `data-id`, which core/link writes, plus `aria-label`, `aria-describedby`, `title`, `hreflang`, `download` and `lang`, which carry meaning; the link's own `class` is styling and goes), line breaks, subscript and superscript (removing them changes the text: 10<sup>3</sup> would read 103), language (`bdo` with `lang` and `dir`), abbreviations (`abbr` with `title`, the expansion) and notes (`mark.wp-note` with `data-id`, written back with exactly `class="wp-note"`). The lists come from WordPress 7.1.3 `format-library`. `style`, other classes, event attributes and the plugin's `data-*` attributes go.
- **Kept whole, attributes and all:** inline images (core's image format writes their size as a style), footnote anchors (`sup[data-fn]`, written by core and found by the Footnotes block by id) and formulas (`math`, `svg`: their markup is the content). Nothing is added to them, and `script`/`style` inside them still go.
- **Dropped with their content:** `script` and `style`. A `template` writes nothing either (DOMParser keeps its content out of `childNodes`), and comments are dropped.

Measured: a source with a plugin span, bold, an em inside a link and a br stores exactly `Moonlit garden party<br><a href="https://example.com/x">link</a>`, and the only attributes left are `{content, tagName, fontWeight: '', align: 'wide', anchor}`. For all 8 tags (div compared with a core p), the computed family, size, weight and line height equal a core block's, in the editor and on the frontend, with the test site's theme and with a WordPress default theme. Saved, reloaded: valid and not dirty. The e2e spec compares the stored attributes character for character and checks one undo.

## A block made from an empty block (#412)

`isEmptyBlockContent(html)` decides "empty" for every path: only whitespace (`\s`, so also non-breaking spaces and the byte order mark), the zero-width characters U+200B, U+200C, U+200D and U+2060 (built from char codes so the source holds no invisible character), line breaks and empty elements (an empty plugin span). An inline image, `picture`, `svg`, `math`, `video`, `audio`, `iframe`, `object`, `embed` or `canvas` is content. `buildEmptySourceBlockAttributes(tag, unit)` gives the theme's look plus the source's tag, the new-content unit (#248) and `content: ''` (decision D6: spaces, a br or empty spans are dropped, not kept in a stripped form). The block stores `{"tagName":"p","fontWeight":""}` (for h2: `{"fontWeight":""}`).

- **Transforms** (`index.js`, from `core/paragraph` and `core/heading`): an empty source returns `createBlock('typost/block', buildEmptySourceBlockAttributes(…))` before the weight is read from the canvas. A source with text converts as before (36 text cases across all source variants: 0 differences in attributes or computed style).
- **`blocks.switchToBlockType.transformedBlock` filter, priority 20** (`resetEmptySourceBlock()` in `empty-source.js`, registered in `index.js`). After a transform, WordPress runs its own filters on the result at the default priority 10, and since WordPress 6.1 `core/customClassName/addTransforms` and `core/color/addTransforms` copy the source's extra class (a paragraph style on a core block is such a class, #219) and its text and background colors to the new block (read in 7.1.3). On the base, an empty `p` with `typost-ps-2` became a block that rendered at the style's 64px and 700 that way. The filter runs after them and applies the theme's look again, only when one empty `core/paragraph` or `core/heading` became one `typost/block`; every other transform is returned unchanged. It keeps the result's tag, unit and `metadata`. The filter exists since WordPress 5.8 (Gutenberg 10.7, `packages/blocks/src/api/factory.js`), with the arguments `(result, source, index, results)`.
- **Convert to block in the inline dialog** (`convertToBlock()` in `block-editor.js`): when the block is not a Typography Stylist block already and `isConvertSourceEmpty(currentBlock.attributes.content, getTextContent(value))` is true, it replaces the block with `buildConvertBlockAttributes({ emptySource: true, isNewBlock: true, tagName, fontSizeUnit })`, which returns `buildEmptySourceBlockAttributes()`: nothing of the dialog's state and nothing of the source. On the base this stored the inherited `fontWeight: '700'` and the dialog's `fontSizePreferred: 24` / `fontSizeMax: 32`, and kept spaces, a br or an empty span. The `require` of the convert module sits inside the method so the change stayed inside `convertToBlock()`.

**The Pullquote case (review of #412).** The first version tested the `content` attribute only. A block whose text is not in `content` (a core Pullquote; the `typost-convert-to-block` event reaches the inline editor in any rich text block) then counted as empty, and Convert to block replaced its text with an empty block. `isConvertSourceEmpty(blockContent, valueText)` tests the same text the whole-block conversion uses: the `content` attribute when there is one, else the text of the RichText that holds the caret. That text is plain text, so it is HTML-escaped before the test (round 2): `'<b>'` and `'&nbsp;'` typed as text are not empty. Measured: a Pullquote "Quoted words" converts to `{content: "Quoted words", tagName: "h2", fontWeight: "400"}` on base and branch alike; an empty Pullquote gives `fontWeight: '400'` on the base and `''` now. The two transforms cannot have this mistake: they are registered only for `core/paragraph` and `core/heading`, which have a rich-text `content` attribute, and the filter acts only on those two names.

## Known, not fixed

- Core hides the block toolbar on an empty default Paragraph, so the switcher and the inline button cannot be reached there; authors use List View or the sidebar.
- In the sidebar confirmations, "Yes, …" and "Cancel" unmount with the confirmation, so focus is lost (older than #411; read only).
- A whole-block Convert to block of a source with text still stores the dialog's slider defaults `fontSizePreferred: 24` / `fontSizeMax: 32`; nothing renders while the size is `inherit`, but a later switch to Responsive starts at 24/32.
- In the editor, the margins of `.typost-block-content` differ from a core block's (p 16/16 against 0/0, h2 4/16 against 24/0). No CSS was added.
- `index.js` builds the heading tag as `'h' + attributes.level`, which gives `'hundefined'` with no level (an older pattern, reused).

## Traps

- A new attribute in block.json, or a new `supports` key, fails `theme-look.test.js` until it is put in one list of `theme-look.js`. Decide whether it is styling.
- Do not reset `fontWeight` to `'400'`: it writes `font-weight: 400`. Use `''`.
- Do not judge an empty source on the `content` attribute alone (the Pullquote case), and do not test RichText plain text as markup.
- Do not move the `transformedBlock` filter to priority 10 or lower: WordPress's copies of the class and colors would run after it.
- Extension attributes (`layeredConfigId`, `animationConfigId`) stay after a strip. Letting each extension clear its own needs a JS filter on the reset attributes and a HOOKS.md entry (decision D3, not done).
