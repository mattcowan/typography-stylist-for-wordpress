=== OpenType Stylist ===
Contributors: mattcowan
Tags: typography, opentype, ligatures, stylistic-sets, webfonts
Requires at least: 5.8
Tested up to: 6.9
Stable tag: 1.0.7
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add advanced OpenType features to headlines with inline text selection and live preview. Upload fonts, connect Adobe Fonts.

== Description ==

OpenType Stylist provides typography control for WordPress headlines. This plugin allows you to apply OpenType features directly in the block editor.

= Key Features =

* **Inline Text Selection**: Highlight any text within headings and apply typography features
* **Live Preview**: See changes in real-time before applying
* **Rich Feature Support**: Ligatures (liga, dlig, calt), Stylistic Sets (ss01-ss20), Swashes, Alternates, and more
* **Quick Presets**: Pre-configured combinations for common styles (Elegant Script, Wedding Style, etc.)
* **Custom Presets**: Save your favorite feature combinations for reuse
* **Visual Interface**: User-friendly popover with organized feature categories
* **Block Editor Native**: Seamlessly integrates with Gutenberg
* **Upload Custom Fonts**: Upload webfont kits from MyFonts, Fontspring, or other providers
* **Adobe Fonts Integration**: Connect Adobe Fonts (Typekit) projects by pasting embed codes
* **Custom Font Definitions**: Define fonts loaded through your theme, plugins, or CDN
* **Font Fallbacks**: Set fallback fonts for all font sources for better compatibility
* **Font Preview**: Test OpenType features with any uploaded or connected font
* **Accessibility Features**: Screen reader support with ARIA markup and a heading structure that maintains proper semantics for both screen reader and visual views
* **OpenType Stylist Block**: Custom block for complex typography that preserves the document outline (maintains proper heading levels for assistive technology navigation)
* **Smart Warnings**: Alerts when selecting partial words and offers accessible conversion
* **ARIA Label Support**: Optional aria-label attributes for screen reader compatibility

= Supported OpenType Features =

**Ligatures:**
* Standard Ligatures (liga)
* Discretionary Ligatures (dlig)
* Contextual Alternates (calt)

**Stylistic Sets:**
* ss01 through ss20

**Swashes & Alternates:**
* Swashes (swsh)
* Contextual Swashes (cswh)
* Stylistic Alternates (salt)
* Titling (titl)
* Ornaments (ornm)

= Perfect For =

* Wedding invitations and event designs
* Luxury brand websites
* Editorial and magazine layouts
* Elegant script fonts
* Display typography
* Premium web fonts

= Recommended Fonts =

This plugin requires fonts that support OpenType features. Many premium script fonts and professional typefaces include these features.

Examples:
* Script fonts by Alejandro Paul (Calgary Script, Affair, Adios Script, Parfumerie Script)
* Professional typefaces with OpenType support

Check the font's documentation or specimen to verify which OpenType features are supported.

= How It Works =

