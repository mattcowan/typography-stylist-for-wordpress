# Typography Stylist

A WordPress plugin that adds advanced OpenType typography features to headlines with inline text selection and live preview in the Gutenberg block editor.

## Features

### Typography Control
- Ligatures: Standard (liga), Discretionary (dlig), Contextual Alternates (calt)
- Stylistic Sets: ss01 through ss20
- Swashes: Regular (swsh) and Contextual (cswh)
- Alternates: Stylistic alternates (salt), Titling (titl), Ornaments (ornm)

### User Interface
- Inline text selection in the block editor
- Live preview before applying changes
- Organized feature categories
- Visual popover interface

### Technical Implementation
- Native CSS font-feature-settings
- Gutenberg block editor integration
- Supports modern browsers with OpenType feature support

### Accessibility Features
- Smart selection warnings for partial word selections
- Typography Stylist block maintains proper heading semantics for both screen reader and visual views
- ARIA markup ensures screen reader compatibility while enabling complex typography
- Optional aria-label attributes for inline formatted text
- Configurable screen reader classes (visually-hidden, sr-only, custom)
- Conversion tool from inline formats to accessible blocks

### Font Management
- Upload webfont kits from MyFonts, Fontspring, or other providers
- Adobe Fonts (Typekit) integration via embed codes
- Custom font definitions for fonts loaded through themes, plugins, or CDN
- Font fallback configuration
- Font preview with OpenType feature testing

## Installation

1. **Download** or clone this repository into your WordPress plugins directory:
   ```bash
   cd wp-content/plugins/
   git clone [repository-url] opentype-stylist
   ```

2. **Activate** the plugin through the WordPress admin panel:
   - Go to Plugins → Installed Plugins
   - Find "Typography Stylist"
   - Click "Activate"

3. **Configure** (optional):
   - Go to Settings → Headline Typography
   - Review available features and presets
   - Customize as needed

## Usage

### Adding Custom Fonts

#### Option 1: Upload Webfont Kits (MyFonts, Fontspring, etc.)

1. **Purchase and download** your webfont kit from MyFonts, Fontspring, or another provider
2. **Go to** Settings → Typography Stylist → Custom Fonts tab
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
4. **Go to** Settings → Typography Stylist → Custom Fonts tab
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
2. **Go to** Settings → Typography Stylist → Custom Fonts tab
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

#### Method 1: Inline Format (for complete words/phrases)

1. **Create a heading block** in the WordPress editor (H1-H6)
2. **Type your headline** text
3. **Select the text** you want to style (complete words or phrases)
4. **Click the Typography Stylist button** in the toolbar (circle "O" icon)
5. **Choose a preset** or toggle individual features
6. **Preview** your changes in real-time
7. **Click Apply** to save

**Note:** If you select partial words, you'll see an accessibility warning with options to:
- Convert to an accessible Typography Stylist block
- Apply anyway (not recommended)
- Cancel

#### Method 2: Typography Stylist Block (for complex typography)

1. **Add a Typography Stylist block** from the block inserter
2. **Select the heading level** (H1-H6, P, or DIV) from the toolbar
3. **Type your text** directly in the block
4. **Configure features** in the sidebar Inspector Controls:
   - Font family
   - Font weight
   - Letter spacing
   - Font size (static or responsive/fluid)
   - OpenType features by category
   - Screen reader class
5. **Preview** changes in real-time in the editor

**Accessibility Benefits:**
- Proper semantic HTML structure
- Screen reader-friendly markup with duplicate content
- Configurable sr-only classes
- ARIA hidden attributes for visual-only content

### Recommended Fonts

This plugin requires fonts that support OpenType features. Many premium script fonts and professional typefaces include these features.

**Examples of fonts with OpenType features:**
- Script fonts by Alejandro Paul (Sudtipos): Calgary Script, Affair, Adios Script, Parfumerie Script, Samantha
- Google Fonts: Playfair Display, Cormorant (limited OpenType support)
- Professional typefaces: Adobe Caslon Pro, Freight Display Pro

**Note:** Check the font's documentation or specimen to verify which OpenType features are supported. Not all fonts include all features, and feature support varies by font.

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
├── typography-stylist.php              # Main plugin file
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
- Registers custom format type: `ots/typography-features`
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

The plugin uses CSS `font-feature-settings` which is supported in modern browsers:

- Chrome 48+
- Firefox 34+
- Safari 9.1+
- Edge 79+
- Internet Explorer 10-11 (partial support)

