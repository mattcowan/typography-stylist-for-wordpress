=== Typography Stylist ===
Contributors: matthewneilcowan
Tags: typography, opentype, variable fonts, ligatures, glyphs
Requires at least: 5.8
Tested up to: 7.1
Stable tag: 2.3.1
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A Glyphs Panel, paragraph styles, and OpenType and variable font controls for the block editor. Expressive typography that stays accessible.

== Description ==

Some of your fonts' best work is hidden.

Professional fonts often contain swashes, stylistic sets, ligatures, and alternate characters. Unfortunately, using these features often resorts to manually inserting characters with inline spans, which is tedious, error-prone, and can cause issues with accessibility. Typography Stylist opens the full font cabinet, adding controls for these advanced features to the block editor with accessibility in mind, making it easy to use all the typographic features your fonts offer.

If you set type in professional design tools, you know what these fonts can do. Typography Stylist brings that control to WordPress. You decide how your type looks, down to a single character. Pick the alternate you want for one letter, set a variable font to weight 435, and save the result as a paragraph style for the rest of the site, which you can later update everywhere at once. Typography Stylist also manages your fonts: upload webfont kits, connect Adobe Fonts, or use fonts from the WordPress Font Library.

= Glyphs Panel =

The Glyphs Panel shows every character in a font, like the Glyphs panel in Adobe Illustrator.

* Search by character, by codepoint (`U+XXXX`), or by glyph name.
* Filter by stylistic set, by OpenType feature, or by Unicode block.
* Select a letter in your text to see all of its alternates. Click an alternate to put it in place of the letter.
* Click any glyph to insert it into your text.
* Move through the grid with the keyboard. Screen readers announce each glyph.

The panel reads the font in your browser, and it reads only the font's metadata. It does not extract glyph outlines, and it does not store font data on your server.

= Paragraph Styles =

A paragraph style is a named set of typography settings, like a paragraph style in Adobe InDesign. Save a style one time, then apply it to text in any heading, paragraph, or Typography Stylist block.

* A style holds the font, weight, italic, size, letter spacing, line height, OpenType features, and variable font axes. Fit-to-width sizes can also go into a style.
* "Browse styles…" shows each style in its own typeface, with your selected words as the sample text. You can search the list, and group it by font family, by size type, or by recent use.
* Each style is one CSS class. Change a style and click "Update Style", and all text that uses the style changes.
* If the selected text already has its own settings, the editor asks before the style replaces them.
* "Detach Style" changes styled text back to independent settings.
* Rename and delete styles on the Paragraph Styles tab in Settings → Typography Stylist.

= Granular typography control =

Set the typography of a whole block, or of one word or one letter in it.

* **OpenType features:** ligatures, swashes, stylistic sets ss01 to ss20, small capitals, figure styles, and more. The full list is below.
* **Variable fonts:** the plugin reads the axes from the font file, and each axis gets a slider. You can set a weight of 435, not only 400 or 700. Custom axes also get sliders.
* **Size:** a fixed size, a responsive size (a CSS `clamp()` between a minimum and a maximum), or fit-to-width.
* **Fit-to-width:** each line of a Typography Stylist block fills the width of the block, as on a poster or a wedding invitation. In a fitted line, you can make one glyph smaller or move it up or down, and the line still fills the width.
* **Spacing and style:** letter spacing, line height, weight, and italic.

Your site's front end gets CSS only. The plugin adds no JavaScript to your pages.

= Two ways to style text =

1. **In a heading or paragraph block.** Select the text, then click the Typography Stylist button (a swash "T") in the block toolbar. Use this for whole words and phrases.
2. **In a Typography Stylist block.** Use this block for letter-by-letter work. Set the options for the whole block in the sidebar. Select text in the block to change only that text.

Two settings in Settings → Typography Stylist → Options add a Glyphs button and a Paragraph Styles button to the block toolbar. Both settings are off by default.

= Accessibility =