1. Create or edit a heading block (H1-H6)
2. Type your headline text
3. Select the text you want to style
4. Click the "Typography Features" button in the toolbar
5. Choose a preset or select individual features
6. See the live preview
7. Click Apply

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/opentype-stylist`, or install through the WordPress plugins screen
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Go to Settings → Headline Typography to view available features and presets
4. Start using the typography features in the block editor!

== Frequently Asked Questions ==

= Do I need special fonts? =

Yes, this plugin requires fonts that support OpenType features. Most premium script fonts and professional typefaces include these features. Free fonts may have limited support.

= Will this work with any font? =

The plugin will work with any font, but you'll only see results if the font includes the OpenType features you're trying to use. Check your font's documentation for supported features.

= Does this work with Google Fonts? =

Some Google Fonts support OpenType features. Check the individual font's specimen page for feature support.

= Can I use this with custom web fonts? =

Absolutely! You have four options:

1. **Upload webfont kits** from MyFonts, Fontspring, or other providers using the plugin's Custom Fonts tab
2. **Connect Adobe Fonts** (Typekit) by pasting your project's embed code
3. **Define custom fonts** loaded through your theme, plugins, or CDN (like Google Fonts)
4. **Load fonts manually** using @font-face in your theme

The plugin can apply OpenType features to any font loaded on your site.

= How do I upload custom fonts? =

1. Go to Settings → OpenType Stylist → Custom Fonts tab
2. Enter a name for your font kit
3. Click "Choose ZIP File" and select your webfont kit ZIP
4. Click "Upload Font Kit"

The plugin will extract the fonts and make them available in the editor and preview selector.

= How do I add Adobe Fonts? =

1. Go to Settings → OpenType Stylist → Custom Fonts tab
2. Scroll to "Adobe Fonts (Typekit)" section
3. Enter a project name
4. Paste your Adobe Fonts embed code (the <script> tag)
5. Optionally enter font family names for the preview selector
6. Click "Add Adobe Fonts Project"

Make sure your domain is authorized in your Adobe Fonts project settings.

= How do I define custom fonts from my theme? =

If you have fonts already loaded through your theme, another plugin, or a CDN:

1. Go to Settings → OpenType Stylist → Custom Fonts tab
2. Scroll to "Custom Font Definitions" section
3. Enter a display name for the font
4. Enter the exact CSS font-family value (e.g., 'Playfair Display', serif)
5. Optionally add fallback fonts separated by commas
6. Click "Add Custom Font"

The font will be available in the block editor font selector.

= Can I set fallback fonts? =

Yes! For any font source (uploaded, Adobe Fonts, or custom definitions), you can specify fallback fonts. These will be used if the primary font fails to load. Fallbacks are automatically included in the CSS font-family declaration.

= Is this plugin accessible? =

The plugin includes accessibility features for screen reader compatibility:

* **Inline Format Warnings**: Detects when you select partial words (which can fragment text for screen readers) and shows a warning with options to convert to an accessible block or apply anyway
* **OpenType Stylist Block**: Custom block designed for complex typography that includes ARIA markup with screen reader-accessible text
* **ARIA Label Support**: Optional setting to add aria-label attributes to inline formatted text (Settings → OpenType Stylist → Accessibility)
* **Screen Reader Classes**: The OpenType Stylist block uses configurable classes (visually-hidden, sr-only, or custom) to hide styled text from screen readers while providing clean text
* **Dual Content Approach**: The block provides duplicate content - one version styled for visual users, one clean version for assistive technology

= How does the accessibility block work? =

The OpenType Stylist block creates two versions of your text:

1. **For screen readers**: Clean, unformatted text in a semantic heading element (H1-H6) with the `visually-hidden` class applied. This maintains the document outline and heading navigation for assistive technology users.
2. **For visual display**: Styled text with `aria-hidden="true"` to prevent screen readers from reading fragmented content with complex OpenType features.

This approach provides both styled visual presentation and screen reader compatibility while preserving semantic document structure.

= Should I use the inline format or the block? =

* **Use Inline Format** when applying features to complete words or phrases in existing heading blocks
* **Use OpenType Stylist Block** when you need letter-by-letter styling, complex typography, or maximum accessibility control

The plugin will warn you if an inline selection might cause accessibility issues.

= What file formats are supported for font uploads? =

The plugin accepts ZIP files containing:
- CSS files with @font-face declarations
- Font files: WOFF, WOFF2, TTF, OTF, EOT, SVG

= Is font upload secure? =

Yes! The plugin implements multiple security measures:
- File type validation
- ZIP extraction security
- Path traversal protection
- CSS sanitization
- 10MB size limit for uploads
- Secure storage with .htaccess protection

= Is this compatible with page builders? =

This plugin is designed for the WordPress block editor (Gutenberg). Compatibility with page builders depends on their implementation of rich text formatting.

= Will this slow down my site? =

The plugin uses CSS font-feature-settings which is hardware-accelerated in modern browsers. Performance impact depends on font file sizes and loading strategy. The plugin includes JavaScript in the block editor but uses only CSS for frontend rendering.

= Can I apply features to body text? =

Currently, the plugin focuses on heading blocks (H1-H6). Support for other blocks may be added in future versions.

= How do I know which features my font supports? =

Check your font's documentation, or use the plugin to experiment. Features that aren't supported simply won't affect the text.

== Screenshots ==

1. Admin settings - Presets tab showing OpenType feature demonstrations with live preview
2. Admin settings - Custom Fonts tab for uploading webfont kits, Adobe Fonts integration, and custom font definitions
3. Admin settings - Font Features tab displaying all available OpenType features organized by category
4. Admin settings - Accessibility tab with screen reader support options and best practices
5. Admin settings - Help tab with usage instructions and recommended fonts
6. Block editor showing multiple OpenType Stylist blocks with advanced typography applied
7. Block editor with OpenType Stylist block selected (same as screenshot 6 - shows block in use)
8. Block editor with settings sidebar (same as screenshot 6 - demonstrates inspector controls)

== Changelog ==

= 1.0.0 =
* OpenType Stylist block with ARIA markup and semantic HTML
* Smart selection validation warns when partial word selections could fragment text
* Conversion tool from inline formats to accessible block structure
* Configurable aria-label support for inline formatted text
* Screen reader class options (visually-hidden, sr-only, or custom classes)
* Accessibility documentation
* Upload custom font kits from MyFonts, Fontspring, and other webfont providers
* Adobe Fonts (Typekit) integration via embed code
* Define fonts loaded through themes, plugins, or CDN services
* Font fallback system
* Secure font file storage with .htaccess protection
* Font preview system with size controls
* OpenType feature support: ligatures (liga, dlig, calt)
* Stylistic sets (ss01-ss20)
* Swashes (swsh, cswh) and alternates (salt, titl, ornm)
* Quick-apply presets for common typography styles
* Custom preset creation and saving
* Inline text selection in the block editor
* Live preview before applying changes
* Popover interface with features organized by category
* Spanish (es_ES) and French (fr_FR) translations
* Native CSS font-feature-settings
* WordPress block editor (Gutenberg) API integration
* REST API for plugin features
* JSX/React architecture for the custom block
* WordPress @wordpress/scripts build toolchain
* Transient caching
* Rate-limited REST API endpoints (50 requests/minute per user)

== Upgrade Notice ==

= 1.0.0 =
Initial release of OpenType Stylist with accessibility features, font management, and OpenType typography controls.

== Technical Details ==

= Browser Support =

* Chrome/Edge: Full support
* Firefox: Full support
* Safari: Full support
* Internet Explorer 10+: Partial support

= Performance =

Features are applied using CSS font-feature-settings, which is hardware-accelerated in modern browsers. The plugin includes JavaScript in the block editor but uses only CSS for frontend rendering.

= Data Storage =

Typography features are stored as inline styles and data attributes within post content. No additional database tables are created.

= Extensibility =

Developers can extend the plugin using WordPress hooks and filters. REST API endpoints are available at `/wp-json/ots/v1/`.

= Font Management =

The plugin provides three ways to add custom fonts:

**Upload Webfont Kits:**
Upload complete webfont kits (ZIP files) from MyFonts, Fontspring, or other providers. The plugin extracts fonts, processes CSS, and stores files securely in your WordPress uploads directory.

**Adobe Fonts Integration:**
Connect Adobe Fonts (Typekit) projects by pasting the embed code. Fonts load directly from Adobe's servers.

**Custom Font Definitions:**
Define fonts that are already loaded through your theme, plugins, or CDN (like Google Fonts). Simply provide the font family name and optional fallbacks. No files are uploaded to WordPress—fonts continue loading from their original source.

All three methods make fonts available in the block editor and preview selector.

== Credits ==

Developed by Matthew Cowan.

Special thanks to type designers who create fonts with OpenType features.
