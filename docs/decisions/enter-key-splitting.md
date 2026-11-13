# Enter key and block splitting

- **Topic:** what Enter does in the Typography Stylist block (a line break, or a split when `typost_block_enter_line_break` is off), and why `identifier="content"` is set only when splitting is on.
- **Issues:** none (v2.3)
- **Code:** `typography-stylist.php` (`filter_block_splitting_support()`), `blocks/typography-stylist/edit.js`, `blocks/typography-stylist/block.json`

Moved from the root [CLAUDE.md](../../CLAUDE.md) by #361.

**Enter key / block splitting (v2.3+):**
WordPress decides Enter entirely from core's `splitting` block support: with it, writing-flow calls `__unstableSplitSelection()`; without it, `RichText` inserts a line break. The plugin adds the flag in `filter_block_splitting_support()` (a `block_type_metadata` filter around `register_block_type()`) when `typost_block_enter_line_break` is off — server-side, because the block script and the `typostData` localization are different handles with no guaranteed order. `block.json` stays unchanged so the default is static.
Splitting additionally needs the caret's `attributeKey`, which is why `edit.js` sets `identifier="content"` on the `RichText` — the `content` attribute has no `source`, so core's `findRichTextAttributeKey()` fallback finds nothing and the split silently no-ops *after* writing-flow has already `preventDefault()`ed the key, killing the line break too (Enter would do nothing at all). The identifier is set **only when splitting is enabled**: a live `attributeKey` also arms core's "enter transforms", which would turn a URL-only block into an embed. `edit.js` reads `hasBlockSupport('typost/block', 'splitting', false)` rather than the option, so there is one source of truth. Core intentionally converts the split's tail to the default block (paragraph), matching `core/heading`.
