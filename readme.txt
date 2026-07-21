=== Typography Stylist ===
Contributors: matthewneilcowan
Tags: typography, opentype, fonts, ligatures, glyphs
Requires at least: 5.8
Tested up to: 6.9.4
Stable tag: 2.1.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Unlock OpenType features like ligatures, swashes, and stylistic sets in the WordPress block editor with a glyphs panel and typography controls.

== Description ==

Typography Stylist provides advanced typography controls for WordPress, including a glyphs panel! This plugin allows you to apply OpenType features directly in the block editor, and access glyphs and ligatures hidden within fonts. Additionally, set properties like letter spacing, line-height, responsive sizing, font-weight, and more in the editor, so you can get exactly the look you want from your typefaces. 

Manage fonts from the settings page, either by uploading webfont kits or adding Adobe Typekit embeds. Fonts load intelligently only when they are used.  With support for ligatures, stylistic sets, swashes, and alternates, you can create elegant headlines and premium typography effects with ease. 

Accessibility features ensure that your styled text remains readable by screen readers and assistive technologies: breaking up strings of text with the inline span elements necessary to apply complex features can cause screen readers to read words in fragments or skip them entirely. The plugin includes a custom Typography Stylist block that provides a clean, unbroken set of text to maintain screen reader compatibility while allowing for complex typography to be presented visually. When applying features to partial words in standard heading blocks, the plugin detects potential accessibility issues and provides a warning with options to convert to the Typography Stylist block for maximum accessibility, or to apply the features anyway. When the block cannot be converted (e.g., inside a locked pattern), the conversion option is hidden and the warning adjusts accordingly. The warning can be disabled entirely in Settings → Typography Stylist → Accessibility.

= Key Features =

* **Custom Typography Stylist Block**: Create complex typography with maximum accessibility using the dedicated block. Screen readers can "stumble" over complex inline formatting required to display specific ligatures and alternates. This block preserves the document outline while providing styled text for visual users.
* **Inline Text Selection**: Highlight any text within richtext blocks like headings, and apply basic typography features quickly. A warning will pop up if your selection breaks words and causes accessibility issues, with options to convert to the Custom Typography Stylist Block for maximum accessibility or apply anyway. The warning can be disabled in Settings → Accessibility.
* **Live Preview**: Preview changes in real-time before applying.
* **Rich Feature Support**: Ligatures (liga, dlig, calt), Stylistic Sets (ss01-ss20), Swashes, Alternates, and more.
* **Visual Interface**: User-friendly, resizable, moveable popover with organized feature categories.
* **Advanced Typography Controls**: Adjust letter spacing, font weight, responsive font sizes, and more.
* **Block Editor Native**: Seamlessly integrates with Gutenberg.
* **Custom Fonts Management**: Upload webfont kits from MyFonts, Font Squirrel, or other providers, connect Adobe Fonts, or define custom fonts loaded through themes or CDNs. Fonts are loaded intelligently only on the pages you need them for optimum performance.
* **Font Fallbacks**: Facing a rebranding and needing to change fonts? No worries. Delete a font previously defined, and use the fallback system to seamlessly replace them.
* **Font Preview**: Test OpenType features with any uploaded font in the settings > admin page to find exactly the styles you need.
* **Accessibility Features**: Screen reader support with ARIA markup and a heading structure that maintains proper semantics for both screen reader and visual views
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
4. Click the "Typography Features" button in the toolbar (a swashy "T" icon)
5. Select individual features
6. See the live preview at the bottom of the popover
7. If using partial word selections, you'll see an accessibility warning with options to convert to the Typography Stylist Block for maximum accessibility, or apply the features anyway. If the block cannot be converted (e.g., inside a locked pattern), only the "Apply Anyway" option is shown. This warning can be disabled in Settings → Typography Stylist → Accessibility.
8. Click Apply

= How It Works For Custom Blocks =

1. Create or edit a Typography Stylist block
2. Type your text
3. Apply any global block settings in the sidebar
4. Select any text you want to style
5. Click the "Typography Features" button in the toolbar (a swashy "T" icon)
6. Select individual features and see the live preview

