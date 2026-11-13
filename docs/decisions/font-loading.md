# Font loading

- **Topic:** which fonts load where: Adobe Fonts kits in the block editor, font detection on archive and singular pages, and the detection caches.
- **Issues:** #230 (and the v1.1.9 hook timing)
- **Code:** `typography-stylist.php` (`enqueue_adobe_fonts()`, `get_editor_used_fonts()`, `detect_frontend_fonts()`, `enqueue_custom_fonts_optimized()`), `includes/class-typost-assets.php`, `assets/js/editor-font-kits.js`

Moved from the root [CLAUDE.md](../../CLAUDE.md) by #361. Font Library faces are in [font-library-integration.md](font-library-integration.md); fonts referenced only through a paragraph style class (`typost_content_font_ids`) are in [extension-api.md](extension-api.md).

## Font Loading Architecture (v1.1.9+)

**Adobe Fonts kits in the block editor (v2.3.1, #230):** `enqueue_adobe_fonts()` no longer loads every kit when `is_admin()`. In the editor it applies the frontend rules (load on all pages, forced IDs, used fonts + replacement chain) with `get_editor_used_fonts()` as "the page": a raw-content scan of `get_post()` (no `the_content`/rendering; `parse_blocks` + the `data-font`/`--font-N`/`data-font-id` regexes + `typost_content_font_ids`; synced patterns are saved as `{"ref":N}` only, so `get_synced_pattern_content()` appends each referenced `wp_block`'s content, nested, with a visited set and a depth cap), memoized because the method runs for the canvas (`enqueue_block_assets`) and the editor page (`enqueue_block_editor_assets`). Site/widgets editors have no post and get none. `assets/js/editor-font-kits.js` (hand-written ES5, no build, `typost-editor-font-kits`, a dependency of `typost-block-editor`) covers the rest: a `wp.data.subscribe` that, at most once per 250 ms (a throttle: later dispatches do not reset the timer, so a steady dispatch stream cannot starve it; the subscription fires on every dispatch to any store), reads every block's attributes through `getClientIdsWithDescendants()` + `getBlockAttributes()` and re-scans when any attributes reference changed (`listsDiffer()`, `collectFontIdsFromAttributes()`: `fontId`, `paragraphStyleId`, and font/style references in every attribute — RichTextData via `toString()`, objects/arrays as JSON). **Never `getBlocks()`:** it leaves out the children of blocks that manage their own (synced patterns, template parts, post content in the template view), and an edit inside one does not replace the root array — a review caught fonts in synced patterns never loading. The loader resolves `typostData.fontReplacements` and adds each kit `<link>` to the editor page and every `iframe[name="editor-canvas"]` document. `sync()` runs on every store tick to re-add kits to a rebuilt canvas (device preview/zoom give it a fresh `<head>`); a per-document `__typostKitCount` marker makes that a no-op when nothing changed. A kit PHP enqueued carries `?ver=`, so presence is compared without the query. Previews of a font not yet in a block call `window.typostFontKits.ensureFontId()`: the inline modal (`componentDidUpdate` on `selectedFontId`), the Paragraph Styles browser (every style's font on open), and the Glyphs panel (via the `window.typostAdminFonts` alias). `adobeCssUrlsForFontId()` is duplicated from `admin-page.js`; a Jest parity test keeps the twins equal. Measured on a 77-kit site: 154 → 9 kit requests opening a post; canvas faces unchanged.

**Hook Timing for Font Detection:**
The plugin uses different WordPress hooks for font detection depending on page type:

**Archive Pages** (blog home, category, tag, date, author archives):
- `template_redirect` (priority 1) → `detect_frontend_fonts()` detects fonts AFTER main query executes
- `wp_enqueue_scripts` (priority 10) → `enqueue_frontend_assets()` uses cached detection results
- `wp_enqueue_scripts` (priority 10) → `enqueue_custom_fonts_optimized()` outputs @font-face CSS

**Singular Pages** (posts, pages, custom post types):
- `wp_enqueue_scripts` (priority 10) → Uses existing detection logic with `get_queried_object()`
- No changes to singular page code path (already works correctly)

**Why This Architecture:**
- Not true, kept as history: the 1.1.9 change (`changelog.txt`) gave the reason as "`wp_enqueue_scripts` (before query)", and this list said that `$wp_query->posts` is empty during `wp_enqueue_scripts` on archive pages. In core's order `wp()` runs the main query first (`wp-blog-header.php`, `WP::main()` → `query_posts()`), then `template-loader.php` fires `template_redirect`, and `wp_enqueue_scripts` fires later from `wp_head` (`default-filters.php`, checked on WordPress 7.1.3). The code does not record the real reason for the move.
- `template_redirect` fires AFTER query execution, so `$wp_query->posts` is populated
- Detection results cached in instance variables (`$detected_fonts`, `$has_styled_content`, `$fonts_detected`)
- Singular pages use `get_queried_object()` which doesn't depend on `$wp_query->posts` array

**Cache Management:**
- Font detection results cached in transients for 12-24 hours
- Manual cache clear button available in Settings → Typography Stylist → Options
- Cache automatically cleared when plugin options change
- Cache keys: `typost_has_styled_*`, `typost_used_fonts_*`, `typost_font_css_*`
