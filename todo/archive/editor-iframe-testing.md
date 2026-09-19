# Block Editor Iframe vs Non-Iframe Testing

## When Does WordPress Use an Iframe for the Block Editor?

WordPress 5.4+ introduced the concept of an "iframed" block editor, and it has become the default in newer versions. The behavior depends on several factors:

### Iframed Editor (Modern Default)

The block editor renders inside an `<iframe name="editor-canvas">` when:

1. **WordPress 6.0+**: The iframed editor became the default for the **Site Editor** (Full Site Editing / Appearance > Editor).
2. **WordPress 6.3+**: The iframed editor became the default for the **Post/Page Editor** as well.
3. **Theme declares `editor-styles` support**: Themes that call `add_theme_support('editor-styles')` enable the iframe to properly isolate theme CSS. Most modern themes (including Twenty Twenty-Five) do this.
4. **Block themes (block-based themes)**: Always use the iframed editor in the Site Editor.

### Non-Iframed Editor (Legacy)

The block editor renders directly in the admin page DOM (no iframe) when:

1. **WordPress < 6.3**: Post/page editor was not iframed by default.
2. **Classic themes without `editor-styles` support**: Some older themes that don't declare `editor-styles` may fall back to the non-iframed editor.
3. **Plugins that force non-iframe**: Some plugins explicitly disable the iframe via the `should_load_iframe_scripts` filter or by dequeuing iframed editor assets.
4. **WordPress < 6.0 Site Editor**: Early FSE implementations before iframe was default.

### How to Force Non-Iframe for Testing

To test the non-iframed editor, you can:

```php
// In a must-use plugin or theme's functions.php:
add_filter('block_editor_settings_all', function($settings) {
    // Force non-iframed editor
    $settings['__unstableIsBlockBasedTheme'] = false;
    return $settings;
});
```

Or use a classic theme without `editor-styles` support.

### Key Filter

The `should_load_iframe_scripts` filter (introduced in WP 6.3) controls whether scripts/styles are loaded for the iframed context:

```php
add_filter('should_load_iframe_scripts', '__return_false');
```

## Why This Matters for Typography Stylist

### CSS Loading Differences

| Hook | Iframed Editor | Non-Iframed Editor |
|------|---------------|-------------------|
| `admin_head` | CSS on outer page only (NOT in iframe) | CSS available to editor |
| `enqueue_block_assets` | CSS loaded in BOTH outer page and iframe | CSS loaded in admin page |
| `enqueue_block_editor_assets` | Scripts/styles on outer page only | Scripts/styles on admin page |
| `wp_add_inline_style()` via `enqueue_block_assets` | Inline CSS injected into iframe | Inline CSS on admin page |

### Our Current Approach

We use `enqueue_block_assets` with `wp_add_inline_style()` for the paragraph styles CSS. This works in both contexts:

- **Iframed**: WordPress copies enqueued block assets (including inline styles) into the iframe's `<head>`. The CSS targets `.typost-styled[data-style-id="N"]` spans inside the iframe.
- **Non-iframed**: CSS is on the admin page, where the editor DOM also lives.

### Verified Working (March 2026)

- WordPress 7.0-beta2 with Twenty Twenty-Five theme
- Editor uses iframe (`<iframe name="editor-canvas">`)
- `typost-paragraph-styles-inline-inline-css` style element present inside iframe
- CSS variables (`--font-15`) resolve correctly inside iframe
- Computed styles match expected values

## Testing Checklist

When testing paragraph styles CSS, verify in both environments:

### Iframed Editor Test
- [ ] Activate a block theme (e.g., Twenty Twenty-Five)
- [ ] WordPress 6.3+
- [ ] Open post editor — confirm `<iframe name="editor-canvas">` exists
- [ ] Apply paragraph style — verify font/weight/spacing changes visually
- [ ] Inspect iframe `<head>` — confirm `typost-paragraph-styles-inline-inline-css` is present
- [ ] Verify CSS variables (`--font-N`) resolve inside iframe

### Non-Iframed Editor Test
- [ ] Activate a classic theme (e.g., Twenty Twenty-One) without `editor-styles` support, OR use the filter above
- [ ] Open post editor — confirm NO iframe (editor DOM is directly in admin page)
- [ ] Apply paragraph style — verify font/weight/spacing changes visually
- [ ] Inspect page `<head>` — confirm paragraph styles CSS is present
- [ ] Verify CSS variables resolve correctly

### Frontend Test (Both Cases)
- [ ] View post on frontend
- [ ] Inspect `<head>` — confirm `<style id="typost-paragraph-styles-css">` is present
- [ ] Inspect styled spans — confirm no `style` attribute, only `data-style-id`
- [ ] Verify computed styles match paragraph style definition

## Related Files

- `paragraph-styles/paragraph-styles.php` — `enqueue_editor_style_css()` method (bundled module as of v2.3; formerly the standalone typography-stylist-paragraph-styles extension)
- `typography-stylist.php` — `enqueue_block_assets()` hook for font CSS variables
- `assets/js/block-editor.js` — Inline editor spans with `data-style-id`
- `blocks/typography-stylist/edit.js` — Block editor preview (uses inline styles, not CSS class)
- `blocks/typography-stylist/save.js` — Frontend output (uses CSS class when `styleClass` is set)