A style on part of a word puts the letters in separate elements. Some screen readers then read the word in pieces, or skip it. The Typography Stylist block prevents this. It writes two copies of your text:

* A plain heading for screen readers. It is hidden from view, and it keeps the document outline correct.
* A styled copy for the screen, with `aria-hidden="true"`.

If you style part of a word in a heading or paragraph block, a notice tells you about the risk. The notice offers a one-click conversion to a Typography Stylist block. Your change applies whether you convert or not. You can turn the notice off in Settings → Typography Stylist → Accessibility.

The editor panels work with the keyboard and with screen readers.

= Fonts =

Use fonts from these sources:

* Webfont kits from MyFonts, Font Squirrel, and other providers. A ZIP with only font files also works. The plugin makes the @font-face CSS for you.
* Adobe Fonts projects.
* Fonts that your theme, another plugin, or a CDN already loads.
* Fonts in the WordPress Font Library (WordPress 6.5+). You can also add your uploaded fonts to the Font Library, and remove them again.

By default, a font loads only on the pages that use it. This includes blog, category, and tag archives. When you delete a font, you can choose a replacement font, and content that used the deleted font shows the replacement.

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

= Recommended Fonts =

The OpenType features work only with fonts that contain them. Many script fonts and professional typefaces do. Some examples:

* Script fonts by Alejandro Paul, such as Inglesa, and Gratitude Script (with the wonderful Kathy Milici)
* Bookmania by Mark Simonson
* Orpheus, designed by Kevin King, Patrick Griffin, and Walter Tiemann, from Canada Type
* Elaina and other fonts by Laura Worthington
* Liza from Underware
* Memoriam by Patrick Griffin
* ITC Avant Garde, designed by André Gürtler, Christian Mengelt, Ed Benguiat, Erich Gschwind, Herb Lubalin, and others, from Monotype

To see which features a font has, read its specimen or open it in the Glyphs Panel.

= Bundled Third-Party Libraries =

The Glyphs Panel reads font files in the browser with two open-source libraries. They are bundled unmodified in `glyphs-panel/assets/js/vendor/`. They load only when you open the Glyphs Panel, and they run in the browser. No font data goes to a server.

