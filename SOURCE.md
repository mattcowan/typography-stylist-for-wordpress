# Source Code Documentation

This document maps all minified and compiled files in the Typost plugin to their corresponding source code, ensuring transparency and compliance with WordPress.org security requirements.

## Overview

This plugin includes both compiled/minified files (for performance) and their uncompressed source code (for transparency and developer use). All compiled files can be rebuilt from source using the instructions in BUILD.md.

## JavaScript Files

### Block Editor Integration

**File:** `assets/js/block-editor.min.js` (91KB minified)

**Source:** [`assets/js/block-editor.js`](assets/js/block-editor.js) (110KB, 2,350 lines)

**Purpose:** Implements the inline typography features format API for the Gutenberg block editor. Adds a toolbar button to heading blocks that allows applying OpenType features to selected text.

**Build Tool:** Browserify 17.0.1 + Babelify 10.0.0

**Build Command:**
```bash
npm run build:js:editor
```

**Actual Command:**
```bash
browserify assets/js/block-editor.js -o assets/js/block-editor.min.js -t [ babelify ]
```

**Configuration:** Babel settings defined in `.babelrc`

---

### Admin Settings Page

**File:** `assets/js/admin-page.min.js` (35KB minified)

**Source:** [`assets/js/admin-page.js`](assets/js/admin-page.js) (53KB, 1,317 lines)

**Purpose:** JavaScript for the plugin's admin settings page (Settings → Typost). Handles tab switching, font uploads, preset management, and glyph browser interface.

**Build Tool:** Terser 5.16.0

**Build Command:**
```bash
npm run build:js:admin
```

**Actual Command:**
```bash
terser assets/js/admin-page.js --compress --mangle --output assets/js/admin-page.min.js
```

---

### Typography Stylist Block (React/JSX)

**File:** `blocks/typography-stylist/build/index.js` (37KB bundled)

**Sources:**
- [`blocks/typography-stylist/index.js`](blocks/typography-stylist/index.js) - Block registration and configuration
- [`blocks/typography-stylist/edit.js`](blocks/typography-stylist/edit.js) - Editor component (React)
- [`blocks/typography-stylist/save.js`](blocks/typography-stylist/save.js) - Frontend save/render function
- [`blocks/typography-stylist/utils.js`](blocks/typography-stylist/utils.js) - Utility functions
- [`blocks/typography-stylist/view.js`](blocks/typography-stylist/view.js) - Frontend interactive script
- [`blocks/typography-stylist/block.json`](blocks/typography-stylist/block.json) - Block metadata

**Purpose:** Custom Gutenberg block that provides advanced typography controls with accessibility features. Allows block-level OpenType settings and inline text styling within the block.

**Build Tool:** @wordpress/scripts 26.19.0 (webpack + babel + WordPress build pipeline)

**Build Command:**
```bash
npm run build:block
```

**Actual Command:**
```bash
wp-scripts build blocks/typography-stylist/index.js --output-path=blocks/typography-stylist/build
```

**Configuration:**
- Babel settings: `.babelrc`
- WordPress defaults: Uses @wordpress/scripts standard webpack configuration

**Dependencies:** Automatically bundled by webpack (see `blocks/typography-stylist/build/index.asset.php` for WordPress dependencies)

---

### Glyph Browser

**File:** `assets/js/glyph-browser.min.js` (8.5KB minified)

**Source:** Pre-minified utility included in plugin

**Purpose:** Interactive glyph browser for previewing OpenType features with different fonts in the admin interface.

**Note:** This file is included pre-minified. If you need the unminified source for security review, please contact the plugin author.

---

### Utility Functions

**File:** [`assets/js/utils.js`](assets/js/utils.js) (1.4KB)

**Source:** Same file (not minified - loaded as-is)

**Purpose:** Shared utility functions used across the plugin.

---

### Modal Drag/Resize

**File:** [`assets/js/modal-drag-resize.js`](assets/js/modal-drag-resize.js) (4.5KB)

