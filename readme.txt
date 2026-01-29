=== Typography Stylist ===
Contributors: matthewneilcowan
Tags: typography, opentype, ligatures, stylistic-sets, webfonts
Requires at least: 5.8
Tested up to: 6.9
Stable tag: 1.1.6
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Unlock hidden OpenType features like ligatures, swashes, and stylistic sets in the WordPress block editor with advanced typography controls.

== Description ==

Typography Stylist provides advanced typography controls for WordPress. This plugin allows you to apply OpenType features directly in the block editor, and set properties like letter spacing, font-weight, and more. With support for ligatures, stylistic sets, swashes, and alternates, you can create elegant headlines and premium typography effects with ease. Accessibility features ensure that your styled text remains readable by screen readers.

= Key Features =

* **Custom Typography Stylist Block**: Create complex typography with maximum accessibility using the dedicated block. Screen readers can "stumble" over complex inline formatting required to display specific ligatures and alternates. This block preserves the document outline while providing styled text for visual users.
* **Inline Text Selection**: Highlight any text within richtext blocks, and apply basic typography features quickly. A warning will pop-up if your selection may cause accessibility issues, and you can quickly convert to the Custom Typography Stylist Block for maximum accessibility.
* **Live Preview**: Preview changes in real-time before applying.
* **Rich Feature Support**: Ligatures (liga, dlig, calt), Stylistic Sets (ss01-ss20), Swashes, Alternates, and more.
* **Visual Interface**: User-friendly popover with organized feature categories.
* **Advanced Typography Controls**: Adjust letter spacing, font weight, responsive font sizes, and more.
* **Block Editor Native**: Seamlessly integrates with Gutenberg.
* **Custom Fonts Management**: Upload webfont kits from MyFonts, Fontspring, or other providers, connect Adobe Fonts, or define custom fonts loaded through themes or CDNs. Fonts are loaded intelligently only on the pages you need them for optimum performance.
* **Font Fallbacks**: Facing a rebranding and needing to change fonts? No worries. Delete a font previously defined, and use the fallback system to seamlessly replace them.
* **Font Preview**: Test OpenType features with any uploaded font in the settings > admin page to find exactly the styles you need.
* **Accessibility Features**: Screen reader support with ARIA markup and a heading structure that maintains proper semantics for both screen reader and visual views
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
* Bookmania by Mark Simonson
* Alana and other fonts by Laura Worthington
* Professional typefaces with OpenType support

Check the font's documentation or specimen to verify which OpenType features are supported. Not all fonts have alternates or other advanced features.

= How It Works For Headlines =

1. Create or edit a heading block (H1-H6)
2. Type your headline text
3. Select the text you want to style
4. Click the "Typography Features" button in the toolbar (a swashy "T" icon)
5. Select individual features
6. See the live preview at the bottom of the popover
7. If using partial word selections, heed any accessibility warnings to convert to the Typography Stylist Block for maximum accessibility
8. Click Apply

= How It Works For Custom Blocks =

