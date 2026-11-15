# Heading level button, remembered tag and the new-block variation

- **Topic:** the block toolbar's "Change heading level" button and menu, the tag a new Typography Stylist block from the inserter starts with, and the one default inserter variation (`typost-new-block`) that carries that tag and the #248 size unit, including how core counts the block's "Most used" uses through it.
- **Issues:** #409, #410 (and #248, whose variation this one replaced)
- **Code:** `assets/js/new-block-tag.js`, `blocks/typography-stylist/heading-levels.js`, `blocks/typography-stylist/components/heading-level-toolbar.js`, `assets/js/block-editor.js` (the `installNewBlockVariation()` call at its end), `assets/js/font-size-units.js` (`buildNewBlockUnitVariation()`); tests `blocks/typography-stylist/__tests__/new-block-tag.test.js`, `blocks/typography-stylist/__tests__/heading-levels.test.js`, `tests/e2e/heading-level.spec.js`

## The button and the menu (#409)

`renderHeadingLevelToolbar({ tagName, setAttributes })` (`components/heading-level-toolbar.js`) is a render function: `Edit` calls it inside `BlockControls`, so it calls no hooks (`__tests__/render-functions-no-hooks.test.js`). The button's icon is the icon of the block's current tag, and its label (also the tooltip) names the tag: `getHeadingLevelButton()` in `heading-levels.js` gives "Change heading level (current: Heading 4)" (one new string, `%s` = the tag's name). The label carries the tag because the icon is the only other place the tag shows, and an accessible name is announced more reliably than a description. The menu keeps the name "Change heading level" through `menuProps['aria-label']`. Each item has its icon and name and `role: 'menuitemradio'`; the current one has `isActive`, which `ToolbarDropdownMenu` exposes as `aria-checked`, as core's own heading level menu does (before #409: `menuitem` with no checked state).

The tag list is `HEADING_LEVEL_TAGS` in `assets/js/new-block-tag.js` (h1 to h6, p, div), which both the menu and the remembered tag read; `heading-levels.js` adds each tag's translated name and icon, and `heading-levels.test.js` holds the two lists together. A stored tag that is not in the menu (a hand-edited block, for example `section`) keeps the `heading` dashicon the button showed before #409, the label names the stored value, and no item is checked. A missing `tagName` is the block.json default, h2.

**Icons are placeholders.** `HEADING_LEVEL_ICON_PATHS` holds block letters drawn as one filled `<path>` each (nonzero fill rule, all strokes clockwise; SVG text would depend on the computer's fonts). They fill y 20 to 236 of a 256 viewBox, the cap height measured in the toolbar for the swash "T", "G" and "P" (20–237, 19–235, 20–231). The final swash artwork replaces the path data there and nothing else; its sources go into `assets/images/icons/` beside `toolbar-t.svg`. Flatten a compound shape into one path and do not rely on `fill-rule="evenodd"`: the counters of a "4", a "6" or a "P" would fill. Each SVG is `aria-hidden="true"` and `focusable="false"` and fills with `currentColor`, so it follows the pressed and top-toolbar colors.

Measured in Chromium and Firefox (#409 report): the accessibility tree has exactly one button named "Change heading level (current: Heading 4)" after a pick of Heading 4, and a menu named "Change heading level" with 8 `menuitemradio` items, one checked. Keyboard path unchanged: Alt+F10, arrow to the button, Enter opens the menu on Heading 1, Escape returns focus to the button. After a keyboard pick, Firefox puts focus on the canvas iframe and Chromium on the button; the base does the same in Firefox, so it is not from #409 (probably core's DropdownMenu with the iframe canvas; not reported upstream).

## The remembered tag (#410)

A pick in the menu writes `tagName` as before and calls `rememberNewBlockTag(tag)`, which stores the tag in `localStorage['typography_stylist_new_block_tag']` and calls `syncNewBlockVariation()` so the next block from the inserter starts with it without a reload. **Heading 1 is never remembered** (`NEVER_REMEMBERED_TAG`): a page usually has one, so a pick of h1 leaves the stored tag as it was. `readRememberedTag()` accepts only a value `isRememberableTag()` accepts (h2 to h6, p, div), so junk, another version's value or a throwing storage counts as nothing remembered; a refused write leaves the pick on that block only.

The tag is per browser and per origin, like the dismissed tips: every user of one browser shares it, and so do all sites of a subdirectory multisite. Another tab of the same origin follows a pick through the `storage` event (`installNewBlockVariation()` listens for the key, and for `key === null`, which `localStorage.clear()` fires); after junk or a clear in tab A, tab B gets the variation with no tag and its next block is h2.

Only blocks from the inserter follow it: the main and quick inserters, the slash command and drag from the inserter (core's `getInserterItems` replaces the block's own item with its `isDefault` variation and inserts with the variation's attributes, `getItemFromVariation` → `initialAttributes`). Everything that creates a block in code keeps its own tag: a transform and Convert to block take the source's tag (h3, h6 and p from core Heading 3, Heading 6 and Paragraph; h5 from Convert to block on a Heading 5, measured), `createBlock('typost/block')` with no `tagName` gives h2, and duplicate, copy and paste and patterns carry the stored tag (pasted markup with no stored tag is h2 while h4 is remembered). block.json keeps the `'h2'` default: like `fontSizeUnit` (see [font-size-units-and-zoom.md](font-size-units-and-zoom.md)), the default also decides how a saved block with no stored tag parses, so it cannot follow the author. A remembered h2 adds no attribute to the variation: it equals the default, which the serializer does not store.

## One variation for the tag and the unit

Core keeps one default variation per block. #248 already registered one on px sites (`typost-new-font-size-unit`, `{ fontSizeUnit: 'px' }`), so `buildNewBlockVariation(unit, tag)` builds the one variation that carries both: `fontSizeUnit: 'px'` from `buildNewBlockUnitVariation()` on a px site, and `tagName` when a tag other than h2 is remembered. `syncNewBlockVariation()` unregisters our name and #248's old name and registers it again, because core keeps the first variation of a name (`getUniqueItemsByName`), so an update needs the unregister to reach the inserter. It does nothing when the registered variation already has the same attributes and a function `isActive`; it compares the form of `isActive`, not the function object, because each build bundles its own copy of the module (the inline editor's browserify build installs the variation at load; the block's wp-scripts build remembers the pick). It never throws: the editor keeps working when `wp.blocks` lacks the variation API.

`installNewBlockVariation()` is called once, at the end of `assets/js/block-editor.js`, because `typostData` (the new-content unit) is localized on that handle and the block script has no guaranteed order relative to it; variations are keyed by block name, so registering before the block type exists is fine. A Jest source test checks there is exactly one call.

## The inserter count: design B (#409 round 1)

How core counts (read in WordPress 7.1.3 `wp-includes/js/dist/block-editor.js`, and the same in Gutenberg `wp/5.8`, `wp/6.1`, `wp/6.4`, `wp/6.7`): on `INSERT_BLOCKS` and `REPLACE_BLOCKS` the `preferences` reducer records each block's use under `name + '/' + getActiveBlockVariation(name, attributes).name`, or under the bare `name` when no variation is active (line 9129). The inserter item of a variation reads `${item.id}/${variation.name}` (`getItemFromVariation`, line 15155), so a default variation's item reads `typost/block/<variation>`. The "Transform to" menu reads the bare `typost/block` (`getBlockTransformItems`, line 15373). `insertUsage` persists per browser and per user in `localStorage['WP_DATA_USER_<id>']` (`persist: ['preferences']`, 5.8 to 7.1.3). `getActiveBlockVariation()` finds only variations with `isActive`, so with #248's variation (no `isActive`) every insert counted under `typost/block` while the item read `typost/block/typost-new-font-size-unit`: on px sites the block's "Most used" count never rose (the #248 note said it "restarts"; it was 0 for good).

Designs measured on the base build, fresh profile each, 5 real `INSERT_BLOCKS` per step with the inserter item's own attributes (count = the inserter's "Most used" count, T = the "Transform to" count):

| Step | Base rem | Base px (#248) | First #410 build, rem | A rem | **B rem** | **B px** |
|---|---|---|---|---|---|---|
| 5 inserts, nothing remembered | 5 (T5) | 0 (T5) | 5 | 5 | **5** (T0) | **5** |
| pick h4, 5 inserts | 10 | 0 | 0 | 5 (other key) | **10** | **10** |
| pick h2, 5 inserts | 15 | 0 | 15 | 10 | **15** | **15** |
| reload, 5 inserts | 20 (T20) | 0 (T20) | 20 | 15 | **20** (T0) | **20** (T0) |

- **A** (`isActive` only while the variation exists): on rem sites the count jumps between two keys, so the h4 inserts drop out of view after a pick of h2. Rejected.
- **B** (chosen): one variation, always registered under one name (`NEW_BLOCK_VARIATION_NAME = 'typost-new-block'`), on every site and also with no attribute, with a function `isActive` that matches every Typography Stylist block that no other variation claims (next section). Each insert, transform and Convert to block counts under `typost/block/typost-new-block`, the key the item reads, whatever tag is remembered. The array form of `isActive` cannot do this: it cannot match every block, and an empty array is a match in 5.8 but skipped in 7.1.3; the function form is read the same way from 5.8 on.
- **C** (keep both the inserter count and the Transform count): none exists. Core records one key per use.

With the real menu and main inserter (round 2, rem and simulated px the same): 5 inserts → 5, pick h4 → 5, 5 inserts → 10, pick h1 → 10, pick h2 → 10, 5 inserts → 15, one transform from core Heading 3 → 16 (`REPLACE_BLOCKS` counts), reload → 16, 5 inserts → 21.

**Accepted costs (decided in the #409 review):**

- **One-time reset.** Uses counted before 2.4.0 are under `typost/block`, which the item no longer reads: after the update the inserter count starts at 0 once (measured: base 5, update, 0, then 5 after 5 more inserts). On px sites it was 0 already.
- **"Transform to" order frozen.** The old uses under `typost/block` keep ordering the Typography Stylist entry in a core block's "Transform to" menu, and new uses no longer raise it. The inserter is where authors look; the Transform list is short.

**What does not change:** the variation has no title, icon or description, so every place that shows the active variation shows the block's own: block card, List View, breadcrumb, toolbar block icon, the inserter item, the "block added" message, the drag chip (measured base against branch in 8 runs, rem and px, with and without a remembered tag; the only differences were the internal `getActiveBlockVariation()` result, null before, and the inserter item id). Transform-scope and block-scope readers filter by scope (this one is `inserter` only). The plugin and its modules read no active variation (grep for `getActiveBlockVariation`: none).

## An extension's variation wins (#409 round 2)

`isNewBlockVariationActive(blockAttributes, variationAttrs)` returns false when another registered variation of `typost/block` claims the block, so core reports that variation exactly as it does with no variation of ours, whatever the registration order. "Another" is any name except `typost-new-block` and #248's `typost-new-font-size-unit` (`getNewBlockVariationNames()`). A claim is:

- a function `isActive` that returns true for the block's attributes (called with the block's attributes and its own);
- an array `isActive` that matches under **either** core rule (`arrayIsActiveMatches()`): only entries whose first dotted part names an attribute of the block type count, and none counted is no match (all versions); 5.8 to 6.5 compare each whole attribute name with `===` (undefined on both sides matches); 6.6 and later read dotted paths, need the variation to define the value, read rich text as HTML and compare plain objects key by key (`matchesAttributeValue()`, from 7.1.3 `blocks.js` `matchesAttributes`). On a version where only the other rule matches, yielding gives core the result it has with no variation of ours.

A variation with no `isActive` claims nothing (core never finds it active). An `isActive` that throws claims nothing here, in its own try/catch, so a broken extension cannot hide a later one that does claim the block; core still calls it itself. While ours asks the others, the module flag `checkingOtherVariations` is set, so a nested call (an extension `isActive` that asks for the active variation) gets false and sees what it would see with no variation of ours, and nothing loops; `finally` releases the flag. With no `wp.blocks` (Jest, an early call) it returns true; the optional third argument is the `wp.blocks` API for the tests.

Measured with an extension variation `isActive: ['className']` (title "Pull Quote (ext)") on a block with `className: 'is-pull'`, base and branch, rem and px, registered before ours, after ours, and after a tag pick (which puts ours last): every run reports `ext-pull`, shows "Pull Quote (ext)" in breadcrumb, block card and List View, and counts the block's uses under `typost/block/ext-pull`; an ordinary block reports `typost-new-block` and shows "Typography Stylist". Cost on 150 blocks (15 claimed), three repeats: `getActiveBlockVariation()` 1–2 µs per call with ours alone, 3–8 µs with two extension variations, 1–2 µs with none (base); selecting 30 blocks one by one took 8.3–13.0 s in every case, which is headless rendering noise.

**Known gap:** a malformed extension variation can make ours yield on WordPress 6.6+ where core then finds no match, for example `isActive: ['className']` whose `attributes` leave out `className`, on blocks with no `className` (the 5.8 rule matches undefined to undefined; the 6.6 rule needs the value defined). Those blocks then count under `typost/block`, as before 2.4.0, instead of under ours.

## Traps

- Code that reads the active variation of a Typography Stylist block now gets `typost-new-block` (before 2.4.0: null, or an extension's variation). Treat it as "no variation", as the plugin does by showing nothing of it.
- Do not give the variation a title, icon or description: every place that shows the active variation would show it.
- Do not make the variation's name follow the unit or the tag: each name is a separate count key (design A).
- Do not register a second default variation from other code: only one is used. Change `buildNewBlockVariation()`, which already merges the unit and the tag.
- Do not change block.json's `tagName` default to follow the remembered tag: saved blocks with no stored tag would parse as another tag and fail validation.
