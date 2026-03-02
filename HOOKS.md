# Typography Stylist — Developer Hooks Reference

This document describes all action and filter hooks available in Typography Stylist v1.3.0+ for building extensions. Extensions are standalone WordPress plugins that hook into these integration points.

## Table of Contents

- [PHP Hooks](#php-hooks)
  - [Actions](#php-actions)
  - [Filters](#php-filters)
- [JavaScript Hooks](#javascript-hooks)
  - [The `window.typostHooks` System](#the-windowtyposthooks-system)
  - [Inline Editor Hook Points](#inline-editor-hook-points)
  - [Quick Feature Toggle Hook Points](#quick-feature-toggle-hook-points)
  - [Inspector Controls Hook Points](#inspector-controls-hook-points)
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

Fired after a font kit is successfully uploaded and processed. Receives an array of font entry objects that were added (a single ZIP kit may contain multiple font files). **Note:** This is a change from the pre-1.3.0 signature, which passed `$font_data` and `$font_id` as separate parameters.

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
- **Inline editor:** `editorType`, `fontId`, `fontWeight`, `fontSize`, `fontSizeMin`, `fontSizePreferred`, `fontSizeMax`, `letterSpacing`, `lineHeight`, `features`, `paragraphStyleId`
- **QFT editor:** `editorType`, `fontId`, `fontWeight`, `fontSize`, `fontSizeMin`, `fontSizePreferred`, `fontSizeMax`, `letterSpacing`, `lineHeight`, `features`, `paragraphStyleId`

The `paragraphStyleId` field contains the active paragraph style ID (integer), or `0` if no style is applied. Extensions can use this to detect whether the current selection/block is associated with a saved style.

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
        },
        source: 'inline', // or 'qft' or 'inspector'
        // Optional: class-based styling (used by paragraph styles extension)
        paragraphStyleId: 3,       // Integer style ID
        styleClass: 'typost-ps-3', // CSS class for Typography Stylist blocks
    },
}));
```

Each editor listens for this event and applies properties matching its `source`. The inline editor triggers a debounced apply; the QFT/inspector editors set block attributes directly. Only fields present in `properties` are updated — missing fields preserve current state.

**Note:** This event was renamed from `typost-apply-paragraph-style` in v1.3.0 to reflect its generic purpose.

**Class-based styling fields:**
- `paragraphStyleId` — When set (non-zero), the inline editor stores `data-style-id` on the span and skips inline `style` (CSS class provides rendering). Data attributes (`data-font-id`, `data-features`, etc.) are still set for font detection.
- `styleClass` — When set, the Typography Stylist block stores this as a block attribute. The `save()` function outputs the class on the element and skips inline styles. The editor always renders inline styles for visual preview regardless of `styleClass`.

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
