# Typography Stylist

A WordPress plugin that adds advanced OpenType typography features to headlines with inline text selection and live preview in the Gutenberg block editor.

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

### Technical Implementation
- Native CSS font-feature-settings
- Gutenberg block editor integration
- Supports modern browsers with OpenType feature support

### Accessibility Features
- Smart selection warnings for partial word selections that can cause screen readers to stumble, with options to convert to an accessible Typography Stylist block or apply anyway. The warning detects when conversion is not possible (e.g., inside a locked pattern) and adjusts accordingly. The warning can be disabled entirely in Settings → Accessibility.
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
- Apply anyway (proceeds with the features despite potential screen reader fragmentation)
- Discard changes

When the block cannot be converted (e.g., inside a locked pattern), the conversion option is hidden automatically. The warning includes a "Manage this setting" link to the admin accessibility settings. You can disable this warning entirely via "Disable Word Boundary Warning" in Settings → Typography Stylist → Accessibility.

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
- Warns when partial word selections could fragment text, with options to convert to an accessible block, apply anyway, or discard changes
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

### Version 2.1.0

**WordPress Font Library integration (WP 6.5+)**

- **Register uploaded fonts in the WordPress Font Library** (Appearance → Editor). New uploads register automatically (toggle in Options); existing fonts register per font or in bulk from the Custom Fonts tab — opt-in and fully reversible. Registered fonts keep their numeric IDs: `--font-N` variables alias to `--wp--preset--font-family--{slug}` presets with a literal fallback, so existing content and extension integrations keep rendering forever. WordPress serves the font files for registered fonts (no double-loading). Adobe Fonts and custom definitions stay plugin-managed by design.
- **Library fonts in the editor pickers** - both editors now offer WordPress Font Library fonts in a dedicated group; picking one adopts it with a numeric font ID, leaving the save format and extensions unchanged.
- **Variable Fonts built into core** - the standalone "Typography Stylist - Variable Fonts" extension is now bundled (deactivate the standalone plugin after updating; settings carry over automatically).
- **`typost_force_enqueue_font_ids` filter** for theme-driven font loading, `waitUntil()` on `typost:font-saved`, a font-CSS cache-key fix, and `animationConfigId`/`data-animation-id` integration points for the upcoming Animations extension.

**Editor and Glyphs Panel fixes**

- **Fixed: fonts not rendering in the iframed editor canvas.** The `--font-N` CSS variables now load inside the block editor canvas iframe (WP 6.3+) even when no uploaded webfont kits exist. Previously the variables were only attached alongside uploaded-kit `@font-face` CSS, so sites using only Adobe Fonts, custom font definitions, or Font Library fonts saw the system font in the editor while the frontend rendered correctly.
- **Fixed: Glyphs Panel vendor libraries missing from git deploys.** `glyphs-panel/assets/js/vendor/` (opentype.js, wawoff2 — both MIT, bundled unmodified) was accidentally excluded from the repository by an unanchored `vendor/` ignore meant for Composer, breaking the Glyphs Panel on git-based deploys with a misleading "font could not be read" error. The libraries are now committed, the ignore is anchored to `/vendor/`, and `npm run package` fails hard if they are ever missing. Release ZIPs built from a complete tree were never affected.
- **Improved: honest Glyphs Panel error reporting.** Vendor-library load failures and WOFF2 decompression failures now surface as their own error messages (with technical detail) instead of the generic "font could not be read", a server-side precheck flags missing vendor files up front (editor data + a notice on the Glyphs settings tab), and every error state offers a "Try again" button that resets failed loader state and retries without a page reload. Worker-internal vendor failures now also fall back to main-thread parsing instead of being reported as font defects.
- **Fixed: `npm run package` now ships the bundled Variable Fonts module.** The packaging script did not copy `variable-fonts/`, which core loads unconditionally — a ZIP built from it would have fataled on activation. The module is now packaged like the Glyphs Panel, with a preflight check for both bundled modules' main files.

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
