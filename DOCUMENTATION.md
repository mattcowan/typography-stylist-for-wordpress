# Typography Stylist - User Documentation

**Version 2.1.0**

Welcome to Typography Stylist\! This plugin brings advanced typography features to WordPress, allowing you to apply professional OpenType features like ligatures, stylistic sets, and swashes to your headlines with just a few clicks.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Font Management](#font-management)
3. [Applying Typography Features](#applying-typography-features)
4. [Admin Interface Guide](#admin-interface-guide)
5. [Accessibility Features](#accessibility-features)
6. [Troubleshooting](#troubleshooting)
7. [Developer Guide](#developer-guide)

---

## Getting Started

### Installation

1. **Upload the plugin:**
   - Download the plugin ZIP file
   - Go to WordPress Admin → Plugins → Add New
   - Click "Upload Plugin"
   - Choose the ZIP file and click "Install Now"

2. **Activate:**
   - Click "Activate Plugin"
   - You'll see a success message

3. **Access Settings:**
   - Go to Settings → Typography Stylist
   - Explore the available features and presets

### System Requirements

- WordPress 5.8 or higher
- PHP 7.4 or higher
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Fonts that support OpenType features

### What Are OpenType Features?

OpenType features are advanced typography capabilities built into professional fonts. They include:

- **Ligatures** - Special connected letter pairs (like "fi" or "ffl")
- **Stylistic Sets** - Alternative letter designs for different looks
- **Swashes** - Decorative flourishes on letters
- **Contextual Alternates** - Letters that change based on surrounding characters
- **And more!**

Not all fonts support all features. Premium fonts (especially script fonts) typically have the richest OpenType support.

---

## Font Management

Typography Stylist gives you three ways to add custom fonts to WordPress:

### Method 1: Upload Webfont Kits

Upload complete webfont kits from MyFonts, Fontspring, or other font vendors — or font-only ZIPs such as Google Fonts downloads.

**Step-by-Step:**

1. **Purchase and download** a webfont kit from your font vendor
2. **Go to** Settings → Typography Stylist → Custom Fonts tab
3. **Click "Choose ZIP File"** and select your downloaded kit
4. **Click "Upload Font Kit"** — font names are read from the kit itself

The plugin will:
- Extract the ZIP file
- Process CSS and font files
- Make fonts available in the editor
- Store files securely in `wp-content/uploads/typography-stylist/fonts/`

**What should the ZIP contain:**
- Font files: WOFF, WOFF2, TTF, OTF, or EOT (SVG fonts are not accepted for security reasons)
- Ideally a CSS file with @font-face declarations (e.g., `MyWebfontsKit.css`), with the directory structure matching the paths in the CSS file
- **A CSS file is optional (v2.1.0+):** if the ZIP contains only font files, the plugin reads each font's built-in metadata (name, OS/2, and fvar tables for TTF/OTF/WOFF) and generates the stylesheet automatically — family names, weights, italics, and the weight range of variable fonts. WOFF2 metadata cannot be read on the server, so WOFF2-only ZIPs fall back to filename-based detection (Google Fonts naming conventions) and the upload shows a warning asking you to review the generated font styles.

**Security:**
- Maximum ZIP size: 10MB
- Maximum CSS file size: 1MB
- Only approved file types are extracted
- .htaccess protection prevents PHP execution
- CSS is sanitized to remove dangerous code

### Method 2: Adobe Fonts (Typekit) Integration

Connect Adobe Fonts projects by pasting the embed code.

**Step-by-Step:**

1. **Go to** [fonts.adobe.com](https://fonts.adobe.com)
2. **Create or open** a Web Project
3. **Add fonts** to your project
4. **Copy the embed code** (the `<script>` tag)
5. **Go to** Settings → Typography Stylist → Custom Fonts tab
6. **Scroll to** "Adobe Fonts (Typekit)" section
7. **Enter a project name** (e.g., "My Adobe Fonts")
8. **Paste the embed code** into the textarea
9. **Optionally enter font family names** (comma-separated)
10. **Click "Add Adobe Fonts Project"**

**Important:**
- Make sure your domain is authorized in Adobe Fonts project settings
- Fonts load directly from Adobe's servers (not your WordPress install)
- The plugin stores only the embed code and metadata

### Method 3: Custom Font Definitions

Define fonts already loaded through your theme, plugins, or CDN (like Google Fonts).

**Step-by-Step:**

1. **Make sure your font is already loaded** on your site
2. **Go to** Settings → Typography Stylist → Custom Fonts tab
3. **Scroll to** "Custom Font Definitions" section
4. **Enter a display name** (e.g., "Playfair Display")
5. **Enter the CSS font-family value** exactly as it appears in your theme:
   - Google Fonts: `'Playfair Display', serif`
   - System fonts: `-apple-system, BlinkMacSystemFont, sans-serif`
   - Theme fonts: `'My Theme Font', Georgia, serif`
6. **Optionally add fallback fonts** (comma-separated)
7. **Click "Add Custom Font"**

**Note:** This method does NOT load fonts - it only makes existing fonts available in the plugin interface.

### Managing Font Fallbacks

Fallback fonts are used when the primary font fails to load, ensuring your text remains readable.

**For all font types:**
- Click "Edit Fallbacks" (for uploaded/Adobe fonts) or "Edit" (for custom font definitions)
- Enter fallback font names separated by commas (optional)
- Example: `Georgia, serif` or `Arial, Helvetica, sans-serif`
- Fallbacks are automatically included when using fonts from the block editor
- Click "Save Changes" to update

**Important Notes:**
- **Fallbacks are applied at the kit/project level**: One fallback string applies to all fonts in an uploaded kit or Adobe Fonts project
- For kits with multiple font families, the same fallback fonts will be used for all families in that kit
- Custom font definitions can have individual fallbacks since they define single font families
- Fallbacks are optional - you can leave them empty if desired

**Example CSS output:**
```css
/* When you use a font with fallbacks configured */
font-family: 'Playfair Display', Georgia, serif;
```

### Updating Existing Blocks with Fallbacks

**Important:** Fallbacks are added when you select a font from the dropdown. If you configured fallbacks AFTER creating blocks, those existing blocks won't automatically have the fallbacks.

**Why This Happens:**
- WordPress blocks save their settings (attributes) with the post content
- When you select a font, the complete font-family value (including fallbacks) is saved to the block
- Existing blocks have the old value without fallbacks

**How to Update Existing Blocks:**

1. **Edit the post/page** containing the Typography Stylist block
2. **Click on the block** to select it
3. **In the block sidebar settings**, find the "Font Family" dropdown
4. **Re-select the same font** from the dropdown (this will add the current fallbacks)
5. **Update or publish** the post

The block will now use the font with fallbacks included.

**Tip:** You can update multiple blocks on the same page in one editing session before saving.

**Note:** This is normal WordPress block behavior - block attributes are saved with the post and don't automatically update when global settings change.

**Future Enhancement:** Per-font-family fallbacks are planned for a future release. See [ROADMAP.md](ROADMAP.md) for details.

### Font Loading Optimization

Typography Stylist includes smart font loading to improve site performance.

**Load on All Pages Option:**

For **Uploaded Fonts (MyFonts/Fontspring kits)** and **Adobe Fonts**, you can control when fonts are loaded:

- **Unchecked (default)**: Fonts load only on pages where they're actually used
  - Best for performance
  - Recommended for most sites
  - Fonts are detected automatically from post content

- **Checked**: Fonts load on every page
  - Use when fonts are added dynamically via JavaScript
  - Use for fonts in theme headers/footers
  - Use if you experience font loading issues

**How to Configure:**
1. Go to Settings → Typography Stylist → Custom Fonts tab
2. Find your uploaded font kit or Adobe Fonts project
3. Check/uncheck "Load on all pages" for each kit/project
4. Changes save automatically

**Note:** Custom font definitions (fonts loaded by your theme/plugins) don't need this option since they're already managed by your theme.

### Font Preview & Glyph Browser

The Custom Fonts tab includes an interactive font preview tool:

1. **Select a font** from the dropdown
2. **Type custom text** or use the default preview
3. **Adjust font size** with the slider
4. **Toggle OpenType features** to see how they affect the font
5. **Test different features** to verify what your font supports

This helps you:
- Verify fonts loaded correctly
- Discover which OpenType features are supported
- Test feature combinations before using them in content

### WordPress Font Library Integration (WordPress 6.5+)

On WordPress 6.5 or later, uploaded webfont kits can also be registered in the **WordPress Font Library** (Appearance → Editor), making them available to the whole site through WordPress's own font system.

- **New uploads register automatically** — controlled by the "WordPress Font Library" toggle in the Options tab (on by default).
- **Existing fonts are opt-in** — each uploaded font card on the Custom Fonts tab shows its status ("Registered as *slug*" or "Plugin-managed") with a **Register in Font Library** / **Remove from Font Library** button, and a notice offers one-click bulk registration.
- **Nothing breaks either way.** Your content keeps using the same font references; the plugin simply points them at WordPress's font definitions when a registration is active, and falls back automatically if you remove the font from the Library. Registration is fully reversible.
- **Library fonts in the editor** — fonts installed in the Font Library (or bundled with your theme) also appear in the editor font pickers with a 🌐 icon. Pick one and it just works, like any other font.
- **Adobe Fonts and custom font definitions stay plugin-managed** — Adobe fonts load from Adobe's servers and may not be self-hosted; custom definitions reference fonts your theme or CDN already loads.

---

## Applying Typography Features

Typography Stylist offers two ways to apply typography features:

### Method 1: Inline Format (Simple)

Best for applying features to complete words or phrases in heading blocks.

**Step-by-Step:**

1. **Create or edit** a post/page
2. **Add a Heading block** (H1, H2, H3, H4, H5, or H6)
3. **Type your headline** text
4. **Select the text** you want to style (complete words only)
5. **Click the Typography Stylist button** in the toolbar (a swash "T" icon)
6. A popover will appear with:
   - **Quick Presets** - Pre-configured feature combinations
   - **Individual Features** - Toggle specific OpenType features
7. **Preview** your changes in real-time
8. **Click Apply** to save

**Smart Selection Warnings:**

If you select partial words (like just "Sa" in "Sarah"), you'll see an accessibility warning:

> "Warning: Partial word selection detected. This may fragment text for screen readers."

You have two options:
- **Convert to Typography Stylist Block** - Converts to an accessible Typography Stylist block (recommended)
- **Discard Changes** - Cancels the operation

**Why this matters:** Screen readers may read fragmented text in a confusing way. the Typography Stylist block solves this with dual content.

### Method 2: Typography Stylist block (Advanced)

Best for complex typography, letter-by-letter styling, or maximum accessibility.

**Step-by-Step:**

1. **Add an Typography Stylist block** from the block inserter
   - Click the (+) button
   - Search for "Typography Stylist"
   - Click to insert
2. **Type your text** directly in the block
3. **Configure settings** in the sidebar Inspector Controls:

**Typography Settings:**
- **Heading Level** - Choose H1, H2, H3, H4, H5, H6, P, or DIV
- **Font Family** - Select from available fonts
- **Font Weight** - Choose weight (100-900)
- **Font Size** - Static value or responsive/fluid sizing
- **Letter Spacing** - Adjust spacing in increments of 1/1000 em

**OpenType Features:**
Features are organized by category:
- **Ligatures** - liga, dlig, calt
- **Stylistic Sets** - ss01 through ss20
- **Swashes** - swsh, cswh
- **Alternates** - salt, titl, ornm

**Accessibility:**
- **Screen Reader Class** - Choose visually-hidden, sr-only, or custom class
- The block creates two versions of your content:
  - Clean semantic heading for screen readers
  - Styled version for visual display

**Why use the block?**
- Apply features to partial words safely
- Letter-by-letter styling control
- Maintains semantic HTML structure
- Screen reader compatible with ARIA markup
- Responsive font sizing options

### Quick Presets

The plugin includes several quick-apply presets:

- **Elegant Script** - Contextual alternates + stylistic set 01
- **Wedding Style** - Contextual alternates + stylistic set 02 + swashes
- **Formal Text** - Discretionary ligatures + titling alternates
- **Decorative** - All swashes + ornaments

You can also create and save your own custom presets from the Admin Settings.

---

## Admin Interface Guide

Access via Settings → Typography Stylist

### Presets Tab

**View Default Presets:**
- See all available quick presets
- Each preset shows which features it includes
- Description explains the intended use

**Create Custom Presets:**
1. Click "Create New Preset"
2. Enter a name and description
3. Select features to include
4. Click "Save Preset"
5. Your preset appears in the editor popover

**Manage Presets:**
- Edit preset names and features
- Delete custom presets (default presets cannot be deleted)

### Font Features Tab

**Explore Available Features:**
- View all OpenType features supported by the plugin
- See feature codes (e.g., `liga`, `ss01`, `swsh`)
- Read descriptions of what each feature does
- Features are organized by category

**Feature Categories:**
- **Ligatures** - Connected letter pairs
- **Stylistic Sets** - Alternative letter designs (ss01-ss20)
- **Swashes** - Decorative flourishes
- **Alternates** - Contextual and stylistic variations

### Custom Fonts Tab

**Three Sections:**

1. **Uploaded Webfont Kits**
   - View all uploaded font kits
   - See upload date and file count
   - Set fallback fonts
   - Delete font kits (removes files from server)

2. **Adobe Fonts (Typekit)**
   - View connected Adobe Fonts projects
   - See project names and font families
   - Update fallback fonts
   - Remove projects

3. **Custom Font Definitions**
   - View manually defined fonts
   - See font-family values
   - Edit fallback fonts
   - Remove definitions

**Font Preview Tool:**
- Select any font from the dropdown
- Type custom preview text
- Adjust font size
- Toggle OpenType features to test support

### Accessibility Tab

**Screen Reader Settings:**
- Choose default screen reader class:
  - `visually-hidden` (default)
  - `sr-only` (common alternative)
  - Custom class name
- Configure ARIA label behavior for inline formats
- Learn about accessibility best practices

**Accessibility Features:**
- Typography Stylist block maintains semantic heading structure
- Dual content approach: clean for screen readers, styled for visual
- Smart selection warnings prevent text fragmentation
- Configurable screen reader classes

### Help Tab

**Quick Reference:**
- Links to documentation
- Common questions and answers
- Tips for using OpenType features
- Support resources

---

## Accessibility Features

Typography Stylist is designed with accessibility in mind.

### The Accessibility Challenge

Complex typography with OpenType features can create challenges for screen readers:
- Partial word styling fragments text
- Decorative characters may be read incorrectly
- Visual-only content may confuse screen reader users

### Our Solution: Dual Content Approach

the Typography Stylist block creates two versions of your content:

```html
<div class="wp-block-typography-stylist">
  <!-- For screen readers - clean semantic heading -->
  <h2 class="visually-hidden">Beautiful Typography</h2>

  <!-- For visual display - styled with OpenType features -->
  <h2 class="typost-styled" aria-hidden="true">
    [Styled content with complex typography]
  </h2>
</div>
```

**How it works:**
1. Screen readers read the clean, unformatted text in proper semantic heading
2. The heading maintains document outline and navigation
3. Sighted users see the beautifully styled version
4. `aria-hidden="true"` prevents screen readers from reading styled version
5. `visually-hidden` class hides clean version from sighted users

### Best Practices

**Use Inline Format When:**
- Applying features to complete words or phrases
- Styling simple text that won't fragment
- You want quick application in existing heading blocks

**Use Typography Stylist block When:**
- Applying features to partial words or individual letters
- Creating complex typographic designs
- Accessibility is a primary concern
- You need maximum control over typography

**General Tips:**
- Test with screen readers (NVDA on Windows, VoiceOver on macOS)
- Always select complete words when using inline format
- Heed the partial word selection warnings
- Use the conversion tool when offered
- Consider whether decorative typography adds meaning or is purely visual

### WCAG Compliance

The plugin helps maintain WCAG 2.1 Level AA compliance by:
- Preserving semantic HTML structure
- Maintaining proper heading hierarchy
- Providing text alternatives via dual content
- Ensuring keyboard accessibility
- Supporting screen reader navigation

---

## Troubleshooting

### Fonts Not Appearing in Editor

**Check:**
1. Font upload completed successfully (no error messages)
2. For Adobe Fonts: embed code is correct and domain is authorized
3. For custom fonts: font is actually loaded on your site
4. Browser cache - try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
5. Check browser console for errors (F12 → Console tab)

**Solution:**
- Re-upload font kit if corrupted
- Verify Adobe Fonts embed code
- Check theme is loading custom fonts
- Clear browser and WordPress caches

### OpenType Features Not Working

**Common Causes:**
1. **Font doesn't support the feature** - Not all fonts have all OpenType features
2. **Browser doesn't support font-feature-settings** - Use a modern browser
3. **CSS conflict** - Another plugin or theme may override styles

**How to Check:**
1. Use the Font Preview tool to verify feature support
2. Test in different browsers
3. Check browser DevTools (F12 → Elements tab) for applied styles
4. Look for `font-feature-settings` CSS property

**Solution:**
- Choose features your font actually supports
- Update your browser
- Check for CSS conflicts in DevTools
- Try disabling other plugins temporarily

### Uploaded Fonts Not Loading on Frontend

**Check:**
1. Font files are in `wp-content/uploads/typography-stylist/fonts/`
2. File permissions allow web server to read files
3. .htaccess isn't blocking font file access
4. No CORS errors in browser console

**Solution:**
- Check file permissions (should be 644 for files, 755 for directories)
- Verify .htaccess in uploads directory doesn't block fonts
- Check server CORS configuration for font files

### ZIP Upload Fails

**Common Issues:**
1. **File too large** - Maximum 10MB
2. **Invalid file types** - Must contain CSS and font files only
3. **Corrupted ZIP** - Try re-downloading from font vendor
4. **Server upload limits** - Check PHP upload_max_filesize
5. **No usable fonts** - "No CSS file was found in the font kit, and no usable font files were found to generate one from" means the ZIP contained neither a stylesheet nor any valid font binaries (a CSS file is optional since v2.1.0 — bare-font ZIPs normally work)

**Solution:**
- Reduce ZIP size by removing unnecessary files
- Ensure ZIP contains only CSS and font files
- Get a fresh download from vendor
- Contact hosting provider to increase upload limits

**"Review the generated font styles" warning:** shown when the stylesheet had to be generated from filename guesses (WOFF2 files, or binaries that could not be parsed). Check the family names and weights on the new font cards; if something is wrong, delete the kit and re-upload with TTF/OTF files (whose metadata can be read directly) or include your own CSS file in the ZIP.

### Features Applied But Not Visible

**Possible Causes:**
1. Font variation doesn't include that feature
2. Font size too small to see the difference
3. Feature only affects specific letter combinations
4. Browser rendering issue

**Solution:**
- Test with larger font sizes
- Try different letter combinations (some features are contextual)
- Use the font's specimen sheet to see which letters are affected
- Compare with and without the feature using Font Preview

### Screen Reader Issues

**If screen reader reads text incorrectly:**

1. Use the Typography Stylist block instead of inline format
2. Ensure you're selecting complete words with inline format
3. Configure proper screen reader class in Accessibility settings
4. Test with multiple screen readers (NVDA, JAWS, VoiceOver)

**Solution:**
- Convert inline formats to Typography Stylist blocks
- Follow the partial word selection warnings
- Ensure semantic heading structure is maintained

### Performance Issues

**If editor or frontend feels slow:**

1. **Too many custom fonts loaded** - Each font adds weight
2. **Font files too large** - Use WOFF2 for smallest size
3. **Too many OpenType features** - More features = more processing

**Solution:**
- Load only fonts you actually use
- Convert fonts to WOFF2 format
- Use features sparingly
- Consider lazy loading for fonts

---

## Developer Guide

### Extending with Hooks and Filters

#### Add Custom OpenType Features

```php
add_filter('TYPOST_available_features', function($features) {
    $features[] = array(
        'id' => 'cv01',
        'name' => __('Character Variant 1', 'your-textdomain'),
        'category' => 'variants',
        'description' => __('Alternative character design', 'your-textdomain')
    );
    return $features;
});
```

#### Add Default Presets

```php
add_filter('TYPOST_default_presets', function($presets) {
    $presets[] = array(
        'id' => 'my-custom-preset',
        'name' => __('My Custom Style', 'your-textdomain'),
        'features' => array('calt', 'ss03', 'dlig'),
        'description' => __('Custom combination', 'your-textdomain')
    );
    return $presets;
});
```

### REST API Usage

All REST API endpoints are at `/wp-json/typost/v1/`

#### Get All Presets

```javascript
fetch('/wp-json/typost/v1/presets')
    .then(response => response.json())
    .then(data => console.log(data));
```

#### Upload Font Kit

```javascript
const formData = new FormData();
formData.append('name', 'My Font');
formData.append('file', fileInput.files[0]);

fetch('/wp-json/typost/v1/fonts', {
    method: 'POST',
    headers: {
        'X-WP-Nonce': wpApiSettings.nonce
    },
    body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

#### Add Adobe Fonts Project

```javascript
fetch('/wp-json/typost/v1/adobe-fonts', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': wpApiSettings.nonce
    },
    body: JSON.stringify({
        name: 'My Adobe Fonts',
        embed_code: '<script src="https://use.typekit.net/xxx.js"></script>',
        font_families: 'proxima-nova,futura-pt'
    })
})
.then(response => response.json())
.then(data => console.log(data));
```

### CSS Classes Reference

#### Frontend Classes

```css
/* Inline format wrapper */
.typost-styled {
    /* Inline OpenType features applied here */
}

/* Block wrapper */
.wp-block-typography-stylist {
    /* Block container */
}

/* Screen reader only content */
.visually-hidden, .sr-only, .screen-reader-text {
    /* Hidden from visual display, visible to screen readers */
}
```

#### Data Attributes

```html
<!-- Inline format stores features -->
<span class="typost-styled"
      data-features="calt,ss02,swsh"
      style="font-feature-settings: 'calt' 1, 'ss02' 1, 'swsh' 1">
    Text
</span>
```

### File Structure

```
typography-stylist/
├── typography-stylist.php              # Main plugin file
├── includes/
│   └── admin-page.php                # Admin settings interface
├── assets/
│   ├── js/
│   │   ├── block-editor.js           # Inline format editor integration
│   │   ├── admin-page.js             # Admin page interactions
│   │   ├── glyph-browser.min.js      # Font preview tool
│   │   └── utils.js                  # Shared utility functions
│   └── css/
│       ├── block-editor.css          # Editor styles
│       ├── admin-page.css            # Admin page styles
│       ├── frontend.css              # Frontend styles
│       └── glyph-browser.min.css     # Glyph browser styles
├── blocks/
│   └── typography-stylist/
│       ├── index.js                  # Block registration
│       ├── edit.js                   # Block editor component
│       ├── save.js                   # Block frontend rendering
│       ├── utils.js                  # Block utility functions
│       ├── editor.css                # Block editor styles
│       ├── style.css                 # Block frontend styles
│       └── build/                    # Compiled block assets
├── languages/
│   └── opentype-stylist.pot          # Translation template
└── README.md                         # Developer documentation
```

### Security Best Practices

When extending the plugin:

1. **Always sanitize input:**
```php
$value = sanitize_text_field($_POST['value']);
$id = sanitize_key($_POST['id']);
```

2. **Verify nonces:**
```php
wp_verify_nonce($_POST['_wpnonce'], 'action-name');
```

3. **Check capabilities:**
```php
if (!current_user_can('edit_posts')) {
    wp_die('Unauthorized');
}
```

4. **Escape output:**
```php
echo esc_html($value);
echo esc_attr($attribute);
echo esc_url($url);
```

### Testing Your Extensions

```bash
# Run unit tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm test -- --coverage
```

---

## Support & Resources

### Getting Help

- **Documentation:** This file and README.md
- **Issues:** Report bugs at GitHub repository
- **WordPress.org:** Plugin support forum

### Useful Links

- [OpenType Feature Reference](https://docs.microsoft.com/en-us/typography/opentype/spec/featurelist)
- [CSS font-feature-settings](https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings)
- [WordPress Block Editor Handbook](https://developer.wordpress.org/block-editor/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### Recommended Fonts

Fonts with excellent OpenType support:

**Script Fonts:**
- Calgary Script (Sudtipos)
- Affair, Adios Script (Sudtipos)
- Parfumerie Script (Sudtipos)

**Serif Fonts:**
- Adobe Caslon Pro
- Freight Display Pro
- Playfair Display (Google Fonts - limited support)

**Sans Serif:**
- Many professional sans serif families include features
- Check individual font specimens

---

## Changelog

See [README.md](README.md#changelog) for detailed version history.

---

**Thank you for using Typography Stylist\!**

We hope this plugin helps you create beautiful, accessible typography in WordPress.
