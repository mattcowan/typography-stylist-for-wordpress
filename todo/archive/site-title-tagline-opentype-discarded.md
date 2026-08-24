# Block-level OpenType support for `core/site-title` and `core/site-tagline`

**Status:** not started. Investigated 18 August 2026; the finding below is
verified, the solution is not.

## The problem

Typography Stylist's inline format does not appear on `core/site-title` or
`core/site-tagline`, so a site title cannot be given swashes, stylistic sets or
any other OpenType feature from the editor.

This is **not a gap in the plugin's allow list.** There is no list to add to.

## What was verified

Both core blocks pass `allowedFormats: []` to their `RichText`, which permits
*no* inline formats at all. From `wp-includes/js/dist/block-library.min.js` in
WordPress 7.0:

```js
RichText, {
  tagName: l ? "a" : "span",
  "aria-label": __("Site title text"),
  placeholder: __("Write site title…"),
  value: u, onChange: f,
  allowedFormats: [],
  disableLineBreaks: true,
  ...
}
```

Confirmed in the running editor, with `core/heading` as a control:

| Block | Toolbar buttons offered |
| --- | --- |
| `core/site-title` | Site Title, Drag, Move up/down, Change level, Align text, Options |
| `core/site-tagline` | Site Tagline, Drag, Move up/down, Change level, Align text, Options |
| `core/heading` (control) | …Align text, **Typography Stylist Features, Glyphs, Bold, Italic, Link**, More, Options |

Core's own Bold, Italic and Link are absent from those two blocks as well. The
`typost/features` format *is* registered globally (checked via
`wp.data.select('core/rich-text').getFormatTypes()`) — WordPress filters every
format out before any of them is consulted.

**Do not** attempt to fix this by registering the format differently, filtering
`allowedFormats`, or reaching into the block's `edit`. The value is passed
inline to an inner `RichText` inside core's component; there is no supported
seam, and anything that worked would break on a core update.

## What to build instead

Block-level typography for these two blocks, applied to the block wrapper
rather than to a text selection. A site title is one short string, so
block-level is arguably the right granularity anyway — per-word styling is not
the thing anyone is asking for here.

Rough shape:

1. **Extend the two block types** with a `typostFeatures` attribute (and
   probably `fontId`, `fontWeight`, `letterSpacing`) via the
   `blocks.registerBlockType` filter, scoped to `core/site-title` and
   `core/site-tagline` only.
2. **Add an Inspector panel** through `editor.BlockEdit`, reusing the existing
   OpenType feature UI rather than building a second one. The feature list,
   grouping and font picker already exist — see how the Quick Feature Toggle
   composes them in `blocks/typography-stylist/edit.js`.
3. **Emit the styles.** Two candidate routes, and this is the real design
   decision:
   - `blocks.getSaveContent.extraProps` to write `style` / `class` onto the
     saved markup. Simple, but these are **dynamic** blocks — their front-end
     HTML comes from PHP, not from saved content, so this may not apply.
   - A `render_block` filter in PHP that reads the attributes and adds the
     inline style or class to the wrapper. Almost certainly the correct route
     for dynamic blocks. **Confirm which before writing the JS.**
4. **Font loading.** The per-page font detection scans content for
   `var(--font-N)`. A site title lives in a template, not post content, so
   check whether detection sees it. If not, the font must be forced —
   `typost_force_enqueue_font_ids` already exists for exactly this case and
   may be the whole answer.

## Open questions to settle first

- Are `core/site-title` / `core/site-tagline` rendered from saved content or
  purely server-side? This decides step 3 and should be answered before any
  code is written.
- Should this generalise? A `typost_block_level_typography_blocks` filter
  listing block names would cover `core/post-title`, `core/query-title` and
  `core/site-title` in one mechanism instead of special-casing two blocks.
  Probably yes — but confirm the render path is the same for all of them.
- Does the Site Editor load the plugin's editor assets? `enqueue_block_editor_assets`
  fires there, but this was never verified. Check before assuming the panel
  will appear where a site title is actually edited.

## The workaround, meanwhile

Documented in the theme-integration guide
(`/docs/typography-stylist/developer/theme-integration/`): apply the features
in theme CSS.

```css
.wp-block-site-title {
	font-family: var(--font-12, serif);
	font-feature-settings: "dlig" 1, "swsh" 1;
}
```

Pair it with `typost_force_enqueue_font_ids` so the font actually loads, since
nothing in the page *content* references it.

## Testing notes

- Test in the **Site Editor**, not just the post editor — that is where a site
  title is normally edited, and it is a different asset-loading context.
- Watch for the same trap the docs hit: a screenshot or an instruction that
  assumes the post editor will be wrong for this feature.
- Add Jest coverage for the attribute/style mapping, following the existing
  pure-function pattern in `blocks/typography-stylist/utils.js`.