**Source:** Same file (not minified - loaded as-is)

**Purpose:** Utility for modal window dragging and resizing functionality.

---

## CSS Files

### Block Editor Styles

**File:** `assets/css/block-editor.min.css` (11KB minified)

**Source:** [`assets/css/block-editor.css`](assets/css/block-editor.css) (15KB)

**Purpose:** Styles for the block editor interface, including toolbar buttons, popovers, and inline typography controls.

**Build Tool:** clean-css-cli 5.6.2

**Build Command:**
```bash
npm run build:css:editor
```

**Actual Command:**
```bash
cleancss -o assets/css/block-editor.min.css assets/css/block-editor.css
```

---

### Frontend Styles

**File:** `assets/css/frontend.min.css` (2.4KB minified)

**Source:** [`assets/css/frontend.css`](assets/css/frontend.css) (4.4KB)

**Purpose:** Frontend styles for displaying typography features on the public-facing website. Includes CSS for styled text spans and OpenType feature settings.

**Build Tool:** clean-css-cli 5.6.2

**Build Command:**
```bash
npm run build:css:frontend
```

**Actual Command:**
```bash
cleancss -o assets/css/frontend.min.css assets/css/frontend.css
```

---

### Admin Page Styles

**File:** `assets/css/admin-page.min.css` (15KB minified)

**Source:** [`assets/css/admin-page.css`](assets/css/admin-page.css) (21KB)

**Purpose:** Styles for the plugin's admin settings page, including tabs, font upload interface, preset management, and glyph browser.

**Build Tool:** clean-css-cli 5.6.2

**Build Command:**
```bash
npm run build:css:admin
```

**Actual Command:**
```bash
cleancss -o assets/css/admin-page.min.css assets/css/admin-page.css
```

---

### Glyph Browser Styles

**File:** `assets/css/glyph-browser.min.css` (3.8KB minified)

**Source:** Pre-minified

 utility included in plugin

**Purpose:** Styles for the interactive glyph browser component.

**Note:** This file is included pre-minified. If you need the unminified source, please contact the plugin author.

---

## Build Tools and Versions

All build tools are defined in `package.json` devDependencies:

| Tool | Version | Purpose |
|------|---------|---------|
| @wordpress/scripts | 26.19.0 | Block building, testing, and WordPress integration |
| Browserify | 17.0.1 | JavaScript module bundling |
| Babelify | 10.0.0 | Babel transformer for Browserify |
| @babel/core | 7.28.5 | JavaScript transpilation core |
| @babel/preset-env | 7.28.5 | ES6+ transpilation |
| @babel/preset-react | 7.28.5 | JSX/React transpilation |
| Terser | 5.16.0 | JavaScript minification |
| clean-css-cli | 5.6.2 | CSS minification |
| Jest | 29.7.0 | JavaScript unit testing (via @wordpress/scripts) |

See [`package.json`](package.json) for the complete list of dependencies and versions.

---

## Configuration Files

### Babel Configuration

**File:** [`.babelrc`](.babelrc)

**Purpose:** Configures Babel transpilation settings for converting ES6+ and JSX to browser-compatible JavaScript.

**Contents:**
```json
{
  "presets": [
    "@babel/preset-env",
    "@babel/preset-react"
  ]
}
```

### Jest Configuration

**File:** [`jest.config.js`](jest.config.js)

**Purpose:** Configures Jest testing framework settings for running unit tests.

---

## Verification Process

To verify that all minified/compiled files can be rebuilt from the provided source code:

### 1. Install Dependencies
```bash
npm install
```

### 2. Rebuild All Files
```bash
npm run build
```

This will regenerate:
- `assets/js/block-editor.min.js`
- `assets/js/admin-page.min.js`
- `blocks/typography-stylist/build/index.js`
- `assets/css/block-editor.min.css`
- `assets/css/frontend.min.css`
- `assets/css/admin-page.min.css`

### 3. Run Tests
```bash
npm test
```