1. Create or edit a Typography Stylist block
2. Type your text
3. Apply any global block settings in the sidebar
4. Select any text you want to style
5. Click the "Typography Features" button in the toolbar (a swashy "T" icon)
6. Select individual features and see the live preview

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/opentype-stylist`, or install through the WordPress plugins screen
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Go to Settings → Headline Typography to view available features and presets
4. Start using the typography features in the block editor!

== Frequently Asked Questions ==

= Do I need special fonts? =

Yes, this plugin requires fonts that support OpenType features. Most premium script fonts and many professional typefaces include these features. Free fonts may have limited support.

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

The plugin can apply OpenType features to any font loaded on your site, but previews in the admin settings page will only work for fonts uploaded or connected through the plugin.

= How do I upload custom fonts? =

1. Go to Settings → Typography Stylist → Custom Fonts tab
2. Enter a name for your font kit
3. Click "Choose ZIP File" and select your webfont kit ZIP
4. Click "Upload Font Kit"

The plugin will extract the fonts and make them available in the editor and preview selector. This has been tested with kits from MyFonts and Font Squirrel.

= How do I add Adobe Fonts? =

1. Go to Settings → Typography Stylist → Custom Fonts tab
2. Scroll to "Adobe Fonts (Typekit)" section
3. Enter a project name
4. Paste your Adobe Fonts embed code (the <script> tag)
5. Optionally enter font family names for the preview selector
6. Click "Add Adobe Fonts Project"

Make sure your domain is authorized in your Adobe Fonts project settings, if applicable. The fonts will load directly from Adobe's servers.

= How do I define custom fonts from my theme? =

If you have fonts already loaded through your theme, another plugin, or a CDN:

1. Go to Settings → Typography Stylist → Custom Fonts tab
2. Scroll to "Custom Font Definitions" section
3. Enter a display name for the font
4. Enter the exact CSS font-family value (e.g., 'Playfair Display', serif)
5. Optionally add fallback fonts separated by commas
6. Click "Add Custom Font"

The font will be available in the block editor font selector, although features will not be available for preview on the admin settings page.

= Can I set fallback fonts? =

Yes! For any font source (uploaded, Adobe Fonts, or custom definitions), you can specify fallback fonts. These will be used if the primary font fails to load. Fallbacks are automatically included in the CSS font-family declaration.

= Is this plugin accessible? =

The plugin includes accessibility features for screen reader compatibility:

* **Inline Format Warnings**: Detects when you select partial words (which can fragment text for screen readers) and shows a warning with options to convert to an accessible block or apply anyway
* **Typography Stylist Block**: Custom block designed for complex typography that includes ARIA markup with screen reader-accessible text
* **ARIA Label Support**: Optional setting to add aria-label attributes to inline formatted text (Settings → Typography Stylist → Accessibility)
* **Screen Reader Classes**: the Typography Stylist block uses configurable classes (visually-hidden, sr-only, or custom) to hide styled text from screen readers while providing clean text
* **Dual Content Approach**: The block provides duplicate content - one version styled for visual users, one clean version for assistive technology

= How do the accessibility features for the block work? =

the Typography Stylist block creates two versions of your text:

1. **For screen readers**: Clean, unformatted text in a semantic heading element (H1-H6) with the `visually-hidden` class applied. This maintains the document outline and heading navigation for assistive technology users.
2. **For visual display**: Styled text with `aria-hidden="true"` to prevent screen readers from reading fragmented content with complex OpenType features.

This approach provides both styled visual presentation and screen reader compatibility while preserving semantic document structure.

= Should I use the inline format or the block? =

* **Use Inline Format** when applying features to complete words or phrases in existing heading blocks
* **Use Typography Stylist Block** when you need letter-by-letter styling, complex typography, or maximum accessibility control

The plugin will warn you if an inline selection might cause accessibility issues.

= What file formats are supported for font uploads? =

The plugin accepts ZIP files containing:
- CSS files with @font-face declarations
- Font files: WOFF, WOFF2, TTF, OTF

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

= How do I know which features my font supports? =

Check your font's documentation, or use the plugin to experiment. Features that aren't supported simply won't affect the text.

== Screenshots ==

1. Custom Fonts Control Panel (Admin Settings Page)
2. Font Feature Preview (Admin Settings Page)
3. Typography Stylist panel, available on headings and other rich text blocks by clicking the swashy "T" icon in the toolbar
4. Typography Stylist Block with global controls in the sidebar
5. Typography Stylist Block with Quick Feature Toggle open to apply stylistic sets and other features

== Changelog ==

= 1.1.6 =
* Improved: Standardized control order across all interfaces for better consistency
* Changed: Reordered controls to: Font Family → Font Weight → Font Size → Line Height → Letter Spacing → OpenType Features
* Changed: Updated inline editor popover control order to match sidebar and quick toggles
* Changed: Updated Typography Stylist block sidebar inspector controls order
* Changed: Updated Typography Stylist block quick feature toggles popover control order

= 1.1.5 =
* Added: Line-height controls for block-level and inline text styling
* Added: Line-height control in Typography Stylist block inspector panel
* Added: Line-height control in Quick Features Toggle popover for inline selections
* Added: Line-height control in inline editor toolbar for standard heading/paragraph blocks
* Improved: Line-height can be adjusted from 0.5 to 3.0 with 0.1 step increments
* Improved: Responsive font size controls now operate independently without auto-adjusting other values
* Improved: Responsive font size labels now clearly indicate screen sizes (Mobile, Intermediate, Large)
* Improved: Visual warning displayed when responsive font sizes are out of logical order
* Improved: Default responsive font sizes for new blocks changed to 16/32/64 for more dramatic scaling
* Fixed: Confusing slider behavior where adjusting one size would move other sliders
* Developer: Breakpoint values (320px, 1920px) extracted to named constants (RESPONSIVE_FONT_MIN_VIEWPORT, RESPONSIVE_FONT_MAX_VIEWPORT) for future configurability across Typography Stylist block and inline editor

= 1.1.4 =
* Fixed: Mixed content warnings on HTTPS sites when loading custom fonts
* Improved: Font URLs now use relative paths for protocol-agnostic loading
* Improved: Legacy fonts with absolute URLs are automatically converted at render time

= 1.1.3 =
* Initial release approved for public distribution.
* Typography Stylist Block with ARIA markup and semantic HTML
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

= 1.1.4 =
Fixes mixed content warnings on HTTPS sites. Custom fonts now load securely using protocol-agnostic URLs.

= 1.1.3 =
Initial release of Typography Stylist with accessibility features, font management, and OpenType typography controls.

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

Developers can extend the plugin using WordPress hooks and filters. REST API endpoints are available at `/wp-json/typography-stylist/v1/`.

= Font Management =

The plugin provides three ways to add custom fonts:

**Upload Webfont Kits:**
Upload complete webfont kits (ZIP files) from MyFonts, Fontspring, or other providers. The plugin extracts fonts, processes CSS, and stores files securely in your WordPress uploads directory.

**Adobe Fonts Integration:**
Connect Adobe Fonts (Typekit) projects by pasting the embed code. Fonts load directly from Adobe's servers.

**Custom Font Definitions:**
Define fonts that are already loaded through your theme, plugins, or CDN (like Google Fonts). Simply provide the font family name and optional fallbacks. No files are uploaded to WordPress—fonts continue loading from their original source.

All three methods make fonts available in the block editor and preview selector.

= Source Code =

This plugin includes both compiled/minified files and their source code to meet WordPress security and transparency requirements.

**Minified/Compiled Files:**
* assets/js/*.min.js files have corresponding source files in assets/js/
* assets/css/*.min.css files have corresponding source files in assets/css/
* blocks/typography-stylist/build/ files are compiled from blocks/typography-stylist/ source files

== Credits ==

Developed by Matthew Cowan.

Special thanks to my wife for her support and inspiration, and to my dog, Sugar, for taking long walks with me between adding features.