= Bundled Third-Party Libraries =

The Glyphs Panel reads font files in the browser using two open-source libraries, bundled unmodified in `glyphs-panel/assets/js/vendor/`. They are loaded on demand (only when you open the Glyphs Panel) and run entirely client-side; no font data is sent to any server.

* **opentype.js** v1.3.4 — parses TTF/OTF/WOFF font files. MIT License. Source: https://github.com/opentypejs/opentype.js
* **wawoff2** — decompresses WOFF2 font files (Emscripten/WebAssembly build of Google's woff2). MIT License. Source: https://github.com/fontello/wawoff2

See BUILD.txt for build and source details.

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

* **Inline Format Warnings**: For rich text blocks like headings, the plugin detects when you select partial words (which can fragment text for screen readers) and shows a warning with options to convert to an accessible Typography Stylist block, apply anyway, or discard changes. When the block cannot be converted (e.g., inside a locked pattern), the conversion option is hidden automatically. This warning can be disabled entirely via the "Disable Word Boundary Warning" option in Settings → Typography Stylist → Accessibility.
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

The plugin will warn you if an inline selection might cause accessibility issues. You can apply anyway or disable the warning entirely in Settings → Accessibility.

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

= 2.1.0 =
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
* Developer: new block attribute `animationConfigId` + inline `data-animation-id` attribute as integration points for the upcoming Animations extension; font subsystem partially extracted into `includes/` modules (public extension API unchanged).

= 2.0.1 =
* Fixed: Mixed-content blocking of locally-hosted fonts in the Glyphs Panel — same-host `http://` font file URLs are now upgraded to `https://` before fetching, so fonts whose stored kit CSS contains absolute insecure URLs load correctly on HTTPS sites (cross-origin URLs are left untouched)

= 2.0.0 =
* **NEW: Glyphs Panel (built into core) — the flagship feature of 2.0.** An Illustrator-style full-font glyph browser. Explore every character and OpenType feature in a font; search by character, U+ codepoint, or glyph name; filter by Unicode block, stylistic set, or OpenType feature; and view all alternates for a single character. Click or press Enter to insert any glyph (including indexed feature alternates) directly into your content via a "Glyphs…" button in the inline rich-text toolbar (any heading or paragraph), in the Typography Stylist block's Quick Feature Toggles, or from a dedicated "Glyphs" admin tab (browse + copy to clipboard); closing the panel returns you to the editor popover you launched it from. Accessible by design: the glyph grid is a fully keyboard-navigable ARIA grid (arrow keys, Home/End, Page Up/Down, Enter to insert) with row/column semantics, and insertions and result counts are announced to screen readers — inserted glyphs use the real Unicode character plus CSS font-feature-settings, so assistive technology always reads the underlying text. Works with uploaded webfont kits, Adobe Fonts, custom font definitions, and WordPress Font Library fonts; font files are read in your browser, on demand, for metadata only — no glyph outlines are ever extracted or stored, and nothing font-derived is written to your server, making sure you respect font EULAs.
* **MAJOR CHANGE:** Inline text editor (richtext toolbar button) now uses live preview instead of Apply button paradigm - changes are auto-applied immediately with debouncing (matching the Typography Stylist block UX)
* **NEW: Extensibility hook system** - Comprehensive PHP and JavaScript hooks enabling third-party extensions via standalone WordPress plugins
* **NEW: Admin tab extensibility** - Data-driven admin settings tabs with filter-based registration for extensions to add their own configuration tabs
* **NEW: JavaScript hook system** (`window.typostHooks`) - Lightweight action/filter system for both the inline editor and Typography Stylist block, with container-based hook points for rendering extension UI
* **NEW: Per-font OpenType feature visibility** - Configure which of the 51 OpenType features appear in the editor on a per-font basis; defaults to all features visible for full backward compatibility
* **NEW: Unified font list** - All font sources (uploaded kits, Adobe Fonts, custom definitions, WP Font Library) now appear in a single organized list with color-coded type badges instead of three separate sections
* **NEW: Drag-to-reorder fonts** - Drag fonts up and down the list to control the order they appear in editor dropdowns; order is persisted via the REST API
* **NEW: WordPress Font Library integration** - Fonts registered through the WordPress Font Library (WP 6.5+) now appear in the Custom Fonts admin list as read-only entries with a link to manage them in the Appearance Editor; gracefully absent on older WordPress versions
* **NEW: Font name preview** - Font names in the Custom Fonts admin list now render in their actual typeface using CSS variables, making it easy to identify fonts at a glance
* **NEW: Card width slider** - Adjustable preview card width (280–800px) in the Font Features tab, persisted per-browser via localStorage
* **NEW: Contextual help panels** - Collapsible help panels added to each admin tab (Custom Fonts, Font Features, Options, Accessibility, Replacement Fonts) explaining what each section does and how to use it
* **NEW: Block editor Help & Tips panel** - A collapsible "Help & Tips" inspector panel in the Typography Stylist block explains when to use block vs. inline styling, accessibility features, and font selection guidance
* **NEW: Contextual tooltips** - Info tooltips on key block editor controls (font family, font weight, font size, letter spacing, line height, OpenType features) using WCAG-compliant `<Tooltip>` + `<Button>` pattern; keyboard focusable with screen reader support
* Added: `typost_editor_data` filter for extensions to add data to the block editor
* Added: `typost_editor_assets` action for extensions to enqueue editor scripts
* Added: `typost_admin_tabs` filter for registering custom admin settings tabs
* Added: `typost_admin_localize_data` filter for extensions to add admin page data
* Added: `typost_admin_assets` action for extensions to enqueue admin scripts/styles
* Added: `typost_register_rest_routes` action for extensions to register REST API endpoints
* Added: `typost_available_features` filter for modifying the available OpenType features list
* Added: `typost_presets` filter (replacing legacy `typost_default_presets`) for modifying the combined presets list
* Added: `typost_cache_clear` action for extensions to clear their caches when core clears
* Added: `typost_font_uploaded` and `typost_font_deleted` actions for font lifecycle events
* Added: `typost_admin_tab_content_{id}` and `typost_admin_tab_after_{id}` actions for admin tab content
* Added: 5 inline editor hook points, 4 Quick Feature Toggle hook points, 3 Inspector Controls hook points
* Added: State communication pattern via `typost_current_editor_state` filter and `typost-apply-block-properties` CustomEvent
* Added: HOOKS.md developer documentation with vanilla DOM and React extension examples
* Added: Blueprint specification for the Variable Font Axes extension
* Added: REST endpoints for font feature visibility (`GET/POST /typost/v1/font-feature-visibility/{font_id}`) and font order (`GET/POST /typost/v1/font-order`)
* Added: `filterFeaturesByVisibility()` utility function (exported from utils.js and exposed via `window.typostSharedUtils`) for filtering features based on per-font visibility settings
* Fixed: Editor nonce was incorrectly cached in transient (nonces are session-specific and must always be fresh)
* Fixed: Help tab section headers now use the primary text color instead of the accent color, fixing low contrast in the Alice Blue admin color scheme (WCAG-compliant across all schemes)
* Fixed: REST API namespace in bundled documentation corrected to the canonical `/wp-json/typost/v1/`
* Removed: Apply button from inline editor toolbar
* Removed: "Apply Anyway" and "Discard Changes" buttons from the word boundary accessibility warning workflow — these warning-specific actions are now obsolete because the warning is non-blocking and changes apply immediately via live preview
* Removed: Internal undo system (Undo button) - now relies on native WordPress undo (Ctrl+Z)
* Removed: Redundant preview panel with device toggles - live preview on actual selected text makes it unnecessary
* Removed: Separate Uploaded Fonts, Adobe Fonts, and Custom Font Definitions sections — replaced by unified font list
* Changed: Word boundary accessibility warning is now a persistent, non-blocking informational notice at top of modal instead of blocking application; it remains visible while editing but does not prevent changes and can effectively be dismissed by proceeding with edits or converting to a Typography Stylist block
* Changed: Users can still choose to convert to a Typography Stylist block for improved accessibility when needed, but this is now an optional follow-up action rather than a requirement to proceed
* Changed: Admin settings tabs are now data-driven with priority-based ordering (supports URL deep-linking via `?tab=` parameter)
* Changed: Add Font forms (upload kit, Adobe Fonts, custom definition) are now grouped in a collapsible accordion section beneath the font list
* Changed: Feature visibility is editor-UI-only — already-applied features in saved content continue to render correctly regardless of visibility settings
* Improved: Inline editor now matches Typography Stylist block UX with consistent debounce timings: Features (instant), Sliders (400ms), Dropdowns (300ms), Responsive Font-Size (600ms)
* Improved: User can still manage accessibility settings in Settings → Typography Stylist → Accessibility
* Improved: Font Features tab preview selector now includes WP Font Library fonts (when available) alongside uploaded, Adobe, and custom fonts
* Improved: Feature visibility changes auto-save on toggle with a brief "Saved" confirmation — no Save button needed
* Improved: Per-font feature visibility includes master "Enable All" / "Disable All" controls both on the Font Features tab and inside each font's edit form
* Improved: Glyphs Panel toolbar controls (Alternates, Search, OpenType feature, Unicode block) now show visible labels
* Improved: Glyphs Panel default "All glyphs" view also lists OpenType feature variants (e.g. stylistic alternates) previously reachable only by filtering or typing a character
* Note: Each debounced change creates its own undo step in WordPress undo history - use Ctrl+Z to undo individual changes (more granular than previous single Apply button undo)
* Note: WP Font Library fonts appear in the admin list as read-only; font order and feature visibility settings for WP Library fonts are not yet supported in this release

= 1.2.2 =
* Added: Re-introduced "Apply Anyway" button in the word boundary accessibility warning when applying features to partial words in core blocks, giving users the choice to proceed despite potential screen reader fragmentation
* Added: Smart conversion detection - the "Convert to Typography Stylist Block" button is automatically hidden when conversion is not possible (e.g., inside a locked pattern), with an adjusted warning message
* Added: Safety fallback - if block conversion fails despite the pre-check, features are applied directly with a snackbar notice informing the user
* Added: "Disable Word Boundary Warning" option in Settings → Typography Stylist → Accessibility to skip the partial word warning entirely
* Added: "Manage this setting" link in the warning message that deep-links to the admin accessibility settings page, auto-switching to the Accessibility tab and highlighting the relevant setting
* Fixed: Nonce mismatch in Accessibility and Options settings forms caused "The link you followed has expired" error when saving - the nonce names in wp_nonce_field() and check_admin_referer() did not match

= 1.2.1 =
* Added: Per-font weight restrictions - configure which font weights are available for each font in the admin panel (Settings → Typography Stylist → Custom Fonts). Fonts default to all weights for variable font compatibility
* Added: Single-weight auto-apply - when a font has only one available weight, the weight selector is hidden and the weight is automatically applied
* Added: Weight validation on font change - switching fonts automatically adjusts the weight to the closest available option
* Fixed: CSS variable trailing comma caused fonts without fallbacks to fail loading on both frontend and block editor (e.g. `--font-20: "EsmeraldaPro", ;` produced invalid CSS)
* Fixed: Line breaks (Shift+Enter) in Typography Stylist blocks caused words to run together in screen reader text (e.g. "MILANOCORTINA" instead of "MILANO CORTINA")
* Fixed: Inline editor modal lost font selection state on close/reopen - selecting a font, closing the modal without applying, then reopening and clicking Apply would silently fail because stale state caused the apply logic to enter the wrong code path
* Fixed: Missing data-lineheight attribute in format type registration - line-height values were silently dropped when reading back existing formatted content
* Improved: Apply notice in the inline editor now includes a "Convert to a Typography Stylist block" link, guiding users toward the block type that supports real-time preview
* Changed: "Cancel" button renamed to "Discard Changes" in accessibility warning for clearer intent
* Changed: "Edit Fallbacks" button renamed to "Edit Settings" in admin font management to reflect expanded functionality
* Improved: OpenType feature previews now show cumulative checked features - toggling a stylistic set updates ALL preview windows to include that feature, accurately showing how features combine (essential for fonts like Bookmania where stylistic sets interact to produce different glyphs)

= 1.2.0 =
* Fixed: Inline styles applied to wrong character when content contains line breaks (Shift+Enter) - styling the "M" on a second line would incorrectly style the "I" instead, off by one character per line break
* Fixed: TreeWalker document context bug - TreeWalkers are now created from the correct document object (DOMParser), preventing cross-context errors
* Fixed: Responsive font-size Reset button now removes all related attributes (data-fontsize-min, data-fontsize-preferred, data-fontsize-max) instead of leaving orphaned attributes
* Fixed: Memory leak in debounced auto-apply functions - cleanup handlers now properly cancel pending debounced calls on component unmount
* Fixed: Preview span removal now preserves nested elements instead of flattening to text, maintaining complex formatting structure
* Fixed: Stale closure bug in auto-apply functions - debounced wrappers now call latest version of apply functions via refs, resolving issue where controls wouldn't work when styles were already applied
* Improved: Quick Features Toggle auto-apply - letter spacing, line height, font family, font weight, and font size now apply automatically with debouncing (400ms for sliders, 300ms for dropdowns, 600ms for responsive font-size)
* Improved: Consistent UX across all Quick Features controls - all controls now auto-apply like OpenType features, no more confusion about which controls need Apply buttons
* Improved: Clear/Reset buttons now actually remove properties from content instead of just resetting state - clicking Reset removes the data attribute and CSS property from spans
* Improved: UI reorganization - Active Features section moved above feature panels for better visibility
* Added: Individual Reset buttons for font family, font weight, and font size with undo icons for clear visual feedback
* Added: `buildTextOffsetMap()` utility that accounts for `<br>` elements in character offset calculations, matching WordPress RichText's offset system
* Added: `getEffectiveTextLength()` utility for accurate text length measurement including line breaks
* Added: `debounce()` utility function with cancel method for performance optimization during rapid slider adjustments
* Added: `removePropertyFromSpan()` utility to remove specific properties and unwrap empty spans
* Added: `removePropertyFromSelection()` utility to find and remove properties from all spans in selection
* Added: Comprehensive test suite with 24 tests for property removal utilities, including edge cases for responsive font-size
* Improved: All 12 TreeWalker-based offset calculations across the inline editor, Typography Stylist block, and shared utilities now correctly handle multi-line content
* Technical: Extracted `classifyAtomicNode()` helper within `splitSpanAndApply` to reduce code duplication in segment classification logic
* Technical: Debounced functions use refs to avoid stale closures and maintain access to current state across renders

= 1.1.9 =
* Fixed: Archive page font loading - fonts now load correctly and more consistently on blog home, category pages, tag pages, and all archive types
* Fixed: WordPress hook timing issue - font detection now runs on `template_redirect` hook (after main query) instead of `wp_enqueue_scripts` (before query) for archive pages
* Added: Manual cache clear button in Settings → Typography Stylist → Options tab for troubleshooting font loading issues
* Added: Admin setting to control archive page full content checking (enabled by default)
* Improved: Singular pages (posts, pages) continue using optimized detection path without changes
* Improved: Cache clearing when options are changed to ensure settings take effect immediately
* Improved: Font detection caches now automatically clear when posts or pages are saved, so typography changes appear on the frontend immediately
* Updated: Filter `typost_check_full_content_on_archives` now defaults to true (was false)
* Technical: Font detection results cached in instance variables to avoid redundant queries
* Note: Existing sites will automatically benefit from improved archive page font loading

= 1.1.8 =
* Improved: Windows Narrator focus enhancement - screen reader accessible headings now display a visible focus outline that corresponds to the full styled headline area, making it easier to identify which heading is being read

= 1.1.7 =
* Improved: Screen reader elements maintain full-size dimensions while remaining invisible, using modern clip-path technique with backwards compatibility for legacy browsers
* Added: High contrast mode support for Windows users with enhanced outline visibility (4px outline with system Highlight color)
* Added: Dark mode support with adjusted outline colors for better visibility on dark backgrounds
* Added: pointer-events management to prevent invisible overlay from blocking interactions with styled text when not focused


= 1.1.6 =
* Improved: Standardized control order across all interfaces for better consistency. Reordered controls to: Font Family → Font Weight → Font Size → Line Height → Letter Spacing → OpenType Features.
* Fixed: Font size persistence bug where changes wouldn't persist after closing Quick Features Toggle popover
* Fixed: All inline controls (font weight, font family, font size, letter spacing, line height) now correctly apply only to selected text instead of entire block (sporadic errors before)
* Fixed: Sequential feature application bug where applying multiple inline features would incorrectly affect entire block
* Fixed: State management issue where inline control values wouldn't reset after successful apply
* Fixed: Inline fonts (applied via Quick Feature Toggles) now load correctly on frontend
* Fixed: Font detection now properly extracts inline fonts from Typography Stylist block content HTML
* Fixed: Quick Feature Toggle preview now displays in correct inline font instead of block-level font
* Fixed: OpenType features now apply only to selected text, not entire span when selecting partial text within existing styled spans
* Fixed: Font-feature-settings CSS now preserved when applying other inline styles (line-height, letter-spacing) to text with existing OpenType features
* Fixed: Nested span handling - applying features to partial selections within styled text now creates proper nested or split spans instead of merging incorrectly
* Fixed: Block-level fonts no longer incorrectly included in unrelated inline operations
* Fixed: Line-height and letter-spacing controls no longer pass incorrect empty data-features attributes that interfered with attribute preservation
* Improved: Inline fonts now use CSS variable system (var(--font-ID)) matching block-level architecture for consistent font loading and replacement
* Improved: Enhanced attribute preservation system to prevent style conflicts during sequential inline edits while properly handling font-family overrides
* Improved: Added comprehensive validation and fallback mechanisms for all inline text styling functions
* Improved: Inline state variables now reset after successful apply to prevent UI/content desync
* Improved: Font override logic - applying new inline font to text with existing font now properly replaces old font instead of preserving it
* Added: parseInlineFontFamilyAtCursor() utility for detecting inline fonts at cursor position
* Added: Memoized inline font detection for improved preview performance
* Developer: extract_fonts_from_blocks() enhanced to parse inline HTML content for data-font-id attributes

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

= 2.1.0 =
Adds WordPress Font Library integration (register uploaded fonts, adopt Library fonts in the editor), bundles the Variable Fonts extension into core, and adds a `typost_force_enqueue_font_ids` filter for theme-driven font loading. Also fixes Adobe/custom/Library fonts not rendering inside the iframed block editor canvas. Existing content and settings are preserved; if you ran the standalone Variable Fonts extension, deactivate it after updating.

= 2.0.1 =
Fixes mixed-content blocking of locally-hosted fonts in the Glyphs Panel on HTTPS sites.

= 2.0.0 =
Major release: the Glyphs Panel — a full-font glyph browser — is now built into the core plugin, available in both editors and a new Glyphs admin tab. Also adds an extensibility hook system, live preview in the inline editor, and unified font management. Existing content and settings are preserved.

= 1.1.4 =
Fixes mixed content warnings on HTTPS sites. Custom fonts now load securely using protocol-agnostic URLs.

= 1.1.3 =
Initial release of Typography Stylist with accessibility features, font management, and OpenType typography controls.

== Technical Details ==

= Data Storage =

Typography features are stored as inline styles and data attributes within post content. No additional database tables are created.

= Extensibility =

Developers can extend the plugin using WordPress hooks and filters (see HOOKS.md). REST API endpoints are available at `/wp-json/typost/v1/`.

= Source Code =

This plugin includes both compiled/minified files and their source code to meet WordPress security and transparency requirements.

**Minified/Compiled Files:**
* assets/js/*.min.js files have corresponding source files in assets/js/
* assets/css/*.min.css files have corresponding source files in assets/css/
* blocks/typography-stylist/build/ files are compiled from blocks/typography-stylist/ source files

== Credits ==

Developed by Matthew Cowan.

Special thanks to my wife for her support and inspiration, and to my dog, Sugar, for taking long walks with me between adding features.
