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
- Smart selection warnings for partial word selections that can cause screen readers to stumble. Convert text to a Typography Stylist block to present text to screen readers without breaking up the word with span tags needed for complex typoography.
- Typography Stylist block maintains proper heading semantics for both screen reader and visual views.
- ARIA markup ensures screen reader compatibility
- Optional aria-label attributes for inline formatted text
- Configurable screen reader classes (visually-hidden, sr-only, custom)
- Conversion tool from inline formats to accessible blocks

### Font Management
- Upload webfont kits from MyFonts, Fontspring, or other providers
- Adobe Fonts (Typekit) integration via embed codes
- Custom font definitions for fonts loaded through other spurces such as the theme
- Font fallback configuration
- Font preview with OpenType feature testing
- Fonts only load on pages they are used by default, with option to enable on all content

## Installation

1. **Download** or clone this repository into your WordPress plugins directory:
   ```bash
   cd wp-content/plugins/
   git clone [repository-url] typost
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
2. **Go to** Settings → Typography Symtylist → Custom Fonts tab
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
4. **Go to** Settings → Typost → Custom Fonts tab
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

**Note:** The custom definitions section does not load fonts, it only applies OpenType features to fonts already loaded on your site.

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
4. **Click the Typography Stylist button** in the toolbar (swashy "T" icon)
5. **Choose a preset** or toggle individual features
6. **Preview** your changes in real-time
7. **Click Apply** to save

**Note:** If you select partial words, you'll see an accessibility warning with options to:
- Convert to an accessible Typography Stylist block (recommended)
- Discard changes

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
- Script fonts by Alejandro Paul (Sudtipos) like Chocolate OT, Affair, Gratitude Script (with Kathy Milici)
- Bookmania by Mark Stephenson
- ITC Avant Garde
- Orpheus Pro

**Note:** Check the font's documentation or specimen to verify which OpenType features are supported. Not all fonts include all features, and feature support varies by font.

### Example: Wedding Invitation Headline

```html
<!-- Before -->
<h1>Sarah & Michael</h1>

<!-- After (with Wedding Style preset: calt + ss02 + swsh) -->
<h1><span class="typost-styled" data-features="calt,ss02,swsh" style="font-feature-settings: 'calt' 1, 'ss02' 1, 'swsh' 1">S</span>arah & Michael</h1>
```

## Technical Details

### File Structure

```
typost/
├── typost.php              # Main plugin file
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
- Registers custom format type: `typost/typography-features`
- React-based UI components

**REST API Endpoints**

*Presets:*
- `GET /wp-json/typost/v1/presets` - Get all presets
- `POST /wp-json/typost/v1/presets` - Save new preset
- `DELETE /wp-json/typost/v1/presets/{id}` - Delete preset

*Custom Fonts:*
- `GET /wp-json/typost/v1/fonts` - Get uploaded font kits
- `POST /wp-json/typost/v1/fonts` - Upload font kit (multipart/form-data)
- `DELETE /wp-json/typost/v1/fonts/{id}` - Delete font kit

*Adobe Fonts:*
- `GET /wp-json/typost/v1/adobe-fonts` - Get Adobe Fonts projects
- `POST /wp-json/typost/v1/adobe-fonts` - Add Adobe Fonts project
- `DELETE /wp-json/typost/v1/adobe-fonts/{id}` - Delete Adobe Fonts project
- `PATCH /wp-json/typost/v1/adobe-fonts/{id}/fallback` - Update fallback fonts

*Custom Fonts:*
- `GET /wp-json/typost/v1/manual-fonts` - Get custom font definitions
- `POST /wp-json/typost/v1/manual-fonts` - Add custom font
- `DELETE /wp-json/typost/v1/manual-fonts/{id}` - Delete custom font

*Fallbacks:*
- `PATCH /wp-json/typost/v1/fonts/{id}/fallback` - Update fallback for uploaded font

**Data Storage**
- Presets: `wp_options` table (`typost_presets`)
- Custom Fonts (Uploaded): `wp_options` table (`typost_custom_fonts`)
- Adobe Fonts: `wp_options` table (`typost_adobe_fonts`)
- Manual Fonts: `wp_options` table (`typost_manual_fonts`)
- Font Files: `wp-content/uploads/typography-stylist/fonts/` directory
- Feature settings: Inline in post content (data attributes + styles)

### CSS Implementation

Features are applied using the `font-feature-settings` CSS property:

```css
.typost-styled {
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

**For Typost Block:**
- Dual content approach: clean text for screen readers, styled text for visual display
- ARIA markup with `aria-hidden="true"` on styled content
- Configurable screen reader classes (visually-hidden, sr-only, custom)
- Semantic HTML with selectable tag types (H1-H6, P, DIV)

**Recommended Usage:**
- Use inline format for simple, complete word/phrase styling
- Use Typost block for complex or letter-by-letter typography
- Test with screen readers like NVDA (Windows) or VoiceOver (macOS) to verify compatibility with your content

### How does the Typost block ensure accessibility?

The block creates two versions of your content:

```html
<div class="wp-block-typost">
  <!-- For screen readers - maintains semantic heading structure -->
  <h2 class="visually-hidden">Beautiful Typography</h2>

  <!-- For visual display -->
  <h2 class="typost-styled" aria-hidden="true">
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

