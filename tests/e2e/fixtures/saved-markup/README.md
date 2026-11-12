# Saved-markup fixtures

These files hold post content as the editor saved it, one file for each save format and feature of the plugin (#373). The spec `tests/e2e/saved-markup.spec.js` stores each file as a draft, opens it in the editor, and checks:

- Every block is valid.
- Every Typography Stylist block validates through the expected `save()`: the current one, or the frozen `v2` or `v1` entry in `blocks/typography-stylist/deprecated.js`.
- The post is not dirty, and a save writes the stored content unchanged.
- After an edit (the blocks are serialized again), the content is the file byte for byte. For a block that loads through a deprecation, the content is the `.after.html` file: the current `save()` with `"fontSizeUnit":"px"` from the entry's `migrate()`.
- The save stores exactly that content.

`manifest.js` lists the files, what each block must load as, and the paragraph style that two files need. `fit-invariants.js` holds the rules the spec checks on the fit-to-width block (see "Fit to width" below).

## The files

| File | What it holds | Loads through |
|---|---|---|
| `v1-fixed-px.html` | A fixed size (24) saved before #218: no `font-size` in the markup. | `v1` |
| `v1-fixed-px.after.html` | The same block after the upgrade: `font-size:24px`, `"fontSizeUnit":"px"`. | current |
| `v2-responsive-px.html` | A responsive size saved before #233: a px `clamp()`. | `v2` |
| `v2-responsive-px.after.html` | The same block after the upgrade: the same `clamp()`, `"fontSizeUnit":"px"`. | current |
| `responsive-rem.html` | A responsive size in rem, 16 / 16 / 120, with the slope limited for zoom (#234). | current |
| `fit-rem-word-sizes.html` | Fit to width in rem with two lines, `fitLineSizes` and `fitWordSizes` (#235). | current |
| `first-letter-hang.html` | First Letter Hang 0.12 (#242). | current |
| `case.html` | Small Caps with fake small caps off (#214). | current |
| `style-class.html` | A block with a paragraph style class. | current |
| `after-detach.html` | The same block after Detach Style. | current |
| `inline-spans.html` | Inline spans in a core Heading and Paragraphs: a responsive size in rem, a case, a responsive size in px, a fixed size. | core |
| `inline-style-id.html` | An inline span with a paragraph style ID. | core |
| `registered-attributes.json` | The attribute names of each block type on a site with only this plugin (see "Other plugins"). | — |

All content is demo text.

## Notes

- **Paragraph styles.** `style-class.html` and `inline-style-id.html` refer to a paragraph style. A fixture cannot hold a database row, so the files say `{{STYLE_ID}}`, and the spec creates the style `STYLE` from `manifest.js`, puts its ID in, and deletes the style afterwards. The style must exist: for a missing style the editor removes the class from the block, and the post is dirty. A span keeps a missing style's ID.
- **Detach.** `after-detach.html` is what Detach Style wrote on the branch of #373, before #364 changed what Detach writes for a block with an inherited size. It pins how a block detached earlier loads.
- **Fit to width.** The editor measures the lines of a fit block when it opens, and stores the ratios. The ratios depend on the fonts the machine has, the browser and the theme: the same block measured 0.1444 on a wp-env site and 0.1484 on a site with another theme. So the spec does not compare the numbers with the file. It checks the rules that tie them together (`fit-invariants.js`): each line's ratio in its `font-size` is `fitLineSizes[i]`, each line's word cap is `fitWordSizes[i]` when that is larger than the ratio and the ratio otherwise, and for these lines of two words the word size is larger than the ratio. It compares the rest of the block byte for byte. When the numbers differ from the file, the test adds a "measured" annotation with both sets.

Where the editor measures the same numbers, nothing changes and the spec requires that the post is not dirty. Where it measures other numbers, it stores them. That write is marked as not persistent, so by design the post stays clean, but the plugin sometimes leaves the post dirty after it (a known bug: seen on a site whose theme measures other numbers, dirty on some opens and clean on others). So in that case the spec only reports the dirty flag in the "measured" annotation and does not check it.
- **px inline span.** It was written with the "Write new font sizes in px" setting simulated in the page (`typostData.newFontSizeUnit = 'px'`, the value the setting sends to the editor), so no site option was changed.
- **Other plugins.** Another plugin can add attributes to these block types. On a block that loads through a deprecation, such an attribute can appear in the block comment when the block is serialized again. The spec leaves out of its comparison every attribute that is not in `registered-attributes.json`, and adds a "foreign attributes" annotation when it does. On a site with only this plugin (wp-env in CI) there are none, and the comparison is byte for byte.
- **Users.** The fixtures are for a user with `unfiltered_html` (an administrator on a single site, such as the wp-env admin). For other users, kses filters inline styles on save.

## Regenerating

Generate the files on a fresh wp-env site with only this plugin, after a build:

```bash
npm run build
npx @wordpress/env start
WP_BASE_URL=http://localhost:8888 WP_USERNAME=admin WP_PASSWORD=password \
  node tests/e2e/fixtures/saved-markup/generate.js
```

Give file names to write only those files. The script reads every file from the real editor; nothing is typed by hand:

- `v1` and `v2`: the deprecated entry's own `save()`, run in the editor page, with core's serializer for the block comment. The `.after.html` files: the editor opens the old markup and serializes it again.
- Typography Stylist blocks: inserted with the attribute values that the Inspector controls set, and saved by the editor. Fit to width: the editor measures the lines.
- Paragraph styles, Detach and inline spans: the sidebar Paragraph Style select, Detach Style, and the inline Typography Stylist Features dialog. A style is applied to selected text with the event that the style browser sends, built by the module's `buildApplyEventDetail()`.

The script makes drafts and paragraph styles named "ZZ E2E fixture …" and deletes each one by its ID. It stops when the site writes new font sizes in px.

A known limit: on a site with `SCRIPT_DEBUG` on (wp-env turns it on), the inline dialog ignores `typost-apply-block-properties` events, so `inline-spans.html` and `inline-style-id.html` cannot be generated there. This is a bug in the inline editor, found while writing these fixtures. Until it is fixed, generate those two files on a site with `SCRIPT_DEBUG` off, as was done for the files here.

After you regenerate, run the spec, and review the diff of each file: a changed fixture is a changed save format.
