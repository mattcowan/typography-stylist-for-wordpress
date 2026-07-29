# Typography Stylist

[![CI](https://github.com/mattcowan/typography-stylist-for-wordpress/actions/workflows/ci.yml/badge.svg)](https://github.com/mattcowan/typography-stylist-for-wordpress/actions/workflows/ci.yml)

A WordPress plugin that adds advanced OpenType typography features to headlines with inline text selection and live preview in the Gutenberg block editor — including an Illustrator-style Glyphs Panel and variable font axis controls.

- **Install it:** [WordPress.org plugin directory](https://wordpress.org/plugins/typography-stylist/)
- **Stable & beta downloads:** [GitHub Releases](https://github.com/mattcowan/typography-stylist-for-wordpress/releases) — installable zips are attached to every release; betas are marked as pre-releases and never ship to WordPress.org
- **Extending the plugin:** [HOOKS.md](HOOKS.md) · **Release process:** [RELEASING.md](RELEASING.md)

> Note: the GitHub "Download ZIP" of this repository is **not** an installable plugin — minified assets and the block build are generated at release time. Use a Release zip or WordPress.org, or build from source (see [BUILD.md](BUILD.md)).

## Features

### Typography Control (51 OpenType Features)
- Ligatures: Standard (liga), Discretionary (dlig), Contextual Alternates (calt), Contextual Ligatures (clig), Historical Ligatures (hlig)
- Stylistic Sets: ss01 through ss20
- Swashes & Alternates: Swashes (swsh), Contextual Swashes (cswh), Stylistic Alternates (salt), Titling (titl), Historical Forms (hist)
- Decorative: Ornaments (ornm)
- Numerals & Figures: Proportional (pnum), Tabular (tnum), Lining (lnum), Oldstyle (onum), Fractions (frac), Slashed Zero (zero)
- Capitals & Case: Small Capitals (smcp), Capitals to Small Caps (c2sc), Petite Capitals (pcap), Case-Sensitive Forms (case)
- Positional Forms: Initial (init), Medial (medi), Terminal (fina), Isolated (isol)
- Superscript & Ordinals: Superscript (sups), Subscript (subs), Ordinals (ordn)
- Other: Kerning (kern), Localized Forms (locl), Randomize (rand)

### User Interface
- Inline text selection in the block editor
- Live preview before applying changes
- Organized feature categories
- Visual popover interface

### Glyphs Panel (built in)
- Illustrator-style glyph browser to explore every character and OpenType feature in a font
- Search by character, `U+` codepoint, or glyph name; filter by Unicode block or stylistic set
- Insert glyphs directly into the inline or block editor via the "Glyphs…" button, or browse and copy from the dedicated Glyphs admin tab
- Font data is read in the browser, on demand, for metadata only — no glyph outlines are ever extracted or stored

### Variable Fonts (built in, v2.1+)
- Automatic axis detection on upload (fvar table, TTF/OTF), plus an in-browser "Detect Axes from Font File" button that also handles WOFF2
- Named axes (wght, wdth, slnt, opsz, ital) and arbitrary custom axes with per-font min/max/default ranges
- Per-axis sliders in both the inline editor and the Typography Stylist block, emitting `font-variation-settings`
- When a weight axis exists, the slider replaces the discrete font-weight dropdown

### WordPress Font Library Integration (WP 6.5+)
- Register uploaded font kits into the Font Library per font or in bulk — opt-in, reversible, and existing content never breaks (the plugin's `--font-N` variables alias to WordPress presets with a literal fallback)
- Library fonts appear in the editor font pickers and are adopted seamlessly with a numeric font ID
- WordPress serves the files for registered fonts; no double-loading

### Technical Implementation
- Native CSS font-feature-settings
- Gutenberg block editor integration
- Supports modern browsers with OpenType feature support

### Accessibility Features
- Smart selection notices for partial word selections that can cause screen readers to stumble, with a one-click conversion to an accessible Typography Stylist block. The notice is non-blocking (changes apply via live preview regardless), hides the conversion option when conversion is not possible (e.g., inside a locked pattern), and can be disabled entirely in Settings → Accessibility.
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

#### Option 1: Upload Webfont Kits (MyFonts, Fontspring, Google Fonts, etc.)

1. **Purchase and download** your webfont kit from MyFonts, Fontspring, or another provider — or download a family from Google Fonts
2. **Go to** Settings → Typography Stylist → Custom Fonts tab
3. **Click "Choose ZIP File"** and select your webfont kit ZIP file
4. **Click "Upload Font Kit"** — font names are read from the kit itself
5. The plugin will:
   - Extract the ZIP file
   - Process the CSS and font files
   - Make fonts available in the editor and preview selector
   - Store files securely in your WordPress uploads directory

**What should the ZIP contain:**
- Font files (WOFF, WOFF2, TTF, OTF, EOT)
- Ideally a CSS file with @font-face declarations (e.g., MyWebfontsKit.css), with the directory structure matching the paths in the CSS file
- **A CSS file is not required (v2.1.0+):** ZIPs containing only font files — like a Google Fonts download — are accepted. The stylesheet is generated automatically from the fonts' built-in metadata (family name, weight, italic, and the weight range of variable fonts). For WOFF2-only ZIPs the server cannot read the font metadata, so family and weight are detected from the filenames and a warning asks you to review the result
- **Available weights are detected automatically (v2.1.2+):** each font's "Available Font Weights" checkboxes are pre-set to only the weights its @font-face rules declare, so the editor weight dropdown offers real options from the start. Adjust the checkboxes at any time; fonts added before v2.1.2 can be covered with the "Auto-detect weights for existing fonts" button on the Custom Fonts tab

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
6. **Changes apply instantly** with live preview — use Ctrl+Z (Cmd+Z on Mac) to undo

**Note:** If you select partial words, a non-blocking accessibility notice appears explaining that fragmented spans can affect screen readers, with a one-click option to convert to an accessible Typography Stylist block (recommended). Your changes still apply either way.

When the block cannot be converted (e.g., inside a locked pattern), the conversion option is hidden automatically. The notice includes a "Manage this setting" link to the admin accessibility settings. You can disable it entirely via "Disable Word Boundary Warning" in Settings → Typography Stylist → Accessibility.

#### Method 2: Typography Stylist Block (for complex typography)

1. **Add a Typography Stylist block** from the block inserter
2. **Select the heading level** (H1-H6, P, or DIV) from the toolbar
3. **Type your text** directly in the block
4. **Configure features** in the sidebar Inspector Controls:
   - Font family
   - Font weight
   - Letter spacing
   - Font size (static, responsive/fluid, or fit-to-width per-line sizing)
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
- Registers custom format type: `typost/features`
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
- Non-blocking notice when partial word selections could fragment text, with a one-click conversion to an accessible block
- Smart conversion detection hides the convert option when conversion is not possible (e.g., locked patterns), with a safety fallback that applies features directly if conversion fails
- "Disable Word Boundary Warning" option in Settings → Accessibility to skip the warning entirely
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
- If you frequently apply features to partial words and understand the screen reader implications, disable the word boundary warning in Settings → Accessibility
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

### Version 2.2.1

- **Fixed: fonts uploaded together in one ZIP no longer share each other's variable-font axes.** Every font family extracted from a kit points at the same kit directory, and axis detection scanned that whole directory — so each family was assigned the axes of whichever font file happened to parse first. A ZIP containing EB Garamond (weight axis only) and Fraunces (optical size, SOFT, WONK, weight) gave Fraunces a lone weight slider and hid its custom axes, and gave non-variable fonts in the same ZIP a phantom weight slider in place of their real weight dropdown. Detection is now scoped to the font files each family's own `@font-face` rules reference, with the resolved path confined to the kit directory (kit CSS arrives inside an uploaded ZIP, so it is untrusted input). Fonts uploaded on their own were never affected.
- **Improved: "Detect Axes from Font File" repairs fonts in place.** It now falls back to a server-side re-read when the browser parsing pipeline is unavailable, so it works either way — use it on any font whose axes were mis-detected before this fix. It states up front that it replaces every axis row and discards hand-set axis names, ranges, and defaults, and asks for confirmation before overwriting axes that are already defined. Detecting axes for the first time is still a single click, and nothing is stored until you save.
- **Changed: variable-font axis sliders now sit directly beneath the weight control** in the inline editor and the Quick Feature Toggles, matching the block sidebar. Font Style previously came between them, separating the axis sliders from the weight they extend.

### Version 2.2.0

- **New: Font Style (visual italic) controls** on all three editing surfaces — block-level, Quick Feature Toggles, and the inline editor. Deliberately style-only: it selects the font's italic face without adding emphasis semantics; the editor's own Italic button remains the way to emphasize text for screen readers.
- **Italic-aware previews and Glyphs Panel** — feature previews render with the italic face when the selection is italic, and the Glyphs Panel loads the face variant actually rendering at your selection (no toggle; the selection decides). Italic-only glyph sets like EB Garamond's swash italic capitals are finally browsable.
- **Glyphs Panel opens to your selection** — a selected letter pre-fills the alternates view; short combinations ("Th") show their exact ligature alternates.
- **Fixed: converting a styled heading or paragraph to a Typography Stylist block no longer destroys inline styling.** The convert button rebuilt the block from plain text whenever the selection crossed styled-span boundaries — exactly the selections that surface the convert option — wiping per-letter glyph alternates, swashes, fonts, and weights.
- **A large editor-robustness batch**: Quick Feature Toggle changes always land on the selected text; mixed-selection edits change only the setting you touched; glyph alternates survive font and feature changes; variable-font axis sliders no longer alter untouched axes (and the QFT weight slider works); font changes clear stale axis values; multi-span font changes actually take effect; quote-bearing attribute values survive span splits; the span-nesting limit is enforced everywhere.
- Full details for every fix are in [changelog.txt](changelog.txt).

### Version 2.1.2

- **New: automatic font-weight detection.** Newly uploaded font kits and newly added Adobe Fonts get their "Available Font Weights" checkboxes pre-set to only the weights the font actually ships, instead of all nine weights enabled by default. Uploaded kits derive the weights from their parsed (or generated) @font-face rules; Adobe Fonts from the kit stylesheet, fetched server-side at add time and matched per family; WordPress Font Library fonts adopted from the editor picker derive theirs from the family's font-face declarations. Variable fonts covering the full 100–900 range keep all weights enabled (the weight slider replaces the dropdown anyway). Detection only narrows when confident — a failed stylesheet fetch or unreadable kit leaves all weights enabled — and the checkboxes remain fully editable.
- **New: one-click "Auto-detect weights for existing fonts"** on the Custom Fonts tab. Shown only when fonts predate weight detection and were never manually configured (their entries lack the `available_weights` key); processes uploaded and Adobe fonts in one pass (one stylesheet fetch per Adobe kit) and disappears once every font is covered. Fonts whose stylesheet can't be fetched stay eligible for retry; manual font definitions are skipped — there is no font file to read.
- **Fixed: Glyphs Panel support for variable fonts from font-only ZIPs.** The generated `format('truetype-variations')` hint was not recognized by the panel's file picker; variable-font format hints now normalize to their base format.

### Version 2.1.1

- **Packaging: re-release of the 2.1.0 feature set under a fresh version number.** The 2.1.0 tag's downloadable ZIP on WordPress.org was cached against stale contents and never delivered the new files (Variable Fonts core integration, font metadata/sources modules, WordPress Font Library integration); 2.1.1 ships them correctly. All 2.1.0 changes below are included.

### Version 2.1.0

**Font kit uploads**

- **Fixed: deleting an uploaded font now unregisters it from the WordPress Font Library.** Previously `delete_font_endpoint` removed the plugin entry and font files but left the plugin-created `wp_font_family` post behind — WordPress kept printing @font-face rules pointing at deleted files, and the orphaned Library row made the font look like it survived the delete. The removal is ownership-guarded (`_typost_font_id` meta), so user-created Library families are never touched.
- **Fixed: no more double listing of registered fonts on the Custom Fonts tab.** Fonts the plugin registered in the Font Library appeared twice — as their uploaded card (with the "In WP Library" badge) and again as a read-only "WP Library" row. The Library rows now exclude plugin-registered families via a new `get_wp_font_library_fonts_for_display()` bridge method; validity checks and the editor picker (which already deduped client-side via `pluginRegisteredSlugs`) are unchanged, and orphaned registrations stay visible so they can be cleaned up.
- **Removed: the "Font Kit Name" field from the upload form.** The name was required, auto-filled from the ZIP filename, stored as `kit_name` — and never displayed anywhere (font cards show family names read from the kit). Mirrors the Adobe "Project Name" removal: the REST `name` param is now optional and defaults to the ZIP filename, and `kit_name` is still stored on entries for back-compat.
- **New: font-only ZIPs (no CSS) are now accepted.** Uploading a ZIP that contains just font files — e.g. a Google Fonts download like `SpaceGrotesk[wght].ttf` — no longer fails with "No CSS file found in the font kit". The plugin reads each font's binary metadata (`name`, `OS/2`, `head`, and `fvar` tables, for TTF/OTF and WOFF) and generates the @font-face stylesheet automatically: correct family names, weights, italics, `font-display: swap`, and for variable fonts a `font-weight: min max` range with the matching `format('…-variations')`. Generated kits flow through the existing pipeline unchanged, including variable-font axis auto-detection, the Variable card badge, and the editor weight slider. WOFF2 metadata cannot be read server-side (no Brotli in PHP), so WOFF2-only ZIPs fall back to Google Fonts filename conventions and the upload response carries a "review the generated CSS" warning shown in the admin. Kits whose CSS files contain no @font-face rules (e.g. only a specimen/demo stylesheet) get the same fallback.

**WordPress Font Library integration (WP 6.5+)**

- **Register uploaded fonts in the WordPress Font Library** (Appearance → Editor). New uploads register automatically (toggle in Options); existing fonts register per font or in bulk from the Custom Fonts tab — opt-in and fully reversible. Registered fonts keep their numeric IDs: `--font-N` variables alias to `--wp--preset--font-family--{slug}` presets with a literal fallback, so existing content and extension integrations keep rendering forever. WordPress serves the font files for registered fonts (no double-loading). Adobe Fonts and custom definitions stay plugin-managed by design.
- **Library fonts in the editor pickers** - both editors now offer WordPress Font Library fonts in a dedicated group; picking one adopts it with a numeric font ID, leaving the save format and extensions unchanged.
- **Variable font support** - automatic axis detection on upload, per-font axis configuration, and axis sliders in both editors.
- **`typost_force_enqueue_font_ids` filter** for theme-driven font loading, `waitUntil()` on `typost:font-saved`, a font-CSS cache-key fix, and `animationConfigId`/`data-animation-id` integration points for the upcoming Animations extension.

**Editor and Glyphs Panel fixes**

- **Fixed: fonts not rendering in the iframed editor canvas.** The `--font-N` CSS variables now load inside the block editor canvas iframe (WP 6.3+) even when no uploaded webfont kits exist. Previously the variables were only attached alongside uploaded-kit `@font-face` CSS, so sites using only Adobe Fonts, custom font definitions, or Font Library fonts saw the system font in the editor while the frontend rendered correctly.
- **Fixed: Glyphs Panel vendor libraries missing from git deploys.** `glyphs-panel/assets/js/vendor/` (opentype.js, wawoff2 — both MIT, bundled unmodified) was accidentally excluded from the repository by an unanchored `vendor/` ignore meant for Composer, breaking the Glyphs Panel on git-based deploys with a misleading "font could not be read" error. The libraries are now committed, the ignore is anchored to `/vendor/`, and `npm run package` fails hard if they are ever missing. Release ZIPs built from a complete tree were never affected.
- **Improved: honest Glyphs Panel error reporting.** Vendor-library load failures and WOFF2 decompression failures now surface as their own error messages (with technical detail) instead of the generic "font could not be read", a server-side precheck flags missing vendor files up front (editor data + a notice on the Glyphs settings tab), and every error state offers a "Try again" button that resets failed loader state and retries without a page reload. Worker-internal vendor failures now also fall back to main-thread parsing instead of being reported as font defects.
- **Fixed: `npm run package` now ships the bundled Variable Fonts module.** The packaging script did not copy `variable-fonts/`, which core loads unconditionally — a ZIP built from it would have fataled on activation. The module is now packaged like the Glyphs Panel, with a preflight check for both bundled modules' main files.

**Variable Fonts improvements**

- **New: "Detect Axes from Font File" button.** Each font's Variable Font settings can now read the axis definitions (tag, name, min/max/default) straight from the font binary in the browser — reusing the Glyphs Panel's metadata-only parsing pipeline — instead of typing them by hand. Works for uploaded kits, Adobe Fonts, and custom font definitions, including WOFF2 files that server-side upload-time detection can't parse. Detected axes fill the form for review; nothing is stored until you save.
- **Improved: weight dropdown suppressed for wght-less variable fonts.** Variable fonts without a weight (`wght`) axis no longer show the standard Font Weight dropdown in the inline editor, Quick Feature Toggles, or the block sidebar — the variable axis sliders take its place. The per-font "Hide weight selection" admin setting now reaches the editors (previously it only affected the admin form's weight checkboxes).
- **Fixed: "Variable Font Axes" section padding in the inline editor pop-up** now matches the other sections' left/right inset.
- **Developer:** the `typost_weight_control` JS filter recognizes a new `'hidden'` return value (suppress the weight control entirely, no wrapper rendered — works even for the sidebar's PanelBody), and the `typost_qft_after_font_controls` hook state now includes `inlineFontFamilyAtSelection`. See HOOKS.md.
- **Added: automatic variable-font detection on add.** When fonts are added — a webfont kit ZIP upload or an Adobe Fonts kit — the Variable Fonts module now runs its metadata-only fvar detection on each new entry in the browser (the same pipeline as the Detect Axes button), saves axes where found, and marks those fonts variable before the page reloads. Each family in a kit is checked individually, so mixed variable/static kits work correctly, and the client-side pipeline covers woff2 (which the server-side upload parser skips). A notice reports how many of the new fonts were detected as variable. Built on a new `typost:fonts-added` jQuery admin event (documented in HOOKS.md) that carries the new entries and a `waitUntil()` collector — core holds its reload (15 s cap) until listeners finish.
- **Fixed: inconsistent weight control for wght fonts with "Hide weight selection" unchecked.** `resolveWeightControlType()` previously returned `'variable'` whenever a wght axis existed, so the slider appeared on open — but editor state churn during edits re-evaluated the filter and flipped it to the dropdown. The `hideWeights` flag now gates everything: checked → wght slider (or fully hidden without a wght axis); unchecked (explicit admin choice, or missing flag data) → the standard weight dropdown, consistently, with non-wght axes still rendering in their own panel.
- **Changed: variable fonts hide the discrete weight UI by default.** "Hide weight selection" now auto-checks for every variable font (admin checkbox, weight checkboxes visibility, and the server-resolved `hideWeights` flag the editor receives). Rationale: with a wght axis the slider replaces the weight dropdown; without one the weight is fixed by the binary — the discrete weight controls are redundant in both cases. An explicit admin toggle always wins over the auto rule. Previously the auto rule was inverted (hide only when *no* wght axis existed).
- **Changed: module version constants bumped** — Variable Fonts 1.2.1, Glyphs Panel 1.1.2 — so browsers cache-bust the updated module scripts (these ship unminified; the constants are their only cache-buster).
- **Changed: Variable Fonts admin tab replaced by a card badge.** The read-only overview tab (a font → axes table duplicating information available on each card) is gone; `variable-fonts/includes/admin-tab.php` was deleted. Variable fonts now get a "Variable" pill next to their source badge on the Custom Fonts tab, with the configured axis tags in the tooltip. Built on a new core `typost_font_card_badges` PHP filter (documented in HOOKS.md) that any extension can use to append card badges — the VF module hooks it exactly as an external extension would.
- **Accessibility: settings-page audit fixes.** (1) The Variable Fonts axis Tag/Name inputs gained `aria-label`s (they were placeholder-only — 10 WAVE "missing form label" errors). (2) Full contrast audit of the admin color-scheme system, verified programmatically per scheme: Alice Blue's `--typost-color-primary` (#4a90c4 → #2a689e) and `--typost-text-muted` (#5a7a94 → #44647c) now hold ≥4.5:1 on every panel tint, including white badge text on primary; Dark's `--typost-text-on-primary` became #0f1729 (white on #6db3e8 was 2.27:1) and its danger red lightened to #f58080; High Contrast's danger darkened to #b00000; the derived Admin Colors scheme now runs its WP-palette colors through a new `darken_to_contrast()` helper until they meet 4.5:1 vs white. Alice Blue also gained secondary-button overrides (WP's default #007cba button text fell below 4.5:1 on tinted panels). (3) Heading hierarchy: font cards h4 → h3 (h2 → h4 skip). (4) WP Library card titles render in their own font-family with `wp_print_font_faces()` printed on the tab (progressive enhancement — theme.json-only families without registered files fall back to the name in the stack), and `.typost-wpl-family` gained right margin plus scheme-variable colors.
- **Changed: QFT popover tips notice unified with the inline modal's.** The Quick Feature Toggles notice now renders the same two msgids as the inline modal (single source in the translation catalog) and is dismissible via the same `typography_stylist_hide_modal_tips` localStorage key — dismissing either notice hides both, persisted per browser. Previously it showed only the drag tip, with a stale untranslated msgid, and could not be dismissed.
- **Changed: info-icon tooltips converted to plain help text (and audited).** The `InfoTip` component (edit.js) and `renderInfoTip()` (block-editor.js) are gone, along with the now-unused `Tooltip` imports. Per tip: the Font Family "fonts only load on pages where they are used" claim was **removed as inaccurate** — it holds for plugin-managed fonts but not WP Font Library-registered ones, which WordPress prints site-wide; the Font Size clamp() explanation moved to the SelectControl `help` prop, shown only when Responsive mode is active; the OpenType features overview became a plain paragraph above the existing block-level note in the features panel.
- **Removed: the Adobe Fonts "Project Name" field.** Since Adobe kits create one plugin entry per family (named by the family), the project name was stored as `kit_name` but never displayed — the field (and its required validation) was vestigial. The REST endpoint still accepts an optional `name` and defaults to "Adobe Fonts {kit_id}", so nothing breaks for API callers. The dead `$kit_label` assignment in the admin page went with it.
- **Fixed: inline-popover Glyphs button alignment.** The button (injected at the bare `typost_inline_before_features` hook point) sat flush against the popover edge; it now carries the same horizontal inset as the native sections.
- **Changed: inline popover Tips consolidated into the top notice.** The collapsible four-item Tips list at the bottom is gone. The top notice now shows the drag-to-reposition tip first, then "Changes apply instantly, press Ctrl+Z (Cmd+Z on Mac) to undo." (there is no Apply button, so live preview + undo is worth surfacing). The notice is dismissible; dismissal persists per browser via `localStorage` (`typography_stylist_hide_modal_tips`), mirroring the sessionStorage pattern used for the clear-confirmation warning. The other removed tips duplicated InfoTips and admin help content. Both tip strings gained pot/po entries (the drag tip was previously untranslatable).
- **Fixed: multi-font kits could lose the first font's detected axes.** The auto-detect sweep saves each family's axes via `POST /typost/v1/variable-font-axes/{id}`, whose handler does a read-modify-write on the shared `typost_variable_font_axes` (and flags) options. With several families detected near-simultaneously, the concurrent saves raced and the earliest write was clobbered by later requests that had read the option before it landed — reliably losing the first family in a three-font kit. `saveAxesRequest()` in the Variable Fonts admin JS now funnels all saves through a single promise chain so they execute sequentially.
- **Fixed: Adobe multi-family kits resolved the wrong font file.** The Glyphs Panel font loader matched Adobe faces against the legacy `font_families` array only; modern per-family entries store `font_family` (singular), so detection and glyph loading in a multi-family kit always grabbed the first face in the kit CSS. The loader now honors both shapes.
- **Improved: custom-axis quick-select buttons.** For custom variable-font axes, quick buttons were generated as offsets of the axis minimum (a 1–1000 axis produced 1, 101, 201… plus the default spliced in, yielding near-duplicates like 400/401 and 12 buttons wrapping to two rows). Stops now snap to round 1–2–5 multiples, skip values that crowd the min/max/default, and cap at 7 buttons so the row doesn't wrap — a 1–1000 axis with default 400 now yields 1, 200, 400, 600, 800, 1000. Registered axes (wght, wdth, opsz, slnt, ital) keep their standard typographic stops.
- **Fixed: stale extension panels on font switch.** Hook containers for the font-dependent hook points (`typost_weight_control`, `typost_inline_after_font_controls`, `typost_qft_after_font_controls`, `typost_inspector_after_font_weight`) previously fired their action only once per editor session, so extension UI (e.g. Variable Font axis sliders) kept showing the previous font's controls after a font change — or never appeared when switching from a static to a variable font. These containers are now keyed to the active font and remount with fresh state whenever it changes. Documented in HOOKS.md under "Container lifecycle".

### Version 2.0.0

**Flagship feature: the Glyphs Panel (built into core)**

An Illustrator-style full-font glyph browser, now bundled into the core plugin (previously a separate add-on):

- **Browse & search every glyph** - Explore every character and OpenType feature in a font. Search by character, `U+` codepoint, or glyph name; filter by Unicode block, stylistic set, or OpenType feature; view all alternates for a single character.
- **Insert anywhere** - Click or press Enter to insert any glyph (including indexed feature alternates) into your content. Available as a "Glyphs…" button in the inline rich-text toolbar, in the Typography Stylist block's Quick Feature Toggles, and as a dedicated **Glyphs** admin tab (browse + copy to clipboard). Closing the panel returns you to the editor popover you launched it from.
- **Accessible by design (ATAG-conscious)** - The glyph grid is a fully keyboard-navigable ARIA grid (arrow keys, Home/End, Page Up/Down, Enter/Space to insert) with row/column semantics. Insertions, copies, and result counts are announced to screen readers. Inserted glyphs use the real Unicode character plus CSS `font-feature-settings`, so assistive technology always reads the underlying text.
- **Broad font support, privacy-first** - Works with uploaded webfont kits, Adobe Fonts, custom font definitions, and WordPress Font Library fonts. Font files are parsed in your browser, on demand, for metadata only — no glyph outlines are ever extracted or stored, and nothing font-derived is written to your server. Parsing runs in a Web Worker with IndexedDB caching.

**Inline editor: live preview overhaul**

The inline text editor (richtext toolbar) reaches feature parity with the Typography Stylist block by implementing live preview and removing the Apply button paradigm.

- **Removed: Apply button** - All controls now apply changes immediately as you adjust them.
- **Removed: "Apply Anyway" and "Discard Changes" buttons** - These word-boundary-warning actions are obsolete; the warning no longer blocks editing.
- **Removed: Internal Undo system** - The in-modal "Undo" button is gone; use native WordPress undo (Ctrl+Z), which now records each debounced change as its own step. The internal `changeHistory` state machine is removed.
- **Removed: Redundant preview panel** - The separate preview panel with device toggles is removed; live preview on the actual selected text makes it unnecessary (per-feature checkbox previews remain).
- **Live preview with smart debouncing** - OpenType features apply instantly; letter-spacing/line-height sliders at 400ms; font-family/weight dropdowns at 300ms; responsive font-size (3 sliders) at 600ms.
- **Non-blocking accessibility warning** - Word boundary warnings are persistent, non-blocking notices at the top of the modal instead of blocking popups.

**Other 2.0 highlights**

- **Extensibility hook system** - Comprehensive PHP and JavaScript hooks (`window.typostHooks`, admin-tab registration, REST route hooks) enabling third-party extensions.
- **Unified font management** - All font sources (uploaded, Adobe, custom, WP Font Library) in one drag-to-reorder list, with per-font OpenType feature visibility.

See [readme.txt](readme.txt) for the complete 2.0.0 changelog.

### Version 1.2.2

**Apply Anyway & Smart Conversion Detection:**
- **Added: Re-introduced "Apply Anyway" button** - The word boundary accessibility warning when applying features to partial words in core blocks now offers an "Apply Anyway" option, giving users the choice to proceed despite potential screen reader fragmentation.
- **Added: Smart conversion detection** - The "Convert to Typography Stylist Block" button is automatically hidden when conversion is not possible (e.g., the block is inside a locked pattern). The warning message adjusts to reflect the available options.
- **Added: Safety fallback** - If block conversion fails despite the pre-check, features are applied directly with a snackbar notice informing the user.
- **Added: "Disable Word Boundary Warning" option** - New setting in Settings → Typography Stylist → Accessibility that skips the partial word warning entirely for users who frequently style partial words and understand the implications.
- **Added: "Manage this setting" deep-link** - The warning message includes a link to the admin accessibility settings page that auto-switches to the Accessibility tab and highlights the relevant setting with a fade animation.

**Bug Fix:**
- **Fixed: Nonce mismatch in admin settings forms** - The Accessibility and Options settings forms used mismatched nonce names between `wp_nonce_field()` and `check_admin_referer()`, causing "The link you followed has expired" errors when saving settings.

### Version 1.2.1

**New Feature: Per-Font Weight Restrictions:**
- **Added: Per-font weight configuration** - Configure which font weights are available for each font in the admin panel (Settings → Typography Stylist → Custom Fonts). All weights are enabled by default for variable font compatibility. Uncheck weights a font doesn't include to prevent users from selecting unavailable weights.
- **Added: Single-weight auto-apply** - When a font has only one available weight, the weight selector is hidden and the weight is automatically applied.
- **Added: Weight validation on font change** - Switching fonts automatically adjusts the weight to the closest available option if the current weight isn't supported by the new font.
- **Changed: "Edit Fallbacks" renamed to "Edit Settings"** - Admin font management buttons now reflect the expanded functionality (fallbacks + weight configuration).

**Bug Fixes:**
- **Fixed: CSS variable trailing comma broke font loading** - Fonts without fallbacks produced invalid CSS variables (e.g. `--font-20: "EsmeraldaPro", ;` with a trailing comma), causing browsers to silently reject the `font-family` declaration on both frontend and block editor. Changed `isset()` to `!empty()` for fallback string checks.
- **Fixed: Screen reader text missing spaces at line breaks** - When using Shift+Enter in Typography Stylist blocks, the visually-hidden screen reader text concatenated words without a space (e.g. "MILANOCORTINA" instead of "MILANO CORTINA"). Line breaks are now replaced with spaces in the accessible text output.
- **Fixed: Inline editor modal lost font selection on close/reopen** - Selecting a font family, closing the modal without applying, then reopening and clicking Apply would silently fail. The root cause was `selectedFontId` not being reset in `togglePopover()`, leaving stale state that caused `applyFeatures()` to enter the `removeFormat` branch instead of `applyFormat`.
- **Fixed: Missing `data-lineheight` in format type registration** - Line-height values were silently dropped when reading back existing formatted content because the attribute wasn't registered with WordPress's `registerFormatType`.

**UX Improvement:**
- **Improved: Convert-to-block link in apply notice** - The "Click Apply below the preview to confirm changes" notice now includes a "Convert to a Typography Stylist block" link that converts the current block with features applied, guiding users toward the block type that supports real-time preview.

**Preview Enhancement:**
- **Improved: Cumulative OpenType feature previews** - Feature preview windows now show all currently-checked features combined, not just the individual feature in isolation. This accurately represents how features interact in fonts like Bookmania, where combining stylistic sets (e.g., ss10 + ss16) produces different glyphs than either set alone. Each preview always includes its own feature plus all other active features, updating in real time as features are toggled. Applies to both the inline editor popover and the Typography Stylist block's Quick Features Toggle.

**Accessibility UX:**
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

**Bundled third-party libraries** (Glyphs Panel, `glyphs-panel/assets/js/vendor/`, loaded on demand, client-side only):
- [opentype.js](https://github.com/opentypejs/opentype.js) v1.3.4 — TTF/OTF/WOFF font parsing (MIT License)
- [wawoff2](https://github.com/fontello/wawoff2) — WOFF2 decompression, Emscripten/WebAssembly build of Google's woff2 (MIT License)

**Special Thanks:**
- The WordPress community
- Type designers who create fonts with OpenType features
