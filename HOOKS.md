# Typography Stylist — Developer Hooks Reference

This document describes all action and filter hooks available in Typography Stylist v2.0.0+ for building extensions. Extensions are standalone WordPress plugins that hook into these integration points.

## Table of Contents

- [PHP Hooks](#php-hooks)
  - [Actions](#php-actions)
  - [Filters](#php-filters)
- [JavaScript Hooks](#javascript-hooks)
  - [The `window.typostHooks` System](#the-windowtyposthooks-system)
  - [Inline Editor Hook Points](#inline-editor-hook-points)
  - [Quick Feature Toggle Hook Points](#quick-feature-toggle-hook-points)
  - [Inspector Controls Hook Points](#inspector-controls-hook-points)
  - [Block Toolbar Buttons](#block-toolbar-buttons)
  - [Weight Control Replacement](#weight-control-replacement)
  - [Convert to Block Capability](#convert-to-block-capability)
  - [Admin jQuery Events](#admin-jquery-events)
  - [Lifecycle Hooks](#lifecycle-hooks)
  - [State Communication](#state-communication)
- [Admin Tab Extensibility](#admin-tab-extensibility)
- [Extension Examples](#extension-examples)
  - [Vanilla DOM Example](#vanilla-dom-example)
  - [React (wp.element) Example](#react-wpelement-example)

---

## PHP Hooks

### PHP Actions

#### `typost_editor_assets`

Fired at the end of `enqueue_block_editor_assets()`. Use this to enqueue your extension's editor scripts and styles.

```php
add_action('typost_editor_assets', function() {
    wp_enqueue_script(
        'my-extension-editor',
        plugins_url('assets/js/editor.js', __FILE__),
        array('typost-block-editor', 'wp-element', 'wp-components'),
        '1.0.0',
        true
    );
});
```

**Important:** Use `typost-block-editor` as a script dependency to ensure your script loads after Typography Stylist's editor scripts and `window.typostHooks` is available.

#### `typost_admin_assets`

Fired at the end of `enqueue_admin_assets()`. Use this to enqueue scripts and styles for the Typography Stylist settings page.

```php
add_action('typost_admin_assets', function() {
    wp_enqueue_script('my-extension-admin', plugins_url('assets/js/admin.js', __FILE__), array('jquery'), '1.0.0', true);
    wp_enqueue_style('my-extension-admin', plugins_url('assets/css/admin.css', __FILE__), array(), '1.0.0');
});
```

#### `typost_register_rest_routes`

Fired at the end of `register_rest_routes()`. Register your extension's REST API endpoints under the `typost/v1` namespace.

```php
add_action('typost_register_rest_routes', function() {
    register_rest_route('typost/v1', '/my-extension/data', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'my_extension_get_data',
        'permission_callback' => function() {
            return current_user_can('edit_posts');
        },
    ));
});
```

#### `typost_cache_clear`

Fired when Typography Stylist clears its caches (manual clear from admin or automatic invalidation). Clear your extension's caches here.

```php
add_action('typost_cache_clear', function() {
    delete_transient('my_extension_cache');
});
```

#### `typost_font_uploaded`

Fired after a font kit is successfully uploaded and processed. Receives an array of font entry objects that were added (a single ZIP kit may contain multiple font files).

```php
add_action('typost_font_uploaded', function($font_entries) {
    // Example: Parse variable font axes on upload
    foreach ($font_entries as $entry) {
        $axes = parse_font_axes($entry['file_path']);
        if ($axes) {
            update_option('my_extension_axes_' . $entry['id'], $axes);
        }
    }
}, 10, 1);
```

**Parameters:**
- `$font_entries` (array) — Array of font entry objects that were added from the kit

#### `typost_font_deleted`

Fired after a font is successfully deleted. Receives the font ID and the deleted font's data.

```php
add_action('typost_font_deleted', function($id, $font_data) {
    delete_option('my_extension_axes_' . $id);
}, 10, 2);
```

**Parameters:**
- `$id` (string) — The deleted font's ID
- `$font_data` (array) — The deleted font's data array

#### `typost_after_weight_checkboxes`

Fired after the weight checkboxes in font edit forms on the admin page. Use this to inject additional per-font controls (e.g., variable font axis configuration).

```php
add_action('typost_after_weight_checkboxes', function($font, $prefix) {
    // $font  — Font data array
    // $prefix — Form prefix string ('font', 'adobe', or 'manual')
    echo '<div class="my-extension-font-options">';
    echo '<label><input type="checkbox" /> Enable Variable Font</label>';
    echo '</div>';
}, 10, 2);
```

**Parameters:**
- `$font` (array) — The font data array for the current font being edited
- `$prefix` (string) — Form field prefix: `'font'` (uploaded), `'adobe'`, or `'manual'`

#### `typost_font_saved`

Fired after a font's settings are saved via PATCH endpoints (fallback updates, weight changes, etc.). Use this to save extension-specific per-font data.

```php
add_action('typost_font_saved', function($id, $font_data, $type) {
    // Save extension data for this font
    update_option('my_extension_font_' . $id, $my_data);
}, 10, 3);
```

**Parameters:**
- `$id` (string) — The font's string ID (e.g., `'kit-123-inter'`)
- `$font_data` (array) — The updated font data array
- `$type` (string) — Font type: `'uploaded'`, `'adobe'`, or `'manual'`

#### `typost_admin_tab_content_{tab_id}`

Fired to render the content of an extension-registered admin tab. The `{tab_id}` is the `id` value from your tab registration.

```php
add_action('typost_admin_tab_content_my-tab', function($instance) {
    echo '<h2>My Extension Settings</h2>';
    echo '<p>Configure your extension here.</p>';
});
```

#### `typost_admin_tab_after_{tab_id}`

Fired at the end of each built-in tab panel. Use this to append content to existing tabs.

Available tab IDs: `presets`, `fonts`, `options`, `accessibility`, `replacements`, `help`

```php
add_action('typost_admin_tab_after_fonts', function($instance) {
    echo '<div class="my-extension-font-info">';
    echo '<h3>Variable Font Axes</h3>';
    // Additional font information
    echo '</div>';
});
```

#### `typost_admin_options_rows`

*Since 2.3.0.* Fired inside the Options tab settings table, after the core rows. Use it for a single editor-behaviour setting that would not justify a tab of its own — every such option then lives in one place.

Echo complete `<tr>` rows. Mark checkbox inputs with `data-typost-option="1"` so the tab's AJAX save collects them, and register the option key with [`typost_admin_options_checkboxes`](#typost_admin_options_checkboxes) so it is actually persisted.

```php
add_action('typost_admin_options_rows', function($instance) {
    ?>
    <tr>
        <th scope="row"><?php esc_html_e('My Toolbar Button', 'my-extension'); ?></th>
        <td>
            <input type="checkbox" id="my_ext_toolbar" name="my_ext_toolbar"
                   value="1" data-typost-option="1"
                   <?php checked(get_option('my_ext_toolbar', false)); ?> />
            <label for="my_ext_toolbar"><?php esc_html_e('Show the button', 'my-extension'); ?></label>
        </td>
    </tr>
    <?php
});
```

Expose the value to the editor through [`typost_editor_data`](#typost_editor_data). That filter runs *after* the localized-data transient is read, so a toggle takes effect immediately rather than when the hour-long cache expires.

### PHP Filters

#### `typost_editor_data`

Filter the data passed to the block editor via `wp_localize_script()`. Add your extension's data to `typostData`.

```php
add_filter('typost_editor_data', function($data) {
    $data['myExtensionSettings'] = get_option('my_extension_settings', array());
    return $data;
});
```

**Note:** This data is cached in a transient. The nonce is always injected fresh (not cached).

`wp_localize_script()` casts scalars to strings, so booleans arrive as `"1"` / `""` — truthy and falsy as expected, but never `true`/`false`. Fields worth knowing about:

- `blockEnterLineBreak` *(since 2.3.0)* — `"1"` when Enter inside a Typography Stylist block inserts a line break (the default), `""` when Enter starts a new block. The editor itself does not read this: the behaviour is driven by core's `splitting` block support, added server-side in `filter_block_splitting_support()`, so `wp.blocks.hasBlockSupport('typost/block', 'splitting', false)` is the authoritative check inside the editor. The localized value is here for extensions that need the user's setting without reaching into the block registry.

#### `typost_admin_localize_data`

Filter the data passed to the admin page via `wp_localize_script()`.

```php
add_filter('typost_admin_localize_data', function($data) {
    $data['myExtensionData'] = get_option('my_extension_data', array());
    return $data;
});
```

#### `typost_admin_tabs`

Filter the array of admin settings tabs. Add your own tabs or modify existing ones.

```php
add_filter('typost_admin_tabs', function($tabs) {
    $tabs[] = array(
        'id'       => 'my-tab',
        'label'    => __('My Extension', 'my-text-domain'),
        'priority' => 25, // Between Font Features (20) and Options (30)
    );
    return $tabs;
});
```

**Tab properties:**
- `id` (string) — Unique tab identifier, used in `data-tab` attribute and action hooks
- `label` (string) — Display text for the tab button
- `priority` (int) — Sort order (lower = further left). Built-in tabs: Fonts=10, Features=20, Options=30, Accessibility=40, Replacements=50, Help=100

#### `typost_font_card_badges`

Filter the extension badge HTML rendered in each font card header on the Custom Fonts tab. Extension badges render **before** the source pills (Uploaded, Adobe Fonts, WP Library, …) so state badges like the Variable Fonts module's "Variable" pill lead the row. Return accumulated HTML — always append to (never replace) the incoming value, since multiple extensions may add badges. Output is passed through `wp_kses_post()`.

```php
add_filter('typost_font_card_badges', function($badges, $font, $type) {
    // $type is 'uploaded', 'adobe', 'manual', or 'wplibrary'
    // $font is the entry being rendered (wplibrary entries have slug, not id)
    if (my_extension_applies_to($font)) {
        $badges .= '<span class="typost-font-type-badge my-badge">' .
            esc_html__('My Badge', 'my-text-domain') . '</span>';
    }
    return $badges;
}, 10, 3);
```

The bundled Variable Fonts module uses this to show a "Variable" pill (with the configured axis tags in its tooltip) on variable fonts.

#### `typost_admin_options_checkboxes`

*Since 2.3.0.* Register option keys for checkboxes you rendered on [`typost_admin_options_rows`](#typost_admin_options_rows), so that both the Options tab's AJAX save and its no-JavaScript POST fallback persist them. Values are stored as `'1'` / `'0'`.

```php
add_filter('typost_admin_options_checkboxes', function($options) {
    $options[] = 'typost_my_extension_toolbar';
    return $options;
});
```

Keys must be prefixed `typost_`; anything else is ignored. This is deliberate — an extension may add its own settings to the form, not use it to write arbitrary WordPress options.

#### `typost_available_features`

Filter the list of available OpenType features.

```php
add_filter('typost_available_features', function($features) {
    // Add a custom feature
    $features[] = array(
        'id'          => 'cv01',
        'name'        => 'Character Variant 1',
        'category'    => 'alternates',
        'description' => 'First character variant set',
    );
    return $features;
});
```

#### `typost_presets`

Filter the presets list (saved and default presets combined).

```php
add_filter('typost_presets', function($presets) {
    $presets[] = array(
        'id'       => 'my-preset',
        'name'     => 'Custom Preset',
        'features' => array('liga', 'dlig', 'ss01'),
    );
    return $presets;
});
```

#### `typost_force_enqueue_font_ids`

*Since 2.1.0.* Force specific fonts (by numeric font ID) to load on every frontend page, even when the post-content scan finds no styled content. Use this when your theme or extension references a font's `--font-N` CSS variable from its own stylesheets — the content scan can't see those references, so without this filter neither the variable definitions nor the @font-face rules would be output.

```php
add_filter('typost_force_enqueue_font_ids', function($ids) {
    // e.g. fonts assigned to theme color schemes
    $ids[] = 12;
    $ids[] = 27;
    return $ids;
});
```

**Details:**
- Return an array of positive integer font IDs; invalid entries are discarded.
- Forced IDs are resolved through the font-replacement chain, so referencing a deleted font's ID loads its replacement (and keeps the alias variable).
- Forcing any ID causes the `--font-N` variables `<style>` block and the frontend stylesheet handle to be output on all pages.
- The result is memoized per request and feeds transient cache keys — callbacks must return stable output for a given request.

---

## JavaScript Hooks

### The `window.typostHooks` System

Typography Stylist provides a lightweight action/filter system on `window.typostHooks` that mirrors WordPress PHP hooks. It is available in both the inline editor (block-editor.js) and the Typography Stylist block (edit.js).

```javascript
// Actions — execute callbacks, no return value
window.typostHooks.addAction(hookName, callback, priority);
window.typostHooks.doAction(hookName, ...args);
window.typostHooks.removeAction(hookName, callback);

// Filters — execute callbacks, return modified value
window.typostHooks.addFilter(hookName, callback, priority);
window.typostHooks.applyFilters(hookName, value, ...args);
window.typostHooks.removeFilter(hookName, callback);
```

**Parameters:**
- `hookName` (string) — The hook name to register or fire/remove
- `callback` (function) — The function to execute. Must be a named or stored reference for removal
- `priority` (number, optional) — Execution order, lower runs first (default: 10)

**Removing hooks:** To remove a callback, you must pass the same function reference that was used when adding it. Anonymous functions cannot be removed — store the callback in a variable first:

```javascript
// Store the callback so it can be removed later
var myFilter = function(state, editorType) {
    if (editorType === 'inline') {
        state.customField = 'value';
    }
    return state;
};
window.typostHooks.addFilter('typost_current_editor_state', myFilter, 10);

// Later, to clean up:
window.typostHooks.removeFilter('typost_current_editor_state', myFilter);
```

**Container lifecycle:** Each hook point renders a `<div class="typost-hook-point" data-hook="...">` and fires its action **once per container mount** — actions do not re-fire on ordinary editor re-renders, so render your UI once and manage its own state from there. The **font-dependent hook points** (`typost_weight_control`, `typost_inline_after_font_controls`, `typost_qft_after_font_controls`, `typost_inspector_after_font_weight`) are keyed to the active font: when the font changes, the old container (and everything you rendered into it) is destroyed, a fresh container mounts, and the action fires again with the new state. Don't cache references to these containers across font changes.

### Inline Editor Hook Points

These hooks fire inside the inline editor modal (the "T" toolbar button popover). Each receives a container DOM element and the editor's current state.

| Hook Name | Location | Typical Use |
|---|---|---|
| `typost_inline_modal_top` | After sticky notice, before font controls | Paragraph styles dropdown |
| `typost_inline_after_font_controls` | After font weight selector | Variable font axes |
| `typost_inline_before_features` | Before "Individual Features" section | Glyphs panel |
| `typost_inline_after_features` | After feature toggle panels | Additional feature sections |
| `typost_inline_modal_bottom` | Before action buttons | Custom actions |

```javascript
window.typostHooks.addAction('typost_inline_modal_top', function(containerEl, state) {
    // containerEl is a <div> — render your UI into it
    // state contains: selectedFont, selectedFontId, selectedFontWeight,
    //                 selectedFeatures, letterSpacing, lineHeight, etc.
}, 10);
```

### Quick Feature Toggle Hook Points

These hooks fire inside the Typography Stylist block's Quick Feature Toggle popover (appears when text is selected within the block).

| Hook Name | Location | Typical Use |
|---|---|---|
| `typost_qft_modal_top` | After drag notice | Paragraph styles dropdown |
| `typost_qft_after_font_controls` | After font weight | Variable font axes |
| `typost_qft_before_features` | Before feature summary | Glyphs panel |
| `typost_qft_after_features` | After feature toggles | Additional sections |

```javascript
window.typostHooks.addAction('typost_qft_modal_top', function(containerEl, state) {
    // state contains: fontId, fontWeight, fontSize, letterSpacing,
    //                 lineHeight, features, etc.
}, 10);
```

The `typost_qft_after_font_controls` state also includes `inlineFontFamilyAtSelection` (the numeric font ID of an inline font at the current selection, if any) so extensions can prefer the inline font over the block-level `fontId`.

*Since 2.2.2* the `typost_weight_control` and `typost_qft_after_font_controls` states also include `fontVariationSettings` (string) — the `data-font-variation-settings` value of the innermost styled span at the current selection, falling back to the block attribute, `''` when neither is set. The inspector-side hook states (`typost_weight_control` in the sidebar, `typost_inspector_after_font_weight`) carry the block attribute. Extensions should initialize axis controls from this instead of walking the DOM selection, which fails in an iframed editor canvas.

### Inspector Controls Hook Points

These hooks fire inside the Typography Stylist block's sidebar Inspector Controls.

| Hook Name | Location | Typical Use |
|---|---|---|
| `typost_inspector_top` | Before all panels (top of sidebar) | Paragraph styles dropdown |
| `typost_inspector_after_font_weight` | After Font Weight panel | Variable font axes panel |
| `typost_inspector_before_features` | Before OpenType Features panel | Glyphs panel |
| `typost_inspector_after_features` | After OpenType Features panel | Additional feature panels |

```javascript
window.typostHooks.addAction('typost_inspector_after_font_weight', function(containerEl, state) {
    // state contains: fontId, features
}, 10);
```

### Block Toolbar Buttons

*Since 2.3.0.* The other hook points hand you a container element to render into; this one is a **filter returning descriptors**, because a toolbar button rendered from a foreign React root would sit outside the toolbar's roving tabindex and break keyboard navigation. Core renders your descriptor as a real `ToolbarButton`.

Buttons appear next to the Typography Stylist button — in the Typography Stylist block's toolbar (`qft`) and, for rich text blocks, in the inline format toolbar (`inline`).

```javascript
window.typostHooks.addFilter('typost_editor_toolbar_buttons', function(buttons, editor) {
    return buttons.concat([{
        id: 'my-panel',            // required, unique — used as the React key
        icon: MyIconComponent,     // component or dashicon name
        label: 'My Panel',         // tooltip + accessible name
        isActive: false,           // optional pressed state
        editors: ['qft'],          // optional; omit to appear in both editors
        onClick: function(context) { openMyPanel(context); },
    }]);
}, 10);

// Register during script load. If your extension registers later (async or
// conditional loading), tell the editors to re-render:
window.typostHooks.doAction('typost_editor_toolbar_buttons_changed');
```

Descriptors without an `id` or a callable `onClick` are dropped.

**The click context** carries everything the panel needs, because no host modal was opened to gather it:

| Field | `qft` | `inline` |
|---|---|---|
| `source` | `'qft'` | `'inline'` |
| `clientId` | block client ID | — |
| `capturedSelection` | `{start, end, text, length}` or `null` | — |
| `savedSelectionStart` / `savedSelectionEnd` | — | offsets, or `null` |
| `selectedText` | selected text (`''` when none) | selected text (`''` when none) |
| `state` | resolved editor state | resolved editor state |
| `reopenHost` | `false` | `false` |

Two details matter:

- **Use `context.state`, not the `typost_current_editor_state` filter.** That filter is only answered by the block holding the caret, so a block selected from List View would report the default font. The context state is resolved for the block whose toolbar was clicked.
- **`reopenHost: false`** means no host modal was open. If your panel closes by firing `typost_glyphs_panel_closed`, pass the flag through so the editors do not open a modal the author never asked for:

```javascript
window.typostHooks.doAction('typost_glyphs_panel_closed', source, {
    clientId: context.clientId,
    range: context.range,
    reopenHost: context.reopenHost !== false,
});
```

Insertion still goes through the `typost-insert-content` event exactly as it does from inside the editor panels — core has already recorded the selection from the context, so inserted text lands at the selection and successive insertions advance the caret.

### Weight Control Replacement

#### `typost_weight_control` (Filter)

Filter that determines whether the standard weight dropdown should be replaced by a custom control. Return `'default'` for the normal dropdown, `'hidden'` to suppress the weight control entirely (no wrapper section, no hook container — used e.g. for variable fonts without a `wght` axis), or any other value (e.g., `'variable'`) to replace it with a hook container.

```javascript
window.typostHooks.addFilter('typost_weight_control', function(type, fontId) {
    // Return 'variable' to replace the dropdown with a custom control
    if (fontHasVariableWeightAxis(fontId)) {
        return 'variable';
    }
    // Return 'hidden' to render no weight control at all
    if (fontShouldHideWeights(fontId)) {
        return 'hidden';
    }
    return type; // 'default' = normal dropdown
}, 10);
```

**Parameters:**
- `type` (string) — Current control type (`'default'` initially)
- `fontId` (number) — The active font's numeric ID

**Recognized return values:** `'default'` (normal dropdown), `'hidden'` (no control rendered), anything else (hook container fired via the action below).

**Checked in three locations:** inline editor, Quick Feature Toggle, Inspector Controls.

#### `typost_weight_control` (Action)

When the filter returns a non-default value, the core renders a hook container (`<div data-hook="typost_weight_control">`) and fires this action. Render your custom weight control into the container.

```javascript
window.typostHooks.addAction('typost_weight_control', function(containerEl, state) {
    // Render a custom weight slider into containerEl
    // state varies by editor:
    //   inline:    { selectedFontId, fontWeight, selectedFont, ... }
    //   qft:       { fontId, fontWeight, inlineFontFamily, inlineFontWeight, ... }
    //   inspector: { fontId, fontWeight }
}, 10);
```

### Convert to Block Capability

#### `typost_can_convert_to_block` (Filter)

*Since 2.3.0.*

Filters whether the inline editor offers **Convert to Typography Stylist Block** for the current selection. The core answer is computed each time the inline modal opens, from three facts:

1. The selected block is a `core/heading` or `core/paragraph` (nothing else has a conversion mapping).
2. `canRemoveBlock()` is true — the block is not locked, and not inside a locked template or pattern.
3. `canInsertBlockType( 'typost/block', rootClientId )` is true — the **parent block allows `typost/block` among its inner blocks**.

Point 3 is the one that surprises people. A block that restricts its children with `allowedBlocks` will refuse a Typography Stylist block unless it lists one, so the conversion is genuinely impossible there. When that happens the modal now says so and names the parent block, rather than silently rendering nothing.

If your theme or plugin has a container block that should accept Typography Stylist blocks, **add `typost/block` to that block's `allowedBlocks` list** — that is the real fix, and it also makes the block insertable by hand. Use this filter only when the capability genuinely needs to be decided elsewhere.

```javascript
window.typostHooks.addFilter('typost_can_convert_to_block', function(canConvert, context) {
    // context = { clientId, blockName, rootClientId, reason, parentTitle }
    if (context.reason === 'parent' && context.parentTitle === 'My Container') {
        return true; // this container handles typost/block itself
    }
    return canConvert;
}, 10);
```

**Parameters:**
- `canConvert` (boolean) — Core's answer.
- `context.clientId` (string) — Selected block's client ID.
- `context.blockName` (string) — Selected block's name.
- `context.rootClientId` (string) — Parent block's client ID (`''` at the top level).
- `context.reason` (string) — Why core said no: `'none'` (it said yes), `'unsupported'`, `'already'`, `'locked'`, `'parent'`.
- `context.parentTitle` (string) — Parent block's human title, or `''`.

Returning `true` clears the reason, so no stale explanation is shown next to a working button. Returning `false` hides the action without an explanation — if you want the user told why, keep the capability and disable your own container instead.

### Admin jQuery Events

#### `typost:font-saved`

jQuery event triggered on `$(document)` after a font's settings are saved in the admin. Use this to save extension-specific data that was injected into the font edit form.

```javascript
$(document).on('typost:font-saved', function(e, data) {
    // data.fontId    — Font string ID (e.g., 'kit-123-inter')
    // data.type      — Font type: 'uploaded', 'adobe', or 'manual'
    // data.$card     — jQuery element of the font card
    // data.waitUntil — Since 2.1.0: register a promise the post-save refresh waits on
    var request = saveMyExtensionData(data.fontId, data.type); // e.g. $.ajax(...)
    if (typeof data.waitUntil === 'function') {
        data.waitUntil(Promise.resolve(request));
    }
});
```

**`waitUntil` (since 2.1.0):** after a font save, core refreshes the font list in place over the REST API (before 2.3 it reloaded the whole page). If your extension saves its own data asynchronously on this event, register the request via `data.waitUntil(promise)` — core waits for all registered promises to settle (with a 5-second cap) before refreshing, instead of the old fixed 1500 ms timeout your request had to race. Because the refreshed font-list fragment is server-rendered through the same template functions as the page itself, data your extension saved here is reflected in the swapped-in markup exactly as it would be after a reload.

#### `typost:fonts-added`

jQuery event triggered on `$(document)` after new fonts are successfully added in the admin — a webfont kit ZIP upload or an Adobe Fonts kit. Use this to post-process brand-new entries before the font list refreshes in place (e.g. the bundled Variable Fonts module auto-detects fvar axes here).

```javascript
$(document).on('typost:fonts-added', function(e, data) {
    // data.type      — How the fonts were added: 'uploaded' or 'adobe'
    // data.fonts     — Array of the new font entries as returned by the REST endpoint
    //                  (each has id, font_id, and source-specific fields like
    //                  css_content for uploads or css_url/font_family for Adobe)
    // data.$message  — jQuery element of the form's message area (append notices here)
    // data.waitUntil — Register a promise the post-add refresh waits on
    var work = processNewFonts(data.fonts); // e.g. detection + $.ajax saves
    if (typeof data.waitUntil === 'function') {
        data.waitUntil(work);
    }
});
```

**`waitUntil`:** same contract as `typost:font-saved`, but with a 15-second cap — listeners here may download and parse font binaries, which takes longer than a settings save. The refresh also waits a minimum delay so the success notice stays readable.

### Lifecycle Hooks

#### `typost_inline_modal_opened`

Fired when the inline editor modal opens.

```javascript
window.typostHooks.addAction('typost_inline_modal_opened', function(state) {
    // state is the full editor state at time of opening
    // Use this to refresh data, re-render panels, etc.
}, 10);
```

#### `typost_inline_modal_closed`

Fired when the inline editor modal closes.

```javascript
window.typostHooks.addAction('typost_inline_modal_closed', function() {
    // Clean up any event listeners or timers
}, 10);
```

### State Communication

#### Reading Editor State

Use the `typost_current_editor_state` filter to read the current editor state:

```javascript
// Get state from whichever editor is active
var state = window.typostHooks.applyFilters('typost_current_editor_state', {}, 'inline');
// or
var state = window.typostHooks.applyFilters('typost_current_editor_state', {}, 'qft');
```

The returned state object includes:
- **Inline editor:** `editorType`, `fontId`, `fontWeight`, `fontSize`, `fontSizeMin`, `fontSizePreferred`, `fontSizeMax`, `letterSpacing`, `lineHeight`, `features`, `paragraphStyleId`, `fontVariationSettings`
- **QFT editor:** `editorType`, `fontId`, `fontWeight`, `fontSize`, `fontSizeMin`, `fontSizePreferred`, `fontSizeMax`, `letterSpacing`, `lineHeight`, `features`, `paragraphStyleId`, `fontVariationSettings`, `layeredConfigId`, `content`, `tagName`

The `paragraphStyleId` field contains the active paragraph style ID (integer), or `0` if no style is applied. Extensions can use this to detect whether the current selection/block is associated with a saved style.

The `layeredConfigId` field contains the active layered font configuration ID (integer), or `0` if no layered font is applied. The `content` and `tagName` fields provide the block's current text content (HTML) and heading tag (e.g., `h2`) for use by extensions that need to render previews.

*Since 2.1.0* the QFT/inspector state also includes `animationConfigId` (integer, `0` when unset) — the active animation configuration ID used by the Animations extension.

#### Writing Editor State

Dispatch a `typost-apply-block-properties` CustomEvent to programmatically apply properties to the editor. This is a generic mechanism — any extension can use it to set block attributes and inline editor state.

```javascript
document.dispatchEvent(new CustomEvent('typost-apply-block-properties', {
    detail: {
        properties: {
            fontId: 12,
            fontWeight: '700',
            letterSpacing: 50,
            features: ['liga', 'dlig', 'ss01'],
            fontVariationSettings: '"wght" 700, "wdth" 100', // Optional: variable font axes
        },
        source: 'inline', // or 'qft' or 'inspector'
        // Optional: class-based styling (used by the bundled Paragraph Styles module)
        paragraphStyleId: 3,       // Integer style ID
        styleClass: 'typost-ps-3', // CSS class for Typography Stylist blocks
        // Optional (inline source only, since 2.1.0): animation config ID —
        // written to the span as data-animation-id (Animations extension)
        animationId: 2,
    },
}));
```

Each editor listens for this event and applies properties matching its `source`. The inline editor triggers a debounced apply; the QFT/inspector editors set block attributes directly, with one exception: a `'qft'` event's `fontVariationSettings` is applied to the current text selection as an inline `<span class="typost-styled" data-font-variation-settings="...">` (falling back to the block attribute when the caret isn't inside styled text) — the `'inspector'` source remains block-level. Only fields present in `properties` are updated — missing fields preserve current state.

`fontVariationSettings` values are validated on every apply path (each comma-separated entry must match the `"axis" number` format); an invalid value is treated as empty rather than partially applied, so it clears the property instead of reaching a style string.

**Targeting (since 2.2.2):** every Typography Stylist block registers this listener, so the event is handled only by the block it targets — for `source: 'qft'` that is the block whose Quick Feature Toggles modal is open, and for `source: 'inspector'` the currently selected block. Previously every mounted block applied the event.

**Note:** This event was renamed from `typost-apply-paragraph-style` in v2.0.0 to reflect its generic purpose.

**Class-based styling fields:**
- `paragraphStyleId` — When set (non-zero), the inline editor stores `data-style-id` on the span and skips inline `style` (CSS class provides rendering). Data attributes (`data-font-id`, `data-features`, etc.) are still set for font detection.
- `styleClass` — When set, the Typography Stylist block stores this as a block attribute. The `save()` function outputs the class on the element and skips inline styles. The editor always renders inline styles for visual preview regardless of `styleClass`.

**Extension config references (numeric block attributes):**
- `properties.layeredConfigId` — Layered Fonts extension. Saved as `data-layered-config-id` on the visual heading.
- `properties.animationConfigId` — *Since 2.1.0.* Animations extension. Saved as `data-animation-config-id` on the visual (aria-hidden) heading only; the screen-reader heading is never touched. The inline format additionally allows a `data-animation-id` attribute on `typost-styled` spans. Extensions consume these via a `render_block` filter on the frontend.

#### Inserting Content

Dispatch a `typost-insert-content` CustomEvent to insert text at the cursor (or replace the current selection) in the editor, optionally wrapping the inserted text in a `<span class="typost-styled">` element. This is the generic insertion bridge used by extensions like the Glyphs Panel.

```javascript
document.dispatchEvent(new CustomEvent('typost-insert-content', {
    detail: {
        source: 'inline', // or 'qft' — must match the editor being targeted
        text: 'A',        // Character(s) to insert (max 50 chars; e.g., 'fi' for a ligature)
        // Optional: wrap the inserted text in a typost-styled span.
        // Omit (or pass null) to insert plain text that inherits surrounding formatting.
        attributes: {
            'data-features': 'ss01',
            'data-font-id': '12',
            'style': 'font-feature-settings: "ss01" 1; font-family: var(--font-12)',
        },
        // Optional targeting (recommended): capture these from the hook state
        // snapshot when your UI launches. They keep insertion working after the
        // host editor modal closes (which resets its internal selection state).
        clientId: 'abc-123',          // QFT only: block clientId from the hook snapshot
        range: { start: 0, end: 10 }, // Fallback text range to insert into/replace
        // Optional (since 2.2.2): swap semantics — after inserting, the
        // editor keeps the inserted text SELECTED instead of collapsing the
        // caret, so the extension's next insertion replaces the same text.
        // Use for pick-a-variant UIs (e.g. the Glyphs Panel alternates view);
        // omit for sequence insertion.
        swap: true,
    },
}));
```

Behavior:
- **Selection vs cursor:** If text is selected, the insertion replaces it; with a collapsed cursor, the text is inserted in place. Both editors fall back to selection bounds captured before their modal stole focus (inline: saved selection state; QFT: `capturedSelection`), then to `detail.range`. If no selection information exists in the QFT context, the text is appended to the end of the block content.
- **Targeting:** Every Typography Stylist block listens for this event. When `detail.clientId` is set, only the matching block handles it; without it, only the block whose QFT popover is currently open does. In the inline editor, only the live (mounted) format component instance handles the event.
- **Format continuity:** The inserted text copies the formats of the character it replaces (or, for a collapsed cursor, the preceding character), so inserting inside styled text behaves like typing. When `attributes` is provided, the typost format on just the inserted range is replaced with those attributes — include any context features in `data-features` you want preserved on the inserted text.
- **Styling preservation (since 2.2.0):** When `attributes` replaces an existing typost format, the replaced format's other styling — `data-fontsize`/`data-fontsize-min`/`-preferred`/`-max`, `data-letterspacing`, `data-lineheight`, `data-fontweight`, and their `style` declarations — is merged into the new span automatically (your attributes always win per-property; `data-features`, `data-feature-settings`, `data-font`, and `data-font-id` are never inherited, and `font-variation-settings` carries over only when `data-font-id` is unchanged). Extensions therefore only need to send what they own.
- **Caret:** After insertion the caret collapses to the end of the inserted text — unless `detail.swap` is set (since 2.2.2), in which case the inserted text stays selected so the extension's next insertion replaces it.
- **Clearing inherited features (since 2.2.2):** Because a plain (`attributes: null`) insertion inherits the replaced character's formats, it can never *remove* a feature — a base-glyph swap over an alternate would re-inherit the alternate. To restore a plain form, send an `attributes` object *without* feature keys (plus whatever font/weight you want kept): feature attributes are payload-owned in the merge, so the inherited alternate is dropped while sizing/spacing survive.
- **Frontend rendering:** The `style` attribute carries the actual CSS (same convention as the editors' own apply logic). Include `data-font-id` when the inserted text uses a different font than its surroundings so the frontend `@font-face` detection enqueues the font.

**Availability:** Handled by both the inline editor (format type `typost/features`) and the Typography Stylist block.

**Indexed alternates (`data-feature-settings`):** The comma-tag `data-features` format implies `"tag" 1` and cannot express indexed alternates like `font-feature-settings: "salt" 2`. For those, set the raw value in a `data-feature-settings` attribute (registered on the `typost/features` format) and put the full value in `style`. List any plain index-1 tags in `data-features` as usual. The inline editor preserves `data-feature-settings` verbatim when other properties are re-applied to the span, and appends newly toggled tags that aren't already present in the raw value.

---

## Admin Tab Extensibility

### Adding a Tab

1. Register the tab via `typost_admin_tabs` filter (see [PHP Filters](#typost_admin_tabs))
2. Render tab content via `typost_admin_tab_content_{tab_id}` action
3. Enqueue admin assets via `typost_admin_assets` action

### URL-Based Tab Selection

Tabs support deep-linking: `?page=typography-stylist&tab=my-tab`. The tab ID in the URL query parameter matches the `id` in your tab registration.

### Tab Switching

The admin page's JavaScript automatically handles tab switching for all registered tabs — no additional JS is needed for tab navigation.

---

## Extension Examples

### Vanilla DOM Example

A minimal extension that adds a message to the top of the inline editor:

```php
// my-extension.php
add_action('typost_editor_assets', function() {
    wp_enqueue_script('my-ext', plugins_url('editor.js', __FILE__), array('typost-block-editor'), '1.0.0', true);
});
```

```javascript
// editor.js
(function() {
    function waitForHooks(cb) {
        if (window.typostHooks) { cb(); return; }
        var i = setInterval(function() {
            if (window.typostHooks) { clearInterval(i); cb(); }
        }, 100);
    }

    waitForHooks(function() {
        window.typostHooks.addAction('typost_inline_modal_top', function(containerEl, state) {
            // Pure vanilla DOM — no build step required
            var div = document.createElement('div');
            div.style.cssText = 'padding: 8px 12px; background: #f0f6fc; border: 1px solid #c8d8e8; border-radius: 4px; margin-bottom: 12px; font-size: 13px;';
            div.textContent = 'Hello from My Extension! Current font: ' + (state.selectedFont || 'Default');
            containerEl.appendChild(div);
        }, 10);
    });
})();
```

### React (wp.element) Example

A more polished extension using WordPress React components:

```php
// my-extension.php
add_action('typost_editor_assets', function() {
    wp_enqueue_script('my-ext', plugins_url('editor.js', __FILE__),
        array('typost-block-editor', 'wp-element', 'wp-components', 'wp-i18n'), '1.0.0', true);
});
```

```javascript
// editor.js
(function() {
    var el = wp.element.createElement;
    var useState = wp.element.useState;
    var Button = wp.components.Button;
    var Notice = wp.components.Notice;
    var __ = wp.i18n.__;

    function MyPanel(props) {
        var state = useState(false);
        var isActive = state[0];
        var setIsActive = state[1];

        return el('div', { style: { marginBottom: '12px' } },
            el(Notice, { status: 'info', isDismissible: false },
                __('My Extension is active!', 'my-text-domain')
            ),
            el(Button, {
                variant: isActive ? 'primary' : 'secondary',
                onClick: function() { setIsActive(!isActive); },
                size: 'small',
            }, isActive ? __('Deactivate', 'my-text-domain') : __('Activate', 'my-text-domain'))
        );
    }

    function waitForHooks(cb) {
        if (window.typostHooks) { cb(); return; }
        var i = setInterval(function() {
            if (window.typostHooks) { clearInterval(i); cb(); }
        }, 100);
    }

    waitForHooks(function() {
        window.typostHooks.addAction('typost_inline_modal_top', function(containerEl) {
            wp.element.render(el(MyPanel), containerEl);
        }, 10);

        window.typostHooks.addAction('typost_qft_modal_top', function(containerEl) {
            wp.element.render(el(MyPanel), containerEl);
        }, 10);
    });
})();
```

---

## Extension Plugin Template

A minimal extension plugin structure:

```
my-typost-extension/
├── my-typost-extension.php    # Plugin header, dependency check, hook registrations
├── assets/
│   ├── js/
│   │   └── editor.js          # Block editor UI
│   └── css/
│       └── admin.css          # Admin styles (optional)
└── readme.txt
```

```php
<?php
/**
 * Plugin Name: Typography Stylist - My Extension
 * Requires Plugins: typography-stylist
 */

add_action('plugins_loaded', function() {
    if (!class_exists('Typost')) {
        add_action('admin_notices', function() {
            echo '<div class="notice notice-error"><p>This extension requires Typography Stylist.</p></div>';
        });
        return;
    }

    // Register your hooks here
    add_filter('typost_editor_data', 'my_ext_add_editor_data');
    add_action('typost_editor_assets', 'my_ext_enqueue_editor');
    add_action('typost_register_rest_routes', 'my_ext_register_routes');
}, 20);
```
