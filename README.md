# OpenType Stylist

A WordPress plugin that adds advanced OpenType typography features to headlines with inline text selection and live preview.

![WordPress Plugin Version](https://img.shields.io/badge/version-1.0.0-blue)
![WordPress Compatibility](https://img.shields.io/badge/wordpress-5.8%2B-green)
![PHP Version](https://img.shields.io/badge/php-7.4%2B-purple)

## Features

### 🎨 Rich Typography Control
- **Ligatures**: Standard (liga), Discretionary (dlig), Contextual Alternates (calt)
- **Stylistic Sets**: ss01 through ss20
- **Swashes**: Regular (swsh) and Contextual (cswh)
- **Alternates**: Stylistic alternates (salt), Titling (titl), Ornaments (ornm)

### ✨ User-Friendly Interface
- Inline text selection in the block editor
- Live preview before applying changes
- Organized feature categories
- Visual popover interface

### 🚀 Performance & Compatibility
- Native CSS font-feature-settings (no frontend JavaScript)
- Works with Gutenberg block editor
- Compatible with all modern browsers
- Optimized for script and display fonts

## Installation

1. **Download** or clone this repository into your WordPress plugins directory:
   ```bash
   cd wp-content/plugins/
   git clone [repository-url] opentype-stylist
   ```

2. **Activate** the plugin through the WordPress admin panel:
   - Go to Plugins → Installed Plugins
   - Find "OpenType Stylist"
   - Click "Activate"

3. **Configure** (optional):
   - Go to Settings → Headline Typography
   - Review available features and presets
   - Customize as needed

## Usage

### Basic Workflow

1. **Create a heading block** in the WordPress editor (H1-H6)
2. **Type your headline** text
3. **Select the text** you want to style
4. **Click the Typography Features button** in the toolbar (decorative "A" icon)
5. **Choose a preset** or toggle individual features
6. **Preview** your changes in real-time
7. **Click Apply** to save

### Recommended Fonts

This plugin works best with fonts that support OpenType features:

#### Script Fonts by Alejandro Paul (Sudtipos)
- **Calgary Script** - Elegant connecting script
- **Affair** - Romantic calligraphy
- **Adios Script** - Casual handwritten style
- **Parfumerie Script** - Vintage commercial script
- **Samantha** - Upright script with flourishes

#### Other Compatible Fonts
- **Playfair Display** (Google Fonts)
- **Cormorant** (Google Fonts)
- **Adobe Caslon Pro**
- **Freight Display Pro**
- Most professional typefaces

### Example: Wedding Invitation Headline

```html
<!-- Before -->
<h1>Sarah & Michael</h1>

<!-- After (with Wedding Style preset: calt + ss02 + swsh) -->
<h1><span class="hls-styled" data-features="calt,ss02,swsh" style="font-feature-settings: 'calt' 1, 'ss02' 1, 'swsh' 1">S</span>arah & Michael</h1>
```

## Technical Details

### File Structure

```
opentype-stylist/
├── opentype-stylist.php    # Main plugin file
├── includes/
│   └── admin-page.php               # Admin settings page
├── assets/
│   ├── js/
│   │   └── block-editor.js          # Block editor integration
│   └── css/
│       ├── block-editor.css         # Editor styles
│       └── frontend.css             # Frontend styles
├── readme.txt                        # WordPress.org readme
└── README.md                         # This file
```

### WordPress Integration

**Block Editor (Gutenberg)**
- Uses `@wordpress/format-api` for inline formatting
- Registers custom format type: `hls/typography-features`
- React-based UI components

**REST API Endpoints**
- `GET /wp-json/hls/v1/presets` - Get all presets
- `POST /wp-json/hls/v1/presets` - Save new preset
- `DELETE /wp-json/hls/v1/presets/{id}` - Delete preset

**Data Storage**
- Presets: `wp_options` table (`hls_presets`)
- Feature settings: Inline in post content (data attributes + styles)

### CSS Implementation

Features are applied using the `font-feature-settings` CSS property:

```css
.hls-styled {
    font-feature-settings: "calt" 1, "ss02" 1, "swsh" 1;
}
```

### Browser Support

| Browser | Support |
|---------|---------|
| Chrome 48+ | ✅ Full |
| Firefox 34+ | ✅ Full |
| Safari 9.1+ | ✅ Full |
| Edge 79+ | ✅ Full |
| IE 10-11 | ⚠️ Partial |

## Development

### Prerequisites

- WordPress 5.8 or higher
- PHP 7.4 or higher

The plugin works as-is without build tools. Optionally, run `npm install && npm run build` to minify assets, or `npm run watch` for development with automatic rebuilding.

### Extending the Plugin

**Add Custom Features**

```php
// In your theme's functions.php
add_filter('hls_available_features', function($features) {
    $features[] = array(
        'id' => 'cv01',
        'name' => __('Character Variant 1'),
        'category' => 'variants',
        'description' => __('Alternative character design')
    );
    return $features;
});
```

**Add Custom Presets**

```php
add_filter('hls_default_presets', function($presets) {
    $presets[] = array(
        'id' => 'my-custom-preset',
        'name' => __('My Custom Style'),
        'features' => array('calt', 'ss03', 'dlig'),
        'description' => __('Custom combination')
    );
    return $presets;
});
```

## License

This project is licensed under the GPL v2 or later - see the [LICENSE](LICENSE) file for details.

## Credits

**Developed by:** Matthew Neil Cowan (github: mattcowan)

**Inspired by:** Beautiful typography and the amazing work of type designers like Alejandro Paul

**Special Thanks:**
- The WordPress community
- Type designers who create fonts with rich OpenType features
- Everyone who appreciates good typography

---

Made with ❤️ for typography enthusiasts
