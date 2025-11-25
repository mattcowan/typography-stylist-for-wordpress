=== OpenType Stylist ===
Contributors: yourname
Tags: typography, opentype, ligatures, stylistic-sets, fonts
Requires at least: 5.8
Tested up to: 6.8
Stable tag: 1.0.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add advanced OpenType features (ligatures, stylistic sets, swashes) to headlines with inline text selection and live preview.

== Description ==

OpenType Stylist brings professional typography control to WordPress headlines. Perfect for designers working with premium script fonts from foundries like Sudtipos (Alejandro Paul's Calgary Script, Affair, etc.), this plugin allows you to apply OpenType features directly in the block editor.

= Key Features =

* **Inline Text Selection**: Highlight any text within headings and apply typography features
* **Live Preview**: See changes in real-time before applying
* **Rich Feature Support**: Ligatures (liga, dlig, calt), Stylistic Sets (ss01-ss20), Swashes, Alternates, and more
* **Quick Presets**: Pre-configured combinations for common styles (Elegant Script, Wedding Style, etc.)
* **Custom Presets**: Save your favorite feature combinations for reuse
* **Visual Interface**: User-friendly popover with organized feature categories
* **Block Editor Native**: Seamlessly integrates with Gutenberg

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

This plugin works best with fonts that support OpenType features:

* **Calgary Script** by Alejandro Paul
* **Affair** by Alejandro Paul
* **Adios Script** by Alejandro Paul
* **Parfumerie Script** by Alejandro Paul
* Any font with OpenType feature support

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

Absolutely! Load your fonts using @font-face in your theme or use a font plugin, then apply features with this plugin.

= Is this compatible with page builders? =

This plugin is designed for the WordPress block editor (Gutenberg). Compatibility with page builders depends on their implementation of rich text formatting.

= Will this slow down my site? =

No. The plugin uses CSS font-feature-settings which is a native browser capability. There's no JavaScript on the frontend.

= Can I apply features to body text? =

Currently, the plugin focuses on heading blocks (H1-H6). Support for other blocks may be added in future versions.

= How do I know which features my font supports? =

Check your font's documentation, or use the plugin to experiment. Features that aren't supported simply won't affect the text.

== Screenshots ==

1. Typography Features popover with preset selection
2. Individual feature toggles organized by category
3. Live preview of applied features
4. Admin settings page with preset management
5. Example of script font with and without features

== Changelog ==

= 1.0.0 =
* Initial release
* Support for ligatures, stylistic sets, swashes, and alternates
* Quick presets for common typography styles
* Live preview functionality
* REST API for preset management
* Admin settings page

== Upgrade Notice ==

= 1.0.0 =
Initial release of OpenType Stylist.

== Technical Details ==

= Browser Support =

* Chrome/Edge: Full support
* Firefox: Full support
* Safari: Full support
* Internet Explorer 10+: Partial support

= Performance =

Features are applied using CSS font-feature-settings, which is hardware-accelerated in modern browsers. No JavaScript runs on the frontend.

= Data Storage =

Typography features are stored as inline styles and data attributes within post content. No additional database tables are created.

= Extensibility =

Developers can extend the plugin using WordPress hooks and filters. REST API endpoints are available at `/wp-json/hls/v1/`.

== Credits ==

Developed with ❤️ for typography enthusiasts.

Special thanks to type designers like Alejandro Paul whose beautiful fonts inspire better web typography.