Fonts are stored securely in `wp-content/uploads/typography-stylist/fonts/` with:
- .htaccess protection to prevent PHP execution
- Organized directory structure by kit ID
- Automatic CSS path rewriting for WordPress compatibility

### Are Adobe Fonts loaded from my server or Adobe's?

Adobe Fonts load directly from Adobe's servers using the script you provide. Make sure your domain is authorized in your Adobe Fonts project settings.

### Can I delete uploaded fonts?

Yes! Go to Settings → Typost → Custom Fonts tab and click the "Delete" button next to any font kit or Adobe Fonts project. For uploaded kits, this will also remove all associated files from your server.

### Will this work with page builders?

The plugin is designed for the WordPress block editor (Gutenberg). Compatibility with page builders depends on their implementation of rich text formatting.

### Does this slow down my site?

The plugin uses native CSS `font-feature-settings` which is hardware-accelerated in modern browsers. Performance impact depends on font file sizes and loading strategy. The plugin includes JavaScript in the block editor but uses only CSS for frontend rendering.

## Changelog

### Version 1.2.1

**Bug Fix:**
- **Fixed: Screen reader text missing spaces at line breaks** - When using Shift+Enter in Typography Stylist blocks, the visually-hidden screen reader text concatenated words without a space (e.g. "MILANOCORTINA" instead of "MILANO CORTINA"). Line breaks are now replaced with spaces in the accessible text output.

**Accessibility Enforcement:**
- **Removed: "Apply Anyway" option** - The accessibility warning when selecting partial words in rich text blocks no longer offers a bypass. Users must either convert to a Typography Stylist block (which provides accessible dual-content markup) or discard their changes. This reinforces the plugin's accessibility-first approach.
- **Changed: "Cancel" renamed to "Discard Changes"** - Clearer labeling for the action that dismisses the warning without applying styles.

### Version 1.2.0

**Quick Features Toggle Auto-Apply & UX Improvements:**
- **Improved: Auto-apply functionality** - Letter spacing, line height, font family, font weight, and font size now apply automatically with intelligent debouncing (400ms for sliders, 300ms for dropdowns, 600ms for responsive font-size with 3 sliders)
- **Improved: Consistent UX** - All Quick Features controls now auto-apply like OpenType features, eliminating confusion about which controls need Apply buttons
- **Improved: Functional Reset buttons** - Clear/Reset buttons now actually remove properties from content spans instead of just resetting UI state
- **Improved: UI reorganization** - Active Features section moved above feature panels for better visibility
- **Added: Individual Reset buttons** - Font family, font weight, and font size now have dedicated Reset buttons with undo icons for clear visual feedback

**Critical Bug Fixes:**
- **Fixed: TreeWalker document context bug** - TreeWalkers are now created from the correct document object (DOMParser `doc` instead of global `document`), preventing cross-context errors in 3 locations
- **Fixed: Responsive font-size Reset** - Now removes all related attributes (data-fontsize-min, data-fontsize-preferred, data-fontsize-max) instead of leaving orphaned attributes
- **Fixed: Memory leak** - Debounced auto-apply functions now properly clean up and cancel pending calls on component unmount
- **Fixed: Preview span removal** - Now preserves nested elements instead of flattening to text, maintaining complex formatting structure
- **Fixed: Stale closure bug** - Debounced wrappers now call latest version of apply functions via refs, resolving issue where controls wouldn't work when styles were already applied

**Bug Fix: Line Break Offset Misalignment**
- Fixed: Inline styles applied to wrong character when content contains line breaks (Shift+Enter). WordPress RichText counts `<br>` as 1 character position, but the plugin's offset calculations skipped them entirely, causing a cumulative off-by-one error per line break.
- All 12 TreeWalker-based offset calculations across the inline editor, Typography Stylist block, and shared utilities now correctly handle multi-line content.

**New Utilities:**
- Added `buildTextOffsetMap()` - builds a text node offset map that accounts for `<br>` elements, matching WordPress RichText's offset system
- Added `getEffectiveTextLength()` - measures text length including `<br>` elements as 1 character
- Added `debounce()` - utility function with cancel method for performance optimization during rapid slider adjustments
- Added `removePropertyFromSpan()` - removes specific properties and unwraps empty spans
- Added `removePropertyFromSelection()` - finds and removes properties from all spans in selection