All tests should pass, confirming that the source code functions correctly.

### 4. Compare File Sizes

Minified files should be smaller than their source files:
- `block-editor.min.js` (91KB) < `block-editor.js` (110KB) ✓
- `admin-page.min.js` (35KB) < `admin-page.js` (53KB) ✓
- All `.min.css` files smaller than corresponding `.css` files ✓

---

## File Organization

```
opentype-stylist/
├── assets/
│   ├── js/
│   │   ├── block-editor.js          [SOURCE]
│   │   ├── block-editor.min.js      [COMPILED]
│   │   ├── admin-page.js            [SOURCE]
│   │   ├── admin-page.min.js        [COMPILED]
│   │   ├── glyph-browser.min.js     [PRE-MINIFIED]
│   │   ├── modal-drag-resize.js     [SOURCE - not minified]
│   │   └── utils.js                 [SOURCE - not minified]
│   └── css/
│       ├── block-editor.css         [SOURCE]
│       ├── block-editor.min.css     [COMPILED]
│       ├── frontend.css             [SOURCE]
│       ├── frontend.min.css         [COMPILED]
│       ├── admin-page.css           [SOURCE]
│       ├── admin-page.min.css       [COMPILED]
│       └── glyph-browser.min.css    [PRE-MINIFIED]
├── blocks/
│   └── typost/
│       ├── index.js                 [SOURCE]
│       ├── edit.js                  [SOURCE]
│       ├── save.js                  [SOURCE]
│       ├── utils.js                 [SOURCE]
│       ├── view.js                  [SOURCE]
│       ├── block.json               [CONFIG]
│       ├── style.css                [SOURCE]
│       ├── editor.css               [SOURCE]
│       └── build/
│           ├── index.js             [COMPILED]
│           └── index.asset.php      [GENERATED]
├── .babelrc                         [CONFIG]
├── jest.config.js                   [CONFIG]
├── package.json                     [CONFIG]
├── BUILD.md                         [DOCUMENTATION]
└── SOURCE.md                        [THIS FILE]
```

---

## WordPress Integration

The plugin enqueues minified files in production for performance:

**PHP:** [`typography-stylist.php`](typography-stylist.php)

Block editor assets (lines ~173-226):
```php
wp_enqueue_style('typost-block-editor',
    TYPOST_PLUGIN_URL . 'assets/css/block-editor.min.css');
wp_enqueue_script('typost-block-editor',
    TYPOST_PLUGIN_URL . 'assets/js/block-editor.min.js');
```

Frontend assets (line ~571):
```php
wp_enqueue_style('typost-frontend',
    TYPOST_PLUGIN_URL . 'assets/css/frontend.min.css');
```

Admin assets (lines ~752-771):
```php
wp_enqueue_style('typost-admin',
    TYPOST_PLUGIN_URL . 'assets/css/admin-page.min.css');
wp_enqueue_script('typost-admin',
    TYPOST_PLUGIN_URL . 'assets/js/admin-page.min.js');
```

---

## Security and Transparency

This plugin follows WordPress.org security and transparency guidelines:

1. **All minified files have corresponding source code** included in distribution
2. **Build instructions provided** in BUILD.md for rebuilding from source
3. **Build tools documented** with specific versions for reproducibility
4. **Configuration files included** (.babelrc, jest.config.js, package.json)
5. **No obfuscation** - only standard minification for performance
6. **Open source** - All code is GPLv2 or later licensed

---

## License

All source code is licensed under GPLv2 or later. See plugin header for full license details:

```
License: GPLv2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
```

---

## Questions or Support

- **Build Issues**: See BUILD.md for troubleshooting
- **Development Guidelines**: See CLAUDE.md for architecture and coding standards
- **WordPress.org Review**: This documentation satisfies the source code requirements

---

## Changelog

### Version 1.1.3
- Added BUILD.txt and SOURCE.md for WordPress.org compliance
- Included source files alongside minified files in distribution
- Documented all build processes and tools
