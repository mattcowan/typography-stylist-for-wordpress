# OpenType Stylist

A WordPress plugin that adds advanced OpenType typography features to headlines with inline text selection and live preview.

![WordPress Plugin Version](https://img.shields.io/badge/version-1.1.0-blue)
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

### 📦 Font Management
- **Upload Custom Fonts**: Upload webfont kits from MyFonts, Fontspring, or other providers
- **Adobe Fonts Integration**: Add fonts from Adobe Fonts (Typekit) by pasting embed codes
- **Custom Font Definitions**: Define fonts loaded through your theme, plugins, or CDN
- **Font Fallbacks**: Set fallback fonts for all font sources for better browser compatibility
- **Font Preview**: Test OpenType features with any uploaded or connected font
- **Automatic Font Loading**: Optimized font delivery on frontend and in the editor

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

### Adding Custom Fonts

#### Option 1: Upload Webfont Kits (MyFonts, Fontspring, etc.)

1. **Purchase and download** your webfont kit from MyFonts, Fontspring, or another provider
2. **Go to** Settings → OpenType Stylist → Custom Fonts tab
3. **Enter a name** for your font kit (e.g., "Calgary Script 2024")
4. **Click "Choose ZIP File"** and select your webfont kit ZIP file
5. **Click "Upload Font Kit"**
6. The plugin will:
   - Extract the ZIP file
   - Process the CSS and font files
   - Make fonts available in the editor and preview selector
   - Store files securely in your WordPress uploads directory

**What should the ZIP contain:**
- A CSS file with @font-face declarations (e.g., MyWebfontsKit.css)
- Font files (WOFF, WOFF2, TTF, OTF, EOT) in their subdirectories
- The directory structure must match the paths in the CSS file

#### Option 2: Add Adobe Fonts (Typekit)

1. **Go to** [fonts.adobe.com](https://fonts.adobe.com) and create or open a Web Project
2. **Add the fonts** you want to use to your project
3. **Copy the embed code** (the `<script>` tag) from your Adobe Fonts project
4. **Go to** Settings → OpenType Stylist → Custom Fonts tab
5. **Scroll to** "Adobe Fonts (Typekit)" section
6. **Enter a project name** (e.g., "My Adobe Fonts")
7. **Paste the embed code** into the textarea
8. **Optionally enter font family names** separated by commas (e.g., "proxima-nova, futura-pt")
9. **Click "Add Adobe Fonts Project"**

The fonts will be immediately available in the preview selector and block editor.

**Note:** Make sure your domain is authorized in your Adobe Fonts project settings.

#### Option 3: Define Custom Fonts

If you have fonts loaded through your theme, another plugin, or a CDN (like Google Fonts), you can define them for use with this plugin:

1. **Make sure your font is already loaded** on your site
2. **Go to** Settings → OpenType Stylist → Custom Fonts tab
3. **Scroll to** "Custom Font Definitions" section
4. **Enter a display name** for the font (e.g., "Playfair Display")
5. **Enter the CSS font-family value** exactly as it appears in your theme (e.g., `'Playfair Display', serif`)
6. **Optionally add fallback fonts** separated by commas (e.g., `Georgia, serif`)
7. **Click "Add Custom Font"**

The font will be available in the block editor font selector.

**Examples of CSS font-family values:**
- Google Fonts: `'Playfair Display', serif`
- System fonts: `-apple-system, BlinkMacSystemFont, sans-serif`
- Theme fonts: `'My Theme Font', Georgia, serif`

**Note:** This plugin does not load fonts - it only applies OpenType features to fonts already loaded on your site.

### Managing Font Fallbacks

For any font (uploaded, Adobe Fonts, or custom), you can define fallback fonts that will be used if the primary font fails to load:

- **Default fonts** have no fallbacks and inherit from the parent element
- **Custom fonts** can specify fallbacks when adding the font
- Fallbacks are included automatically in the CSS `font-family` declaration

Example: If you set a font with fallbacks as `Playfair Display` with fallbacks `Georgia, serif`, the CSS will be:
```css
font-family: 'Playfair Display', Georgia, serif;
```

### Applying Typography Features

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
<h1><span class="ots-styled" data-features="calt,ss02,swsh" style="font-feature-settings: 'calt' 1, 'ss02' 1, 'swsh' 1">S</span>arah & Michael</h1>
```

## Technical Details

### File Structure

```
opentype-stylist/
├── opentype-stylist.php              # Main plugin file
├── includes/
│   └── admin-page.php                # Admin settings page
├── assets/
│   ├── js/
│   │   ├── block-editor.js           # Block editor integration
│   │   └── admin-page.js             # Admin page interactions
│   └── css/
│       ├── block-editor.css          # Editor styles
│       ├── admin-page.css            # Admin page styles
│       └── frontend.css              # Frontend styles
├── languages/                        # Translation files
├── readme.txt                        # WordPress.org readme
└── README.md                         # This file
```

### WordPress Integration

**Block Editor (Gutenberg)**
- Uses `@wordpress/format-api` for inline formatting
- Registers custom format type: `hls/typography-features`
- React-based UI components

**REST API Endpoints**

*Presets:*
- `GET /wp-json/ots/v1/presets` - Get all presets
- `POST /wp-json/ots/v1/presets` - Save new preset
- `DELETE /wp-json/ots/v1/presets/{id}` - Delete preset

*Custom Fonts:*
- `GET /wp-json/ots/v1/fonts` - Get uploaded font kits
- `POST /wp-json/ots/v1/fonts` - Upload font kit (multipart/form-data)
- `DELETE /wp-json/ots/v1/fonts/{id}` - Delete font kit

*Adobe Fonts:*
- `GET /wp-json/ots/v1/adobe-fonts` - Get Adobe Fonts projects
- `POST /wp-json/ots/v1/adobe-fonts` - Add Adobe Fonts project
- `DELETE /wp-json/ots/v1/adobe-fonts/{id}` - Delete Adobe Fonts project
- `PATCH /wp-json/ots/v1/adobe-fonts/{id}/fallback` - Update fallback fonts

*Custom Fonts:*
- `GET /wp-json/ots/v1/manual-fonts` - Get custom font definitions
- `POST /wp-json/ots/v1/manual-fonts` - Add custom font
- `DELETE /wp-json/ots/v1/manual-fonts/{id}` - Delete custom font

*Fallbacks:*
- `PATCH /wp-json/ots/v1/fonts/{id}/fallback` - Update fallback for uploaded font

**Data Storage**
- Presets: `wp_options` table (`ots_presets`)
- Custom Fonts (Uploaded): `wp_options` table (`ots_custom_fonts`)
- Adobe Fonts: `wp_options` table (`ots_adobe_fonts`)
- Manual Fonts: `wp_options` table (`ots_manual_fonts`)
- Font Files: `wp-content/uploads/ots/fonts/` directory
- Feature settings: Inline in post content (data attributes + styles)

### CSS Implementation

Features are applied using the `font-feature-settings` CSS property:

```css
.ots-styled {
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

## Frequently Asked Questions

### Do I need special fonts?

Yes, this plugin requires fonts that support OpenType features. Most premium script fonts and professional typefaces include these features. You can:
- Upload webfont kits from MyFonts, Fontspring, or other providers
- Connect Adobe Fonts (Typekit) projects
- Use any font loaded via @font-face in your theme

### How do I know if a font supports OpenType features?

Check the font's documentation or specimen from the foundry. You can also use the plugin to experiment - features that aren't supported simply won't affect the text.

### Can I use this with Google Fonts?

Some Google Fonts support OpenType features. Check the individual font's specimen page for feature support. Most Google Fonts have limited OpenType features compared to premium fonts.

### What happens to uploaded fonts?

Fonts are stored securely in `wp-content/uploads/ots/fonts/` with:
- .htaccess protection to prevent PHP execution
- Organized directory structure by kit ID
- Automatic CSS path rewriting for WordPress compatibility

### Are Adobe Fonts loaded from my server or Adobe's?

Adobe Fonts load directly from Adobe's servers using the script you provide. Make sure your domain is authorized in your Adobe Fonts project settings.

### Can I delete uploaded fonts?

Yes! Go to Settings → OpenType Stylist → Custom Fonts tab and click the "Delete" button next to any font kit or Adobe Fonts project. For uploaded kits, this will also remove all associated files from your server.

### Will this work with page builders?

The plugin is designed for the WordPress block editor (Gutenberg). Compatibility with page builders depends on their implementation of rich text formatting.

### Does this slow down my site?

No. The plugin uses native CSS `font-feature-settings` which is hardware-accelerated in modern browsers. There's no JavaScript on the frontend. Font loading is optimized to only load fonts used on the current page.

## Development

### Prerequisites

- WordPress 5.8 or higher
- PHP 7.4 or higher

The plugin works as-is without build tools. Optionally, run `npm install && npm run build` to minify assets, or `npm run watch` for development with automatic rebuilding.

### Extending the Plugin

**Add Custom Features**

```php
// In your theme's functions.php
add_filter('OTS_available_features', function($features) {
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
add_filter('OTS_default_presets', function($presets) {
    $presets[] = array(
        'id' => 'my-custom-preset',
        'name' => __('My Custom Style'),
        'features' => array('calt', 'ss03', 'dlig'),
        'description' => __('Custom combination')
    );
    return $presets;
});
```

## Security

### Font Upload Security

The plugin implements multiple security measures for font uploads:

- **File Type Validation**: Only allows CSS, WOFF, WOFF2, TTF, OTF, EOT, and SVG files
- **ZIP Extraction Security**: Validates all extracted files and removes any dangerous file types
- **Path Traversal Protection**: Prevents files from being extracted outside the designated directory
- **CSS Sanitization**: Removes dangerous CSS expressions, JavaScript protocols, and unwanted @ rules
- **Size Limits**: Maximum 10MB for ZIP files, 1MB for CSS files
- **Secure Storage**: Uploaded fonts stored in `wp-content/uploads/ots/fonts/` with .htaccess protection

### Adobe Fonts Security

- **URL Validation**: Only accepts HTTPS URLs from `use.typekit.net`
- **Duplicate Prevention**: Checks for existing Adobe Fonts projects before adding
- **Script Sanitization**: Validates and sanitizes embed codes

### General Security

- **Nonce Verification**: All REST API requests require valid nonces
- **Capability Checks**: Upload and delete operations require appropriate WordPress permissions
- **Rate Limiting**: Prevents abuse of REST API endpoints (50 requests per minute per user)
- **Input Sanitization**: All user input is sanitized using WordPress functions

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