Actual OpenType feature rendering depends on both browser support and font file capabilities.

## Frequently Asked Questions

### Do I need special fonts?

Yes, this plugin requires fonts that support OpenType features. Most premium script fonts and professional typefaces include these features. You can:
- Upload webfont kits from MyFonts, Fontspring, or other providers
- Connect Adobe Fonts (Typekit) projects
- Use any font loaded via @font-face in your theme

### Is this plugin accessible?

The plugin includes accessibility features for screen reader compatibility:

**For Inline Formats:**
- Warns when partial word selections could fragment text
- Optional aria-label support (configurable in Settings → Accessibility)
- Conversion tool to accessible block format

**For Typography Stylist Block:**
- Dual content approach: clean text for screen readers, styled text for visual display
- ARIA markup with `aria-hidden="true"` on styled content
- Configurable screen reader classes (visually-hidden, sr-only, custom)
- Semantic HTML with selectable tag types (H1-H6, P, DIV)

**Recommended Usage:**
- Use inline format for simple, complete word/phrase styling
- Use Typography Stylist block for complex or letter-by-letter typography
- Test with screen readers like NVDA (Windows) or VoiceOver (macOS) to verify compatibility with your content

### How does the Typography Stylist block ensure accessibility?

The block creates two versions of your content:

```html
<div class="wp-block-opentype-stylist">
  <!-- For screen readers - maintains semantic heading structure -->
  <h2 class="visually-hidden">Beautiful Typography</h2>

  <!-- For visual display -->
  <h2 class="ots-styled" aria-hidden="true">
    [Styled content with OpenType features]
  </h2>
</div>
```

Screen readers read the clean, unformatted text in a proper semantic heading (preserving document outline and heading navigation) while sighted users see the beautifully styled version.

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

Yes! Go to Settings → Typography Stylist → Custom Fonts tab and click the "Delete" button next to any font kit or Adobe Fonts project. For uploaded kits, this will also remove all associated files from your server.

### Will this work with page builders?

The plugin is designed for the WordPress block editor (Gutenberg). Compatibility with page builders depends on their implementation of rich text formatting.

### Does this slow down my site?

The plugin uses native CSS `font-feature-settings` which is hardware-accelerated in modern browsers. Performance impact depends on font file sizes and loading strategy. The plugin includes JavaScript in the block editor but uses only CSS for frontend rendering.

## Changelog

### Version 1.0.0

**Accessibility Features:**
- Typography Stylist custom block with ARIA support
- Smart selection validation with warnings for partial word selections
- Conversion from inline format to accessible block
- Optional aria-label support for inline formatted text
- Accessibility settings tab with screen reader configuration
- Screen reader class options (visually-hidden, sr-only, custom)
- Accessibility documentation

**Font Management:**
- Upload custom fonts from webfont kits (MyFonts, Fontspring, etc.)
- Adobe Fonts (Typekit) integration with embed code support
- Custom font definitions for fonts loaded through themes, plugins, or CDN
- Font fallback support
- Secure font file handling and storage with .htaccess protection
- Font preview system with size controls

**Core Typography Features:**
- Ligatures: Standard (liga), Discretionary (dlig), Contextual Alternates (calt)
- Stylistic Sets: ss01 through ss20
- Swashes: Regular (swsh) and Contextual (cswh)
- Alternates: Stylistic alternates (salt), Titling (titl), Ornaments (ornm)
- Quick presets for common typography styles
- Custom presets with save functionality

**UI/UX:**
- Inline text selection in block editor
- Live preview before applying changes
- Visual popover interface with organized feature categories
- Spanish (es_ES) and French (fr_FR) translations

**Technical:**
- Native CSS font-feature-settings
- WordPress block editor API integration
- REST API endpoints for plugin features
- Custom block with JSX/React components
- Integrated @wordpress/scripts build process
- Transient caching
- Rate limiting on REST API endpoints

## Development

### Prerequisites

- WordPress 5.8 or higher
- PHP 7.4 or higher
- Node.js 14+ (for building the custom block)

### Building the Plugin

```bash
# Install dependencies
npm install

# Build everything (block + minified assets)
npm run build

# Build only the custom block
npm run build:block

# Development mode with auto-rebuild
npm run watch
```

The plugin works as-is without build tools for the inline format. the Typography Stylist block requires building with `npm run build:block`.

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

**Special Thanks:**
- The WordPress community
- Type designers who create fonts with OpenType features
