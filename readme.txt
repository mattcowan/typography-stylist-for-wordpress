=== Typography Stylist ===
Contributors: matthewneilcowan
Tags: typography, opentype, variable fonts, ligatures, glyphs
Requires at least: 5.8
Tested up to: 6.9
Stable tag: 2.1.1
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

An Illustrator-style Glyphs Panel, OpenType features, and variable font controls in the block editor. Expressive typography that stays accessible.

== Description ==

Some of your fonts' best work is hidden. Swashes, stylistic sets, discretionary ligatures, alternate characters: features a type designer spent months drawing are locked away where WordPress never shows them. Typography Stylist opens the full type cabinet, right inside the block editor, without giving up accessibility or SEO.

Typography Stylist is not just a font-loading plugin (although it does that too). it sits a layer above. Font managers and the WordPress Font Library get font files onto your site; Typography Stylist is about what you do with them once they are there: browsing every glyph a face contains, turning on the OpenType features that make it sing, tuning variable font axes, and doing it all with live preview on your actual content.

= The Glyphs Panel =

An Illustrator-style glyph browser, built in. Explore every character and OpenType feature a font contains; search by character, codepoint, or glyph name; filter by stylistic set, OpenType feature, or Unicode block; and insert any glyph,including feature alternates, directly into your content with a click. The grid is fully keyboard-navigable and screen-reader announced, and fonts are parsed in your browser for metadata only, so font EULAs stay respected: no outlines are extracted, nothing font-derived is stored on your server.

= Variable Fonts =

Full control over variable font axes (v2.1+):

* **Automatic axis detection** — upload a variable font and its axes (tag, name, min/max/default ranges) are read straight from the font file. A "Detect Axes from Font File" button re-reads them any time, right in your browser, and works for uploaded kits, Adobe Fonts, and custom font definitions.
* **Named and custom axes** — Weight (wght), Width (wdth), Slant (slnt), Optical Size (opsz), and Italic (ital) are recognized by name, and any custom axis a font defines gets its own control.
* **Axis sliders in the editor** — smooth per-axis sliders in both the inline editor and the Typography Stylist block output clean `font-variation-settings` CSS. When a font has a weight axis, the slider replaces the discrete weight dropdown, so you pick 435, not "400 or 700."
* **Per-font configuration** — review and adjust each font's axes and ranges from the Custom Fonts tab; variable fonts are badged in the font list with their axes.

= Font management & WordPress Font Library =

Manage every font source from one screen: upload webfont kits (MyFonts, Font Squirrel, or bare font-file ZIPs — the stylesheet is generated for you), connect Adobe Fonts projects, define fonts your theme or CDN already loads, and use WordPress Font Library fonts directly from the editor's font picker. Uploaded fonts can be registered into the WordPress Font Library (WP 6.5+) with one click — reversibly, and without ever breaking existing content. Fonts load intelligently, only on pages that use them.

= Expressive type that stays accessible =