* **opentype.js** v1.3.4: reads TTF, OTF, and WOFF font files. MIT License. Source: https://github.com/opentypejs/opentype.js
* **wawoff2**: decompresses WOFF2 font files (a WebAssembly build of Google's woff2). MIT License. Source: https://github.com/fontello/wawoff2

See BUILD.txt for build and source details.

= Source, Docs & Support =

* **Source code and issue tracker:** [github.com/mattcowan/typography-stylist-for-wordpress](https://github.com/mattcowan/typography-stylist-for-wordpress)
* **Developer documentation:** the hooks reference ([HOOKS.md](https://github.com/mattcowan/typography-stylist-for-wordpress/blob/main/HOOKS.md)) is on GitHub.
* **Beta builds:** pre-release versions go to the GitHub Releases page before they go to WordPress.org.
* **Support:** the [WordPress.org support forum](https://wordpress.org/support/plugin/typography-stylist/), or GitHub issues for bugs.

If you like the plugin, [a short review](https://wordpress.org/support/plugin/typography-stylist/reviews/#new-post) helps other type lovers find it.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/typography-stylist`, or install the plugin from the Plugins screen.
2. Activate the plugin on the Plugins screen.
3. Go to Settings → Typography Stylist to add your fonts and set the options.
4. Open a post in the block editor. Select text in a heading, then click the Typography Stylist button in the block toolbar.

== Frequently Asked Questions ==

= Do I need special fonts? =

For OpenType features such as stylistic sets and swashes, the font must contain them. Many professional typefaces do. Many free fonts have few features or none. Letter spacing, line height, size, and weight work with any font. If a font does not have a feature, the feature has no effect.

= Does this work with Google Fonts? =

Yes. Some Google Fonts have OpenType features. Read the font's specimen page to see which ones.

= Can I use my own web fonts? =

Yes. You can add fonts in four ways:

1. **Upload a webfont kit** from MyFonts, Font Squirrel, or another provider on the Custom Fonts tab.
2. **Connect Adobe Fonts** (Typekit). Paste the embed code of your project.
3. **Define a custom font** that your theme, another plugin, or a CDN (such as Google Fonts) loads. The font then shows in the editor's font list.
4. **Use a WordPress Font Library font** (WordPress 6.5+) from the editor's font list.

The plugin can also apply OpenType features to a font that your site already loads, without a selection in the font list. The previews on the settings page work only for fonts that you upload or connect through the plugin.

= How do I upload a font? =

1. Go to Settings → Typography Stylist → Custom Fonts.
2. Click "Choose ZIP File" and select your webfont kit ZIP.
3. Click "Upload Font Kit". The plugin reads the font names from the kit.

Kits from MyFonts and Font Squirrel, and font downloads from Google Fonts, all work. The ZIP does not need a stylesheet. If the ZIP has only font files, the plugin reads each font's metadata and makes the @font-face CSS, with the weight range of a variable font. The server cannot read WOFF2 metadata. For a ZIP with only WOFF2 files, the plugin gets the family and the weight from the file names, and a warning asks you to check them.

The plugin also finds the weights that each font has, and checks only those in "Available Font Weights". You can change the checkboxes at any time.

= How do I add Adobe Fonts? =

1. Go to Settings → Typography Stylist → Custom Fonts.
2. Find the "Adobe Fonts (Typekit)" section.
3. Enter a project name.
4. Paste your Adobe Fonts embed code (the `<script>` tag).
5. Optional: enter the font family names for the preview list.
6. Click "Add Adobe Fonts Project".

Make sure that your domain is authorized in your Adobe Fonts project settings. The fonts load from Adobe's servers.

= How do I use a font that my theme already loads? =

1. Go to Settings → Typography Stylist → Custom Fonts.
2. Find the "Custom Font Definitions" section.
3. Enter a display name for the font.
4. Enter the exact CSS font-family value, for example `'Playfair Display', serif`.
5. Optional: add fallback fonts, with commas between them.
6. Click "Add Custom Font".

The font shows in the block editor's font list. The settings page cannot preview features for it.

= Can I set fallback fonts? =

Yes. For each uploaded font, Adobe font, and custom font definition, you can set fallback fonts. The browser uses them if the main font does not load.

= What happens to my content if I delete a font? =

When you delete a font, you can choose a replacement font. Content that used the deleted font then shows the replacement. You can manage these replacements on the Replacement Fonts tab. Use this when you change fonts for a rebrand.

= How do paragraph styles work? =

1. Set the typography of some text in either editor.
2. Click "Save Current Settings as Style" and give the style a name.
3. To use the style, select other text. In a heading or paragraph, click "Browse styles…" and pick the style. In a Typography Stylist block, pick the style from the Paragraph Style list.

To change a style everywhere, change the settings on text that uses it and click "Update Style". The style browser shows 24 styles at a time. Click "Show more" to see the next 24.

= Is this plugin accessible? =

Yes. See the Accessibility section in the description for the two-copy pattern and the word-boundary notice. Settings → Typography Stylist → Accessibility has these options:

* **Inline Format: Add aria-label Attributes:** add an `aria-label` to text that you style in a heading or paragraph block.
* **Disable Word Boundary Warning:** turn off the notice about styles on part of a word.

Each Typography Stylist block also has an Accessibility panel in its sidebar. There, choose the class that hides the plain heading: `visually-hidden`, `sr-only`, or your own class.

= Does the hidden heading cause a duplicate content problem for SEO? =

No. Google's spam policies name "text that's only accessible to screen readers and is intended to improve the experience for those using screen readers" as hidden text that does not break their rules. The hidden heading and the styled copy contain the same text.

= Should I style text in a heading block or use the Typography Stylist block? =

* Use a **heading or paragraph block** to style whole words or phrases.
* Use a **Typography Stylist block** for letter-by-letter work, fit-to-width lines, or the most control over accessibility.

= What file types can I upload? =

A ZIP file that contains:

* Font files: WOFF, WOFF2, TTF, OTF, or EOT.
* Optional: a CSS file with @font-face rules. The plugin uses it as it is.

= Is font upload secure? =

The upload has these protections:

* File type validation
* Safe ZIP extraction, with protection against path traversal
* CSS sanitization
* A 10 MB size limit
* Storage in a directory with `.htaccess` protection

= Does this work with page builders? =

The plugin is for the WordPress block editor. It works in a page builder only if the page builder uses block editor rich text.

= Will this slow down my site? =

The front end gets CSS only, with no JavaScript. A font loads only on the pages that use it. Font file size is the main cost, as with any web font. The JavaScript loads only in the block editor.

= How do I know which features my font supports? =

Open the font in the Glyphs Panel. It lists the OpenType features that the font contains, and shows every glyph for each feature. You can also read the font's documentation.

= Do variable fonts work? =

Yes. When you upload a variable font, the plugin reads its axes from the font file: weight, width, slant, optical size, and any custom axis. Each axis gets a slider in both editors, and the output is standard `font-variation-settings` CSS. The server reads TTF and OTF files. For a kit with only WOFF2 files, click "Detect Axes from Font File" in the font's settings to read the axes in your browser, or enter the axes by hand.

= What does "register in the WordPress Font Library" do? =

On WordPress 6.5+, the plugin adds new uploaded fonts to the WordPress Font Library automatically. You can turn this off in Options. To add older fonts, use the Custom Fonts tab, one font at a time or all together. WordPress can then use them like any Library font. In WordPress 7.1, the Font Library is at Appearance → Fonts. In earlier versions, open it from the Site Editor, in Styles → Typography. The font files stay where they are, and your existing content does not change. You can remove a font from the Library again. Adobe Fonts and custom font definitions stay in the plugin, because Adobe fonts load from Adobe's servers.

= Where can I get beta versions or report bugs? =

Beta builds are pre-releases on the [GitHub Releases page](https://github.com/mattcowan/typography-stylist-for-wordpress/releases). Download the attached ZIP and install it from Plugins → Add New → Upload. Report bugs on the [GitHub issue tracker](https://github.com/mattcowan/typography-stylist-for-wordpress/issues) or on the WordPress.org support forum.

== Screenshots ==

1. The Glyphs Panel — browse a font's full character set, filtered here to a stylistic set's script alternates, and insert any glyph with a click
2. The Paragraph Styles browser — each saved style shown in its own typeface, with the selected words as the sample text
3. Inline editor on a heading block — toggling Swashes (swsh) with live preview, applied instantly to the selected text
4. Quick Feature Toggles inside the Typography Stylist block — per-selection controls, here setting a different variable-font weight for one word
5. Typography Stylist block with sidebar controls — a variable font's Weight axis slider replaces the discrete weight dropdown
6. Per-font variable axis configuration — axes detected from the font file, with ranges and WordPress Font Library registration
7. Font Features preview in the admin — every OpenType feature previewed with your own text in the selected font
8. The unified font list — uploaded kits, Adobe Fonts, and WordPress Font Library fonts with Variable and registration badges
9. The block's Accessibility panel — the screen-reader class behind the dual-heading pattern that keeps styled text accessible

== Changelog ==

= 2.3.1 =
* **NEW: the Paragraph Styles tab shows a preview of each style.** Each card shows sample text in the style's own font, weight, spacing and OpenType features, and says when a style's font was deleted and replaced.
* **Improved: the settings page loads only the fonts it shows.** Fonts load only for the open tab, and on the Custom Fonts tab only when a card comes into view. On a test site with 148 fonts, the Custom Fonts tab went from 133 font downloads to 12, and the page HTML from 5.97 MB to 1.84 MB.
* **Improved: the block editor loads only the Adobe Fonts kits that the post uses.** Another kit loads when you use or preview its font. On a test site with 77 kits, opening a post went from 154 kit requests to 9.
* **Improved: a single post or page prints CSS only for the paragraph styles it uses.** Archive pages, the blog page and search results still print every style, so posts that a "load more" button adds keep their styles. The block editor still gets every style.
* **Fixed: translations did not load on WordPress 5.8 to 6.4.** The French and Spanish files had a format error that earlier versions rejected.
* **Fixed: French used the plural form for zero.**
* **Fixed: a fixed font size showed in the editor but not on the page.** The Typography Stylist block now saves the size. For a block saved before this fix, edit any block in the post and save the post.
* **Fixed: the weight checkboxes came back for variable fonts** after you saved, added or deleted a font, and **the settings page printed its data two times.**
* Developers: the new `typost_force_enqueue_paragraph_style_ids` filter prints the CSS and loads the fonts of the styles you name on every page. See HOOKS.md.
* Full details are in changelog.txt.

= 2.3.0 =
* **NEW: Paragraph Styles are built in.** Save the current typography as a named style and apply it anywhere. Styled text renders through a shared CSS class, so "Update Style" changes every use at once. Fit-to-width blocks save as styles too.
* **NEW: a visual style browser.** "Browse styles…" in the inline editor (and an optional block toolbar button) shows every style rendered in its own typeface, with your selected words as the sample. Search, group by font family, size mode or recently used, and move through the list with the keyboard.
* **NEW: optional Glyphs and Paragraph Styles buttons in the block toolbar, and a choice of what Enter does in a Typography Stylist block.** All three settings are in Options. The toolbar buttons are off by default, and Enter keeps its line-break behavior until you change it.
* **Improved: the settings page updates in place.** Uploading, adding, editing, deleting and registering fonts, and every settings form, no longer reload the page. Buttons keep keyboard focus while a request runs.
* **Improved: the font menus are searchable.** Type any part of a font name to narrow the list, in the sidebar, the Quick Feature Toggles and the inline editor.
* **Improved: screen-reader and keyboard use of the editor panels.** Dialog names are read first, every control is named, the panels have fewer Tab stops, focus stays inside an open panel, and contrast meets WCAG AA.
* **Fixed: styled text kept the wrong weight or font.** A feature toggle no longer makes a bold heading light; text styled only by the theme keeps its weight; a Font Library font that is installed but not activated now prints its @font-face; a font installed in the Library appears in the pickers on the next editor load.
* **Fixed: conversion, nesting and sizing in the editors.** "Convert to Typography Stylist Block" keeps the selection's styling on the selection only; the block reports when styling cannot nest deeper; the inline editor warns when responsive sizes are out of order; "Responsive (fluid)" applies at once in the Quick Feature Toggles.
* **Fixed: the Glyphs Panel** swapped or duplicated the wrong glyph, opened on the wrong font for theme-styled text, and refused `U+XXXX` input.
* **Fixed: paragraph styles** dropped italic, went stale after in-session saves, lost to theme heading CSS, and did not load fonts for class-only content.
* Full details are in changelog.txt.

= 2.2.3 =
* **NEW: Relative size and vertical shift for selected text in Fit-to-width blocks.** Select part of a fitted line — a single glyph like the ampersand in "April & Andy" — and scale it down relative to the line's fitted size or nudge it up and down. Because the adjustments are relative, the line still fills the block width exactly at every screen size, and the frontend stays zero-JavaScript. The two new sliders appear in the Quick Feature Toggles when the block uses Fit to width sizing.
* Full details are in changelog.txt.

= 2.2.2 =
* **NEW: Fit-to-width sizing.** A third font-size mode on the Typography Stylist block: each line is sized so its text spans the full block width — the classic wedding-invitation/poster look where a short line renders huge and a long line smaller, all flush to the same width. Editing is fully WYSIWYG: every line renders at its true fitted size while you type and style selections. Lines are measured with their real fonts, features, and letter spacing; the frontend stays zero-JavaScript (CSS container queries), with an optional maximum-size cap and a responsive fallback for older browsers. Existing blocks are untouched.
* **Fixed: variable-font axis sliders in the Quick Feature Toggles now change only the selected text** instead of restyling the whole block (the sidebar sliders intentionally remain block-level), and an axis change no longer leaks into other Typography Stylist blocks on the page. The sliders also now read their starting values from your selection correctly in the iframed editor.
* **Fixed: fonts registered in the WP Font Library keep their webfont on the frontend.** Registered-but-unactivated fonts previously fell back to a local or system font on the frontend while the editor looked correct; the plugin now prints its own @font-face whenever WordPress won't.
* Full details are in changelog.txt.

= 2.2.1 =
* **Fixed: fonts uploaded together in one ZIP no longer share each other's variable-font axes.** Axis detection scanned the whole kit directory, so every family in a multi-font ZIP inherited the axes of whichever file parsed first — Fraunces lost its optical size, SOFT, and WONK sliders when uploaded alongside a weight-only font, and non-variable fonts in the same ZIP gained a phantom weight slider. Detection is now scoped to each family's own font files. Fonts uploaded on their own were never affected.
* **Improved: "Detect Axes from Font File" repairs fonts in place.** Use it on any font whose axes were mis-detected before this fix. It now falls back to reading the font on the server when the browser can't, so it works either way. It also states plainly that it replaces every axis row and discards hand-set values, and asks for confirmation before overwriting axes you have already defined — nothing is stored until you save.
* Changed: variable-font axis sliders now sit directly beneath the weight control in the inline editor and Quick Feature Toggles, matching the block sidebar.
* Full details are in changelog.txt.

= 2.2.0 =
* **NEW: Font Style (visual italic) controls** on all three editing surfaces — block-level, Quick Feature Toggles, and the inline editor. Deliberately style-only: it selects the font's italic face without adding emphasis semantics; the editor's own Italic button remains the way to emphasize text for screen readers.
* **Italic-aware previews and Glyphs Panel** — feature previews render with the italic face when the selection is italic, and the Glyphs Panel now loads and displays the face variant actually rendering at your selection (no toggle; the selection decides). Italic-only glyph sets like EB Garamond's swash italic capitals are finally browsable.
* **Glyphs Panel opens to your selection** — a selected letter pre-fills the alternates view; short combinations ("Th") show their exact ligature alternates.
* **A large editor-robustness batch**: Quick Feature Toggle changes always land on the selected text; mixed-selection edits change only the setting you touched; converting a styled heading to a Typography Stylist block preserves every span; glyph alternates survive font and feature changes; variable-font axis sliders no longer alter untouched axes (and the QFT weight slider works); font changes clear stale axis values; multi-span font changes actually take effect; quote-bearing attribute values survive span splits; the span-nesting limit is enforced everywhere.
* Full details for every fix are in changelog.txt.

= 2.1.2 =
* **Automatic font-weight detection** — newly added fonts (uploaded kits, Adobe Fonts, and Library fonts adopted in the editor) get their "Available Font Weights" pre-set to only the weights they actually ship, instead of all nine being enabled by default. A one-click "Auto-detect weights for existing fonts" button on the Custom Fonts tab covers fonts added before this release. Detection never narrows unless it is confident, and the checkboxes stay fully editable.
* Fixed: variable fonts uploaded as font-only ZIPs now glyph-browse correctly in the Glyphs Panel (the generated `format('truetype-variations')` hint was not recognized by the panel's file picker).

= 2.1.1 =
* Packaging: re-release of the 2.1.0 feature set under a fresh version number. The 2.1.0 tag's downloadable ZIP was cached against stale contents and never delivered the new files (Variable Fonts core integration, font metadata/sources modules, WordPress Font Library integration); 2.1.1 ships them correctly. See the 2.1.0 entry below for the full list of changes included in this release.

= 2.1.0 =
* **WordPress Font Library integration (WP 6.5+)** — register uploaded fonts into the Font Library, per font or in bulk (opt-in and fully reversible), and use Library fonts straight from the editor font pickers. Existing content keeps rendering no matter what.
* **Variable font support** — automatic axis detection on upload, a "Detect Axes from Font File" button, per-font axis configuration, and axis sliders in both editors.
* **Font-only ZIP uploads** — kits containing just font files (e.g. a Google Fonts download) are now accepted; the @font-face stylesheet is generated automatically from the fonts' metadata.
* **New `typost_force_enqueue_font_ids` filter** — themes and extensions can force specific fonts to load on every page.
* Plus many fixes and improvements across the Glyphs Panel, variable fonts, editor font loading, and admin accessibility (including a WCAG color-contrast audit of all admin color schemes) — the complete list is in changelog.txt.

= 2.0.1 =
* Fixed: Mixed-content blocking of locally-hosted fonts in the Glyphs Panel — same-host `http://` font file URLs are now upgraded to `https://` before fetching, so fonts whose stored kit CSS contains absolute insecure URLs load correctly on HTTPS sites (cross-origin URLs are left untouched)

Older releases are documented in changelog.txt (bundled with the plugin) and on the [GitHub Releases page](https://github.com/mattcowan/typography-stylist-for-wordpress/releases).

== Upgrade Notice ==

= 2.3.1 =
The settings page loads only the fonts it shows, and the editor loads only the Adobe Fonts kits a post uses. A single post or page prints only the paragraph style CSS it uses. Adds style previews to the Paragraph Styles tab and fixes translations on WordPress 5.8 to 6.4. No data migration.

= 2.3.0 =
Adds built-in Paragraph Styles with a visual style browser, optional Glyphs and Paragraph Styles toolbar buttons, a no-reload settings page, and a round of screen-reader, keyboard and rendering fixes across both editors. No data migration.

= 2.2.3 =
Adds per-selection relative size and vertical shift inside Fit-to-width blocks — shrink a glyph relative to its fitted line and nudge it up or down, while every line keeps filling the block width exactly.

= 2.2.2 =
Adds fit-to-width sizing (each line fills the block width, zero frontend JS), scopes Quick Feature Toggle axis changes to the selected text, and fixes Font Library-registered fonts falling back to system fonts on the frontend.

= 2.2.1 =
Fixes variable-font axes being mixed up between fonts uploaded in the same ZIP. If a font is showing the wrong axes, open Settings → Typography Stylist → Custom Fonts and use "Detect Axes from Font File" to repair it.

= 2.2.0 =
Font Style (visual italic) controls, italic-aware previews and glyph browsing, and a major editor-reliability batch — selections, conversions, glyph alternates, and variable-font axes all behave predictably now.

= 2.1.2 =
Newly added fonts now enable only the weights they actually ship, with a one-click auto-detect for existing fonts; also fixes Glyphs Panel browsing for variable fonts from font-only ZIPs.

= 2.1.1 =
Re-release of the 2.1.0 feature set with corrected packaging — the 2.1.0 download never contained the new files. Update to get variable fonts, font-only ZIP uploads, and WordPress Font Library integration.

= 2.1.0 =
Font kit uploads now accept ZIPs containing only font files (e.g. Google Fonts downloads) — the @font-face stylesheet is generated automatically from the fonts' metadata. Adds WordPress Font Library integration (register uploaded fonts, adopt Library fonts in the editor), variable font support, and a `typost_force_enqueue_font_ids` filter for theme-driven font loading. Also fixes Adobe/custom/Library fonts not rendering inside the iframed block editor canvas. Existing content and settings are preserved.

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