**Testing:**
- Added comprehensive test suite with 24 tests for property removal utilities
- Tests cover edge cases including responsive font-size with other properties, nested spans, and span preservation logic
- All 252 unit tests passing

**Code Quality:**
- Extracted `classifyAtomicNode()` helper within `splitSpanAndApply` to reduce duplication in segment classification logic
- Debounced functions use refs to avoid stale closures and maintain access to current state across renders

### Version 1.1.9

**Cache & Font Loading Improvements:**
- Fixed: Archive page font loading - fonts now load correctly on blog home, category pages, tag pages, and all archive types
- Fixed: WordPress hook timing issue - font detection now runs on `template_redirect` hook (after main query) instead of `wp_enqueue_scripts` (before query) for archive pages
- Added: Manual cache clear button in Settings → Typography Stylist → Options tab
- Added: Admin setting to control archive page full content checking (enabled by default)
- Improved: Font detection caches now automatically clear when posts or pages are saved, so typography changes appear on the frontend immediately
- Improved: Cache clearing when options are changed to ensure settings take effect immediately

### Version 1.1.6

**Control Order Improvements:**
- Standardized control order across all interfaces for better consistency
- Reordered controls to: Font Family → Font Weight → Font Size → Line Height → Letter Spacing → OpenType Features
- Updated inline editor popover control order to match sidebar and quick toggles
- Updated Typography Stylist block sidebar inspector controls order
- Updated Typography Stylist block quick feature toggles popover control order

**Bug Fixes:**
- Fixed font size persistence bug where changes wouldn't persist after closing Quick Features Toggle popover
- Fixed all inline controls (font weight, font family, font size, letter spacing, line height) now correctly apply only to selected text instead of entire block
- Fixed sequential feature application bug where applying multiple inline features would incorrectly affect entire block
- Fixed state management issue where inline control values wouldn't reset after successful apply
- **Fixed inline font-family attribute preservation** - applying line-height or letter-spacing no longer loses previously applied inline fonts
- **Fixed inline fonts not loading on frontend** - inline fonts now properly enqueue @font-face rules (previously only block-level fonts loaded)
- **Fixed Quick Feature Toggle preview** - now displays in correct inline font instead of block-level font
- **Fixed block-level fonts incorrectly included** in unrelated inline operations (line-height, letter-spacing, OpenType features)

**Architecture Improvements:**
- **Inline fonts now use CSS variable system** - Changed from literal font names (e.g., `font-family: please-vf`) to CSS variables (e.g., `font-family: var(--font-12)`) matching block-level architecture
- **Standardized data attribute naming** - Inline fonts now use `data-font-id` instead of `data-fontfamily` for consistency with block-level `fontId`
- **Enhanced attribute preservation system** - Prevents style conflicts during sequential inline edits with improved logic
- **Separated concerns** - Inline styling functions now only apply their specific property without side effects
- **Unified font loading chain** - Both block and inline fonts follow same path: fontId → CSS variable → PHP detection → @font-face enqueueing

**New Utilities:**
- Added `parseInlineFontFamilyAtCursor()` utility for detecting inline fonts at cursor position
- Added memoized inline font detection for improved preview performance

**Improvements:**
- Added comprehensive validation and fallback mechanisms for all inline text styling functions
- Inline controls now work reliably when applied sequentially to different selections
- Inline state variables now reset after successful apply to prevent UI/content desync

**Testing:**
- Added comprehensive test coverage for CSS variable implementation and attribute preservation
- Added tests for `parseInlineFontFamilyAtCursor()` utility function
- Added Playwright E2E testing infrastructure for inline features
- Added comprehensive E2E test suite covering font size, font weight, letter spacing, line height, font family, and sequential application
- Added secure credential management for E2E tests with .env files (git-ignored)
- E2E tests included in repository but excluded from npm package distribution
- All 167 unit tests passing

**Developer Notes:**
- Inline font CSS now uses `var(--font-ID)` for automatic PHP detection and @font-face enqueueing
- Consistent data attribute naming: `data-font-id`, `data-fontsize`, `data-fontweight`, `data-features`

### Version 1.1.4

**Bug Fixes:**
- Fixed mixed content warnings on HTTPS sites when loading custom fonts
- Font URLs now use relative paths for protocol-agnostic loading
- Legacy fonts with absolute URLs are automatically converted at render time

### Version 1.1.3

See readme.txt for full version 1.1.3 changelog (initial public release).

### Version 1.0.0

**Accessibility Features:**
- Typost custom block with ARIA support
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

The plugin works as-is without build tools for the inline format. the Typost block requires building with `npm run build:block`.

### Extending the Plugin

**Add Custom Features**

```php
// In your theme's functions.php
add_filter('TYPOST_available_features', function($features) {
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
add_filter('TYPOST_default_presets', function($presets) {
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
- **Secure Storage**: Uploaded fonts stored in `wp-content/uploads/typography-stylist/fonts/` with .htaccess protection

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