Complex inline typography usually comes at a cost: the span elements needed to style individual characters can make screen readers read words in fragments or skip them entirely. Typography Stylist is built around not paying that cost. The custom Typography Stylist block uses a dual-heading pattern — a clean semantic heading for assistive technology, a styled version for visual display — so the document outline and screen-reader experience stay intact no matter how elaborate the visual type gets. When you style partial words in standard heading blocks, the plugin detects the risk and offers a one-click conversion to the accessible block (the warning adapts when conversion isn't possible, and can be disabled in Settings → Typography Stylist → Accessibility).

= Key Features =

* **Glyphs Panel**: Browse a font's complete character set Illustrator-style — search, filter by feature or stylistic set, and insert any glyph or alternate straight into your content.
* **Variable Font Axis Controls**: Automatic axis detection plus per-axis sliders in the editor, producing clean font-variation-settings CSS.
* **WordPress Font Library Integration** (WP 6.5+): Register uploaded fonts into the Font Library with one click, and use Library fonts from the editor's font picker.
* **Custom Typography Stylist Block**: Create complex typography with maximum accessibility using the dedicated block. Screen readers can "stumble" over complex inline formatting required to display specific ligatures and alternates. This block preserves the document outline while providing styled text for visual users.
* **Inline Text Selection**: Highlight any text within richtext blocks like headings, and apply typography features instantly with live preview. If your selection breaks a word boundary, a non-blocking notice explains the accessibility impact and offers a one-click conversion to the Custom Typography Stylist Block. The notice can be disabled in Settings → Accessibility.
* **Live Preview**: Preview changes in real-time before applying.
* **Rich Feature Support**: Ligatures (liga, dlig, calt), Stylistic Sets (ss01-ss20), Swashes, Alternates, and more.
* **Visual Interface**: User-friendly, resizable, moveable popover with organized feature categories.
* **Advanced Typography Controls**: Adjust letter spacing, font weight, responsive font sizes, and more.
* **Block Editor Native**: Seamlessly integrates with Gutenberg.
* **Custom Fonts Management**: Upload webfont kits from MyFonts, Font Squirrel, or other providers, connect Adobe Fonts, or define custom fonts loaded through themes or CDNs. Fonts are loaded intelligently only on the pages you need them for optimum performance.
* **Font Fallbacks**: Facing a rebranding and needing to change fonts? No worries. Delete a font previously defined, and use the fallback system to seamlessly replace them.
* **Font Preview**: Test OpenType features with any uploaded font in the settings > admin page to find exactly the styles you need.
* **ARIA Label Support**: Optional aria-label attributes for screen reader compatibility for rich text blocks with inline formatting
* **Automatic Archive Detection**: Custom fonts load automatically on blog archives, category pages, and tag pages without requiring manual configuration

= Supported OpenType Features =

**Ligatures:**
* Standard Ligatures (liga)
* Discretionary Ligatures (dlig)
* Contextual Alternates (calt)
* Contextual Ligatures (clig)
* Historical Ligatures (hlig)

**Stylistic Sets:**
* ss01 through ss20

**Swashes & Alternates:**
* Swashes (swsh)
* Contextual Swashes (cswh)
* Stylistic Alternates (salt)
* Titling (titl)
* Historical Forms (hist)

**Decorative:**
* Ornaments (ornm)

**Numerals & Figures:**
* Proportional Figures (pnum)
* Tabular Figures (tnum)
* Lining Figures (lnum)
* Oldstyle Figures (onum)
* Fractions (frac)
* Slashed Zero (zero)

**Capitals & Case:**
* Small Capitals (smcp)
* Capitals to Small Caps (c2sc)
* Petite Capitals (pcap)
* Case-Sensitive Forms (case)

**Positional Forms:**
* Initial Forms (init)
* Medial Forms (medi)
* Terminal Forms (fina)
* Isolated Forms (isol)

**Superscript & Ordinals:**
* Superscript (sups)
* Subscript (subs)
* Ordinals (ordn)

**Other Features:**
* Kerning (kern)
* Localized Forms (locl)
* Randomize (rand)

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
* Script fonts by Alejandro Paul like Inglesa, Gratitude Script (with the wonderful Kathy Milici)
* Bookmania by Mark Simonson
* Orpheus, designed by Kevin King, Patrick Griffin, and Walter Tiemann, from Canada Type
* Elaina and other fonts by Laura Worthington
* Liza from Underware
* Memoriam by Patrick Griffin
* ITC Avant Garde designed by André Gürtler, Christian Mengelt, Ed Benguiat, Erich Gschwind, Herb Lubalin, and others. From Monotype
* Many other typefaces

Check the font's documentation or specimen to verify which OpenType features are supported. Not all fonts have alternates or other advanced features.

= How It Works For Headings =

1. Create or edit a heading block (H1-H6)
2. Type your headline text
3. Select the text you want to style
4. Click the "Typography Stylist" button in the toolbar (a swashy "T" icon)
5. Toggle features and adjust controls — changes apply instantly to your selected text, with live preview (press Ctrl+Z to undo)
6. If your selection breaks a word boundary, a non-blocking notice appears with a one-click option to convert to the Typography Stylist Block for maximum accessibility (the conversion option is hidden when the block can't be converted, e.g. inside a locked pattern). The notice can be disabled in Settings → Typography Stylist → Accessibility.

= How It Works For Custom Blocks =

1. Create or edit a Typography Stylist block
2. Type your text
3. Apply any global block settings in the sidebar
4. Select any text you want to style
5. Click the "Typography Stylist" button in the toolbar (a swashy "T" icon)
6. Select individual features and see the live preview

= Bundled Third-Party Libraries =

The Glyphs Panel reads font files in the browser using two open-source libraries, bundled unmodified in `glyphs-panel/assets/js/vendor/`. They are loaded on demand (only when you open the Glyphs Panel) and run entirely client-side; no font data is sent to any server.

* **opentype.js** v1.3.4 — parses TTF/OTF/WOFF font files. MIT License. Source: https://github.com/opentypejs/opentype.js
* **wawoff2** — decompresses WOFF2 font files (Emscripten/WebAssembly build of Google's woff2). MIT License. Source: https://github.com/fontello/wawoff2

See BUILD.txt for build and source details.

= Source, Docs & Support =

* **Source code & issue tracker:** [github.com/mattcowan/typography-stylist-for-wordpress](https://github.com/mattcowan/typography-stylist-for-wordpress)
* **Developer documentation:** the full extension/hooks reference ([HOOKS.md](https://github.com/mattcowan/typography-stylist-for-wordpress/blob/main/HOOKS.md)) lives on GitHub
* **Beta builds:** pre-release versions are published on the GitHub Releases page before they reach WordPress.org
* **Support:** the [WordPress.org support forum](https://wordpress.org/support/plugin/typography-stylist/), or GitHub issues for bugs

Enjoying the plugin? [A short review](https://wordpress.org/support/plugin/typography-stylist/reviews/#new-post) helps other type lovers find it.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/typography-stylist`, or install through the WordPress plugins screen
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Go to Settings → Typography Stylist to view available features and presets
4. Start using the typography features in the block editor!

== Frequently Asked Questions ==

= Do I need special fonts? =

For features like stylistic sets, this plugin requires fonts that support OpenType features. Most premium script fonts and many professional typefaces include these features. Free fonts may have limited support. Letter-spacing, line-height, and other non-opentype features will work with any font.

= Will this work with any font? =

The plugin will work with any font, but you'll only see results for stylistic sets or ligatures if the font includes the OpenType features you're trying to use. Check your font's documentation for supported features.

= Does this work with Google Fonts? =

Some Google Fonts support OpenType features. Check the individual font's specimen page for feature support.

= Can I use this with custom web fonts? =

Absolutely! There are three ways to make fonts available in the plugin:

1. **Upload webfont kits** from MyFonts, Font Squirrel, or other providers using the plugin's Custom Fonts tab
2. **Connect Adobe Fonts** (Typekit) by pasting your project's embed code
3. **Define custom fonts** loaded through your theme, plugins, or CDN (like Google Fonts) so they appear in the editor's font dropdown

Beyond these, the plugin can apply OpenType features to any font already loaded on your site (for example via @font-face in your theme) even without selecting it from the plugin's dropdown. Previews in the admin settings page only work for fonts uploaded or connected through the plugin.

= How do I upload custom fonts? =

1. Go to Settings → Typography Stylist → Custom Fonts tab
2. Click "Choose ZIP File" and select your webfont kit ZIP
3. Click "Upload Font Kit" — font names are read from the kit itself

The plugin will extract the fonts and make them available in the editor and preview selector. This has been tested with kits from MyFonts and Font Squirrel, and with bare-font downloads from Google Fonts.

A stylesheet inside the ZIP is not required: if the kit contains only font files, the plugin reads each font's built-in metadata and generates the @font-face CSS automatically — including the weight range of variable fonts. For WOFF2-only ZIPs the family and weight are detected from the filenames (WOFF2 metadata cannot be read on the server), and a warning asks you to review the result.

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

* **Inline Format Notices**: For rich text blocks like headings, the plugin detects when you select partial words (which can fragment text for screen readers) and shows a non-blocking notice with a one-click option to convert to an accessible Typography Stylist block. When the block cannot be converted (e.g., inside a locked pattern), the conversion option is hidden automatically. The notice can be disabled entirely via the "Disable Word Boundary Warning" option in Settings → Typography Stylist → Accessibility.
* **Typography Stylist Block**: Custom block designed for complex typography that includes markup with screen reader-accessible text
* **ARIA Label Support**: Optional setting to add aria-label attributes to inline formatted text (Settings → Typography Stylist → Accessibility)
* **Screen Reader Classes**: the Typography Stylist block uses configurable classes (visually-hidden, sr-only, or custom) to hide styled text from screen readers while providing clean text as an alternative
* **Dual Content Approach**: The block provides duplicate content - one version styled for visual users, one clean version for assistive technology

= How do the accessibility features for the block work? =

The Typography Stylist block creates two versions of your text:

1. **For screen readers**: Clean, unformatted text in a semantic heading element (H1-H6) with the `visually-hidden` class applied. This maintains the document outline and heading navigation for assistive technology users.
2. **For visual display**: Styled text with `aria-hidden="true"` to prevent screen readers from reading fragmented content with complex OpenType features.

This approach provides both styled visual presentation and screen reader compatibility while preserving semantic document structure.

= Will the alternate text presented to screen readers cause duplicate content issues for SEO? =
Google explicitly recognizes hidden text for accessibility as legitimate (not cloaking/spam). The content is identical in both headings, signaling genuine accessibility use. This dual-heading pattern is a well-known accessibility technique.

= Should I use the inline format or the block? =

* **Use Inline Format** when applying features to complete words or phrases in existing heading blocks
* **Use Typography Stylist Block** when you need letter-by-letter styling, complex typography, or maximum accessibility control

If an inline selection might cause accessibility issues, a non-blocking notice suggests converting to the block — your changes still apply either way. The notice can be disabled entirely in Settings → Accessibility.

= What file formats are supported for font uploads? =

The plugin accepts ZIP files containing:
- CSS files with @font-face declarations (recommended, used as-is)
- Font files: WOFF, WOFF2, TTF, OTF, EOT

A CSS file is optional — ZIPs with only font files work too; the stylesheet is generated from the fonts' metadata.

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

Check your font's documentation, or use the plugin to experiment. Features that aren't supported simply won't affect the text. The Glyphs Panel shows exactly which OpenType features a font contains — and every glyph behind them.

= Do variable fonts work? =

Yes. When you upload a variable font, its axes (weight, width, slant, optical size, or any custom axis) are detected automatically from the font file. Each axis gets a slider in the editor — in both the inline editor and the Typography Stylist block — and the output is standard `font-variation-settings` CSS. Axis detection reads TTF/OTF files at upload time; for WOFF2-only kits, use the "Detect Axes from Font File" button in the font's settings (which handles WOFF2 in the browser) or define axes manually.

= What does registering a font in the WordPress Font Library do? =

On WordPress 6.5+, uploaded font kits can be registered into the WordPress Font Library (Appearance → Editor), individually or in bulk, from the Custom Fonts tab. Registered fonts become available to the site editor like any Library font, WordPress serves their files (no double-loading), and the plugin's font variables keep pointing at them — so existing content never breaks. Registration is optional and fully reversible. Adobe Fonts and custom font definitions stay plugin-managed by design (Adobe fonts load from Adobe's servers and may not be self-hosted).

= Where can I get beta versions or report bugs? =

Beta builds are published as pre-releases on the plugin's [GitHub Releases page](https://github.com/mattcowan/typography-stylist-for-wordpress/releases) — download the attached zip and install it via Plugins → Add New → Upload. Bugs are welcome on the [GitHub issue tracker](https://github.com/mattcowan/typography-stylist-for-wordpress/issues) or the WordPress.org support forum.

== Screenshots ==

1. The Glyphs Panel — browse a font's full character set, filtered here to a stylistic set's script alternates, and insert any glyph with a click
2. Inline editor on a heading block — toggling Swashes (swsh) with live preview, applied instantly to the selected text
3. Quick Feature Toggles inside the Typography Stylist block — per-selection controls, here setting a different variable-font weight for one word
4. Typography Stylist block with sidebar controls — a variable font's Weight axis slider replaces the discrete weight dropdown
5. Per-font variable axis configuration — axes detected from the font file, with ranges and WordPress Font Library registration
6. Font Features preview in the admin — every OpenType feature previewed with your own text in the selected font
7. The unified font list — uploaded kits, Adobe Fonts, and WordPress Font Library fonts with Variable and registration badges
8. The block's Accessibility panel — the screen-reader class behind the dual-heading pattern that keeps styled text accessible

== Changelog ==

= 2.1.1 =
* Packaging: re-release of the 2.1.0 feature set under a fresh version number. The 2.1.0 tag's downloadable ZIP was cached against stale contents and never delivered the new files (Variable Fonts core integration, font metadata/sources modules, WordPress Font Library integration); 2.1.1 ships them correctly. See the 2.1.0 entry below for the full list of changes included in this release.

= 2.1.0 =

* Removed: the required "Font Kit Name" field from the Upload Font Kit form. The name was stored but never displayed anywhere — font cards show the family names read from the kit. The REST endpoint still accepts an optional `name` and defaults to the ZIP filename, so API callers keep working.

* **NEW: WordPress Font Library integration (WP 6.5+).** Uploaded webfont kits can now be registered in the WordPress Font Library (Appearance → Editor): newly uploaded fonts register automatically (toggle in Options), and existing fonts can be registered per font or in bulk from the Custom Fonts tab — registration is opt-in and fully reversible. Registered fonts keep their numeric IDs: the plugin's `--font-N` CSS variables alias to WordPress's `--wp--preset--font-family--{slug}` presets with a literal fallback, so all existing content, inline spans, and extension integrations keep rendering forever, even if a font is later removed from the Library. WordPress serves the font files for registered fonts (no double-loading). Adobe Fonts and custom font definitions remain plugin-managed by design (Adobe fonts load from Adobe's servers and may not be self-hosted).
* **NEW: WordPress Font Library fonts in the editor font pickers.** Both the inline editor and the Typography Stylist block now offer Library fonts (theme fonts and fonts installed via Appearance → Editor) in a dedicated picker group. Picking one adopts it seamlessly — it gets a numeric font ID like every other source, so the save format and all extensions work unchanged.
* **NEW: Variable Fonts built into core.** The "Typography Stylist - Variable Fonts" extension is now bundled (like the Glyphs Panel in 2.0): automatic axis detection on upload, per-axis admin configuration, and axis sliders in the editor. If you were using the standalone extension plugin, deactivate it after updating — your settings carry over automatically.
* **NEW: `typost_force_enqueue_font_ids` filter** — themes and extensions can force specific fonts to load on every page (for fonts referenced only from theme CSS, invisible to the content scan).
* Improved: extension data saves on the font edit form no longer race the page reload (`typost:font-saved` now provides a `waitUntil()` collector).
* Fixed: the per-page font CSS cache key now includes the used font IDs, so pages using different fonts can no longer share stale cached CSS.
* Fixed: font CSS variables now load inside the iframed block editor canvas (WP 6.3+) even when no uploaded webfont kits exist — Adobe Fonts, custom font definitions, and Font Library fonts previously fell back to the system font in the editor while rendering correctly on the frontend.
* Improved: the Glyphs Panel now distinguishes missing or failed parsing-library loads from genuinely unreadable fonts, shows honest error messages with technical detail, and offers a "Try again" button that retries without reloading the page.
* **NEW: "Detect Axes from Font File" button** — each font's Variable Font settings can now read the axis definitions (tag, name, min/max/default) straight from the font binary in your browser, instead of typing them by hand. Works for uploaded kits, Adobe Fonts, and custom font definitions, including WOFF2 files that upload-time detection can't parse. Detected axes fill the form for review; nothing is stored until you save.
* Improved: variable fonts without a weight (`wght`) axis no longer show the standard Font Weight dropdown in the editors — the variable axis sliders take its place (matching the per-font "Hide weight selection" admin setting, which previously only affected the admin form).
* Fixed: the "Variable Font Axes" section in the inline editor pop-up now has the same left/right padding as the other sections.
* Developer: the `typost_weight_control` JS filter recognizes a new `'hidden'` return value (suppress the weight control entirely), and the `typost_qft_after_font_controls` hook state now includes `inlineFontFamilyAtSelection` — see HOOKS.md.
* Fixed: extension panels rendered into font-dependent hook points (e.g. the Variable Font axis sliders) no longer go stale when the font is changed — the hook containers now remount with fresh state on font switch instead of keeping the previous font's controls.
* Improved: Variable Font quick-select buttons for custom axes now snap to round values (200, 400, 600 instead of 201, 401, 601) and are capped at 7 buttons so they fit on a single row; near-duplicate values next to the axis default are no longer generated.
* Added: variable font axes are now detected automatically when fonts are added — both webfont kit ZIP uploads and Adobe Fonts kits. Each family in a kit is checked individually, so kits mixing variable and static fonts work correctly; static families are simply left untouched.
* Fixed: axis detection (and glyph loading) for Adobe Fonts kits containing multiple families could resolve the wrong family's font file — per-family entries store a single family name, which the font loader now honors.
* Developer: new `typost:fonts-added` jQuery admin event fires after a kit upload or Adobe Fonts add, with the new entries and a `waitUntil()` collector so extensions can post-process fonts before the page reloads — see HOOKS.md.
* Fixed: a variable font with a weight (wght) axis but "Hide weight selection" unchecked showed the weight slider until the first edit, then inconsistently swapped to the weight dropdown. The unchecked setting now consistently keeps the standard weight dropdown (the wght slider is skipped); other variable axes still show in their own panel.
* Changed: "Hide weight selection" now defaults to checked for every variable font — when a weight (wght) axis exists the slider replaces the weight dropdown, and without one the weight is fixed by the font file, so the discrete weight UI is hidden either way. An explicit admin toggle still wins. Previously the auto rule only hid weights for variable fonts without a wght axis, leaving the redundant weight controls visible for exactly the fonts that least need them.
* Changed: bumped the Variable Fonts (1.2.1) and Glyphs Panel (1.1.2) module version constants so browsers pick up the updated module scripts (these files ship unminified and are cache-busted only by those constants).
* Accessibility: the Variable Fonts axis Tag and Name inputs on the settings page now have accessible labels (fixes 10 "missing form label" WAVE errors).
* Accessibility: color-contrast audit of all admin color schemes. Alice Blue's primary and muted-text colors were darkened to meet WCAG AA 4.5:1 on every panel background (feature code badges, size values, descriptions, visibility labels); the Dark scheme's badge text and danger color were corrected; High Contrast's danger red was darkened; and the Admin Colors scheme now automatically darkens colors derived from the WordPress admin palette until they meet 4.5:1.
* Accessibility: fixed heading hierarchy on the settings page — font card names are now h3 (previously h4 directly under the tab's h2).
* Changed: the read-only Variable Fonts admin tab was removed. Variable fonts are now marked with a "Variable" pill on their font cards (hover it to see the configured axis tags), alongside the existing source badges — the same information, in context. Axes are still managed in each font's edit form.
* Developer: new `typost_font_card_badges` PHP filter lets extensions append badges to font card headers on the Custom Fonts tab — see HOOKS.md.
* Improved: WP Font Library cards now render the font name in its own typeface (when font files are registered; @font-face CSS is printed via wp_print_font_faces on WP 6.4+), and the font-family code chip no longer touches the "Manage in Editor" button. The chip also follows the admin color scheme instead of hardcoded grays.
* Changed: the Quick Feature Toggles popover now shows the same two-line usage tips notice as the inline popover (drag-to-reposition + instant-apply/undo) and shares its dismissal — closing the notice in either popover hides it in both, remembered per browser.
* Changed: the "i" icon tooltips in the block sidebar and inline popover were replaced with plain help text (matching the line-height controls) or removed. The Font Family tip claiming "fonts only load on pages where they are used" was removed as inaccurate for WordPress Font Library fonts, which WordPress loads site-wide; the Font Size clamp() explanation now appears as help text when Responsive mode is selected; the OpenType overview is now a regular note at the top of the features panel.
* Removed: the required "Project Name" field from the Add Adobe Fonts Project form — since kits create one entry per family (named by the family), the project name was stored but never displayed anywhere.
* Fixed: the Glyphs button in the inline Typography Stylist popover now aligns with the section headings instead of sitting flush against the popover edge.
* Changed: the collapsible Tips list at the bottom of the inline popover was removed; its one non-obvious tip ("Changes apply instantly, press Ctrl+Z to undo") joined the drag-to-reposition tip in the notice at the top of the panel. The notice is now dismissible, and the dismissal is remembered per browser. The other tips duplicated information available elsewhere.
* Fixed: when a kit contains several variable fonts, the automatic axis detection could silently lose the first font's result — the per-font saves ran concurrently against a REST endpoint that does a read-modify-write on a shared option, so the earliest write was overwritten by the others. Axis saves are now serialized, so every detected font's axes persist.
* Developer: new block attribute `animationConfigId` + inline `data-animation-id` attribute as integration points for the upcoming Animations extension; font subsystem partially extracted into `includes/` modules (public extension API unchanged).

= 2.0.1 =
* Fixed: Mixed-content blocking of locally-hosted fonts in the Glyphs Panel — same-host `http://` font file URLs are now upgraded to `https://` before fetching, so fonts whose stored kit CSS contains absolute insecure URLs load correctly on HTTPS sites (cross-origin URLs are left untouched)

Older releases are documented in changelog.txt (bundled with the plugin) and on the [GitHub Releases page](https://github.com/mattcowan/typography-stylist-for-wordpress/releases).

== Upgrade Notice ==

= 2.1.1 =
Re-release of the 2.1.0 feature set with corrected packaging — the 2.1.0 download never contained the new files. Update to get variable fonts, font-only ZIP uploads, and WordPress Font Library integration.

= 2.1.0 =
Font kit uploads now accept ZIPs containing only font files (e.g. Google Fonts downloads) — the @font-face stylesheet is generated automatically from the fonts' metadata. Adds WordPress Font Library integration (register uploaded fonts, adopt Library fonts in the editor), bundles the Variable Fonts extension into core, and adds a `typost_force_enqueue_font_ids` filter for theme-driven font loading. Also fixes Adobe/custom/Library fonts not rendering inside the iframed block editor canvas. Existing content and settings are preserved; if you ran the standalone Variable Fonts extension, deactivate it after updating.

= 2.0.1 =
Fixes mixed-content blocking of locally-hosted fonts in the Glyphs Panel on HTTPS sites.

== Technical Details ==

= Data Storage =

Typography features are stored as inline styles and data attributes within post content. No additional database tables are created.

= Extensibility =

Developers can extend the plugin using WordPress hooks and filters — see [HOOKS.md on GitHub](https://github.com/mattcowan/typography-stylist-for-wordpress/blob/main/HOOKS.md) for the full reference with examples. REST API endpoints are available at `/wp-json/typost/v1/`.

= Source Code =

This plugin includes both compiled/minified files and their source code to meet WordPress security and transparency requirements.

**Minified/Compiled Files:**
* assets/js/*.min.js files have corresponding source files in assets/js/
* assets/css/*.min.css files have corresponding source files in assets/css/
* blocks/typography-stylist/build/ files are compiled from blocks/typography-stylist/ source files

== Credits ==

Developed by Matthew Cowan.

Special thanks to my wife for her support and inspiration, and to my dog, Sugar, for taking long walks with me between adding features.
