# Typography Stylist: User Documentation

Typography Stylist adds professional typography to the WordPress block editor. You can apply OpenType features (ligatures, stylistic sets, swashes, and more) to your text, set variable font axes, insert glyphs, and save paragraph styles.

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
   - Download the plugin ZIP file.
   - Go to WordPress Admin → Plugins → Add New.
   - Click “Upload Plugin”.
   - Choose the ZIP file and click “Install Now”.

2. **Activate:**
   - Click “Activate Plugin”.

3. **Open the settings:**
   - Go to Settings → Typography Stylist.
   - Add your fonts on the Custom Fonts tab.

### System Requirements

- WordPress 5.8 or later (the WordPress Font Library features need WordPress 6.5 or later)
- PHP 7.4 or later
- A modern web browser (Chrome, Firefox, Safari, or Edge)
- Fonts that contain OpenType features (for the OpenType controls)

### What Are OpenType Features?

OpenType features are typographic options inside a font file. Some examples:

- **Ligatures:** Joined letter pairs, such as “fi” or “ffl”.
- **Stylistic Sets:** Different designs for a group of letters.
- **Swashes:** Decorative flourishes on letters.
- **Contextual Alternates:** Letters that change with the letters near them.

The plugin supports 51 features. Each font has its own set of features, and some fonts have none. Script fonts and professional typefaces usually have the most.

---

## Font Management

Typography Stylist has three ways to add fonts. Go to Settings → Typography Stylist → Custom Fonts, then open “Add Font”. Fonts from the WordPress Font Library are a fourth source (see [WordPress Font Library Integration](#wordpress-font-library-integration-wordpress-65)).

### Method 1: Upload Webfont Kits

Upload webfont kits from MyFonts, Fontspring, or other font vendors. A ZIP with only font files, such as a Google Fonts download, also works.

**Steps:**

1. Download a webfont kit from your font vendor.
2. Go to Settings → Typography Stylist → Custom Fonts.
3. Open “Add Font”, then open “Upload Font Kit”.
4. Click “Choose ZIP File” and select the kit.
5. Click “Upload Font Kit”. The plugin reads the font names from the kit.

The plugin extracts the ZIP, reads the CSS and the font files, and stores the files in `wp-content/uploads/typography-stylist/fonts/`. The fonts then show in the editor.

**The contents of the ZIP:**

- **Font files:** WOFF, WOFF2, TTF, OTF, or EOT. The plugin does not accept SVG fonts, for security.
- **A CSS file (optional, v2.1.0+):** A kit CSS file with @font-face rules (for example `MyWebfontsKit.css`) is best. Its paths must match the folders in the ZIP. If the ZIP has only font files, the plugin reads the metadata of each font (the name, OS/2, and fvar tables of TTF, OTF, and WOFF files). It then makes the stylesheet, with the family names, the weights, italic, and the weight range of variable fonts.
- **WOFF2 files:** The server cannot read WOFF2 metadata. For a ZIP with only WOFF2 files, the plugin gets the family and the weight from the file names (Google Fonts file names work). A warning asks you to check the result.

**Security:**

- A ZIP file can be 10 MB at most.
- A CSS file can be 1 MB at most.
- The plugin extracts only approved file types.
- An `.htaccess` file stops PHP from running in the font directory.
- The plugin removes dangerous code from the CSS.

### Method 2: Adobe Fonts (Typekit) Integration

Connect an Adobe Fonts project with its embed code.

**Steps:**

1. Go to [fonts.adobe.com](https://fonts.adobe.com).
2. Create or open a web project.
3. Add fonts to the project.
4. Copy the embed code of the project (the `<link>` tag). The older `<script>` embed code also works.
5. Go to Settings → Typography Stylist → Custom Fonts.
6. Open “Add Font”, then open “Add Adobe Fonts Project”.
7. Paste the embed code into “Adobe Fonts Embed Code”.
8. In “Font Family Names”, enter the font family names from the project, with commas between them. This field is necessary.
9. Click “Add Adobe Fonts Project”.

**Important:**

- Make sure that your domain is authorized in your Adobe Fonts project settings.
- The fonts load from Adobe’s servers, not from your WordPress site.
- The plugin stores only the embed code and the font names.

### Method 3: Custom Font Definitions

Define a font that your theme, a different plugin, or a CDN (for example Google Fonts) already loads.

**Steps:**

1. Make sure that your site already loads the font.
2. Go to Settings → Typography Stylist → Custom Fonts.
3. Open “Add Font”, then open “Add Custom Font Definition”.
4. In “Font Name”, enter a display name (for example `Playfair Display`).
5. In “CSS Font Family”, enter the CSS font-family value as your theme writes it. You can include fallback fonts in this value. Examples:
   - **Google Fonts:** `'Playfair Display', serif`
   - **System fonts:** `-apple-system, BlinkMacSystemFont, sans-serif`
   - **Theme fonts:** `'My Theme Font', Georgia, serif`
6. Click “Add Custom Font”.

**Note:** This method does NOT load the font. It only makes a font that your site already loads available in the plugin.

### Managing Font Fallbacks

The browser uses the fallback fonts if the main font does not load. Thus your text stays readable.

**Steps:**

1. On the Custom Fonts tab, click the name of the font to open its settings.
2. In “Fallback Fonts (optional)”, enter the fallback fonts, with commas between them. For example: `Georgia, serif` or `Arial, Helvetica, sans-serif`.
3. Click “Save Changes”.

**Notes:**

- Each font family has its own fallbacks. A kit with many families makes one font entry for each family.
- Fallbacks are optional. You can leave the field empty.
- The fallbacks go into the CSS variable of the font (`--font-N`). Content refers to the font through this variable, so a change to the fallbacks also applies to existing content. You do not have to edit your blocks again.

**Example CSS output:**

```css
/* A font with fallbacks */
font-family: 'Playfair Display', Georgia, serif;
```

### Font Loading Optimization

By default, a font loads only on the pages that use it. The plugin finds the fonts in the post content. This includes blog, category, tag, date, and author archives.

**“Load on all pages”:**

Each uploaded font and Adobe font has a “Load on all pages” checkbox in its settings.

- **Clear (default):** The font loads only on pages that use it. This is best for performance.
- **Checked:** The font loads on every page. Use this for a font that the page does not show in its content, for example a font in your theme header or footer, or a font that JavaScript adds.

**Steps:**

1. Go to Settings → Typography Stylist → Custom Fonts.
2. Click the name of the font to open its settings.
3. Check or clear “Load on all pages”.

**Note:** Custom font definitions do not have this option, because your theme loads those fonts.

### Font Preview

The Font Features tab has a font preview tool:

1. Select a font in “Preview with Font”.
2. Type your own text in “Custom Preview Text”, or use the default samples.
3. Change the size with “Preview Size”.
4. Look at the preview card of each OpenType feature to see its effect on the font.

Use the preview to:

- Make sure that a font loaded correctly.
- Find the OpenType features that a font supports.

To see every glyph of a font, use the Glyphs tab.

### WordPress Font Library Integration (WordPress 6.5+)

On WordPress 6.5 or later, you can register uploaded webfont kits in the WordPress Font Library. In WordPress 7.1, the Font Library is at Appearance → Fonts. In earlier versions, it is in the Site Editor, at Styles → Typography. WordPress can then use the fonts like any other Library font.

- **New uploads register automatically.** The “WordPress Font Library” option on the Options tab controls this. It is on by default.
- **Existing fonts are optional.** Open the settings of an uploaded font on the Custom Fonts tab. The settings show the status (“Registered as *slug*” or “Plugin-managed”) and a “Register in Font Library” or “Remove from Font Library” button. A notice also offers “Register all in Font Library”.
- **Your content does not change.** Your content keeps the same font references. When a font is registered, the plugin points the references to the WordPress font definitions. If you remove the font from the Library, the plugin uses its own definitions again. You can always undo a registration.
- **Library fonts in the editor:** Fonts in the Font Library (or in your theme) also show in the font menus of the editor. Pick one, and it works like any other font.
- **Adobe Fonts and custom font definitions stay in the plugin.** Adobe fonts load from Adobe’s servers, and their license does not let you host them. Custom font definitions refer to fonts that your theme or CDN already loads.

---

## Applying Typography Features

Typography Stylist has two ways to apply typography features.

### Method 1: Inline Format (Simple)

Use this method to style whole words or phrases in a heading, paragraph, or other text block.

**Steps:**

1. Create or edit a post or page.
2. Add a heading block (H1–H6) or a paragraph block.
3. Type your text.
4. Select the text that you want to style. Select whole words only.
5. Click “Typography Stylist Features” (the swash “T”) in the block toolbar.
6. A panel opens. It has these controls:
   - Font family, font weight, font style, font size, line height, and letter spacing
   - “Quick Presets” (only if presets exist)
   - “Glyphs…”, which opens the Glyphs Panel
   - “Browse styles…”, which opens the Paragraph Styles browser
   - “Individual Features”, the OpenType features in groups
7. Change the settings. Each change applies to the selected text at once. Use Ctrl+Z (Cmd+Z on Mac) to undo a change.
8. Click “Close” when you are done. To remove the styling from the selection, click “Clear”.

**Partial word notice:**

If you select part of a word (for example only “Sa” in “Sarah”), an “Accessibility Notice” shows at the top of the panel. The notice tells you that a screen reader can read the word in pieces. Your change still applies.

The notice gives you these choices:

- **Convert to Typography Stylist Block:** Converts the block to a Typography Stylist block, which keeps the text accessible. This is the recommended choice.
- **Manage accessibility settings:** Opens the Accessibility tab, where you can turn off the notice.

If the block cannot be converted (for example, in a locked pattern), the notice says why.

**Why this is important:** A screen reader can read styled parts of a word in a confusing way. The Typography Stylist block prevents this with two copies of the text.

### Method 2: Typography Stylist Block (Advanced)

Use this block for complex typography, letter-by-letter styling, or the most accessibility.

**Steps:**

1. Add a Typography Stylist block from the block inserter:
   - Click the (+) button.
   - Search for “Typography Stylist”.
   - Click the block to insert it.
2. Choose the heading level with “Change heading level” in the block toolbar: Heading 1–6, Paragraph, or Div.
3. Type your text in the block.
4. Set the typography for the whole block in the sidebar.
5. To style only part of the text, select it and click “Typography Stylist Features” in the block toolbar. The Quick Feature Toggles then change only the selected text.

**Sidebar settings:**

- **Font Family:** Select one of your fonts.
- **Font Weight:** Choose a weight (100–900). For a variable font with a weight axis, a slider replaces the list.
- **Font Style:** Choose the italic face of the font.
- **Font Size:** “Inherit”, “Responsive (Fluid)”, or “Fit to width”. A responsive size has three values: “Mobile (320px and up)”, “Intermediate”, and “Large (up to 1920px)”. Fit to width makes each line fill the width of the block.
- **Line Height:** Set the line height.
- **Letter Spacing:** Change the spacing in steps of 1/1000 em.
- **OpenType Features:** Turn on features for the whole block. The features are in groups: ligatures, stylistic sets, swashes and alternates, decorative, numerals and figures, capitals and case, positional forms, superscript and ordinals, and other features.
- **Accessibility:** Choose the screen reader class: `visually-hidden`, `sr-only`, `screen-reader-text`, or a custom class name.

The block writes two copies of your content:

- A plain semantic heading for screen readers.
- A styled copy for the screen.

**Why use the block?**

- You can style parts of words safely.
- You can style each letter.
- The block keeps the semantic HTML structure.
- Screen readers get the plain copy, with ARIA markup.
- The block has responsive and fit-to-width font sizes.

**The Enter key:** In a Typography Stylist block, Enter adds a line break by default. To make Enter start a new block, turn off “Enter adds a line break inside the block” on the Options tab. Shift+Enter always adds a line break.

In a core heading, Enter splits the heading in two. To join the parts again, put the cursor at the start of the paragraph below the heading and press Backspace. WordPress joins the text with no line break. Then press Shift+Enter where you want the line break.

### Quick Presets

A preset is a named group of OpenType features. When presets exist, the inline editor shows them in “Quick Presets”. Click a preset to apply all its features.

The plugin has no default presets. A developer can add presets with the `typost_presets` filter or with the REST API (`POST /wp-json/typost/v1/presets`). The Font Features tab lists the saved presets.

For named typography settings that you make in the editor, use paragraph styles instead.

### Paragraph Styles

A paragraph style is a named set of typography settings. It holds the font, weight, italic, size, letter spacing, line height, OpenType features, and variable font axes.

1. Set the typography of some text in either editor.
2. Click “Save Current Settings as Style” and give the style a name.
3. Select other text.
4. To apply the style in a heading or paragraph, click “Browse styles…” and pick the style. In a Typography Stylist block, pick the style from the Paragraph Style list.

To change a style everywhere, change the settings on text that uses the style and click “Update Style”. “Detach Style” changes the text back to independent settings.

---

## Admin Interface Guide

Go to Settings → Typography Stylist. The screen has eight tabs, in this order:

1. Custom Fonts
2. Paragraph Styles
3. Font Features
4. Glyphs
5. Options
6. Accessibility
7. Replacement Fonts
8. Help

The page updates in place after each action. It does not reload.

### Custom Fonts Tab

**The font list:**

The list shows all your fonts: uploaded kits, Adobe Fonts, custom font definitions, and WordPress Font Library fonts. A badge on each card shows the source. Drag a card to change the order. Click the name of a font to open its settings:

- Fallback fonts
- “Load on all pages”
- “Available Font Weights”
- The OpenType features that the editor shows for this font
- Variable font axes (for a variable font)
- WordPress Font Library registration (for an uploaded font, WordPress 6.5+)
- “Save Changes”, “Cancel”, and “Delete”

When you delete a font, the plugin removes its files from the server. You can choose a replacement font for content that used it.

**“Add Font”:** This section has three parts:

1. **Upload Font Kit:** Upload a webfont kit ZIP.
2. **Add Adobe Fonts Project:** Connect an Adobe Fonts project.
3. **Add Custom Font Definition:** Define a font that your site already loads.

### Paragraph Styles Tab

- The tab lists each saved style, with its font, weight, size, spacing, and features.
- Each style shows sample text in that style: its font, weight, italic, size, letter spacing, line height, and OpenType features. Responsive and fit-to-width styles show their fallback size range.
- The page loads the font files of a style only when you open this tab. An Adobe Fonts kit loads when a sample that uses it comes into view.
- If the font of a style was deleted, the style shows the replacement font. If there is no replacement, it shows the default font.
- Your theme loads the fonts of custom font definitions on the site, not on this page. Thus the sample of such a style can show a fallback font.
- You can rename or delete a style here.
- You make styles in the editor, with “Save Current Settings as Style”.

### Font Features Tab

**The features:**

- The tab shows all the OpenType features that the plugin supports, in groups by category.
- Each feature card shows the feature code (for example `liga`, `ss01`, or `swsh`), a description, and a preview.
- When you select a font, you can choose which features the editor shows for that font.

**The preview tools:**

- **Preview with Font:** Select one of your fonts.
- **Preview Size:** Change the size of the preview text.
- **Custom Preview Text:** Type your own text, or leave it empty to use the default samples.
- **Card Width:** Change the width of the feature cards.
- **Enable All Features** and **Disable All Features:** Turn all the previews on or off.

**Presets:**

- If presets exist, the tab lists them in “Your Saved Presets”, with the features of each preset.

### Glyphs Tab

- Browse every glyph of a font without editing a post.
- See the alternates of a character and the feature tags that make them.
- Click a glyph to copy it.

### Options Tab

- **Admin Color Scheme:** The color scheme of this settings screen. The change applies at once.
- **Clear Button Confirmation:** Ask before the “Clear” button in the editor panels removes styling.
- **Enter Key in Typography Stylist Blocks:** Enter adds a line break inside the block (the default), or Enter starts a new block, as in a core heading.
- **Archive Page Font Detection:** Check the full post content on archive pages, so that fonts load there too.
- **WordPress Font Library:** Register new uploads in the Font Library automatically (WordPress 6.5+).
- **Glyphs Toolbar Button** and **Paragraph Styles Toolbar Button:** Add buttons to the block toolbar. Both are off by default.
- **Clear Font Cache:** Remove the saved font detection results. The plugin finds the fonts again on the next page load.
- **Show Editor Tips Again:** Show the tips notice in the editor panels again, in this browser.

### Accessibility Tab

**Settings:**

- **Disable Word Boundary Warning:** Do not show the notice when you style part of a word.

The screen reader class is a setting of each Typography Stylist block, in its Accessibility panel. It is not on this tab.

**Information on the tab:**

- The built-in accessibility features of the block and the inline format.
- Accessibility best practices.

### Replacement Fonts Tab

- Map the ID of a deleted font to a replacement font. Content that still refers to the old ID then uses the replacement.
- Choose if a replacement font loads on every page (“Load replacement globally”).
- See the font IDs that have no replacement yet (“Unassigned Font IDs”).

### Help Tab

The Help tab has these sections:

- How to Use
- Method 1: Inline Format (Quick Styling)
- Method 2: Typography Stylist Block (Advanced)
- Line Breaks and the Enter Key
- Choosing Fonts for OpenType Features
- Tips for Using OpenType Features
- Technical Notes

---

## Accessibility Features

Typography Stylist keeps styled text accessible.

### The Accessibility Challenge

Complex typography can cause problems for screen readers:

- A style on part of a word puts the letters in separate elements. A screen reader can then read the word in pieces.
- A screen reader can read decorative characters incorrectly.
- Content that is only visual can confuse screen reader users.

### The Solution: Two Copies of the Content

The Typography Stylist block writes two copies of your content:

```html
<div class="wp-block-typost">
  <!-- For screen readers: a plain semantic heading -->
  <h2 class="visually-hidden">Beautiful Typography</h2>

  <!-- For the screen: styled with OpenType features -->
  <h2 class="typost-styled" aria-hidden="true">
    [Styled content with complex typography]
  </h2>
</div>
```

**How it works:**

1. Screen readers read the plain text in a semantic heading.
2. The heading keeps the document outline and the heading navigation correct.
3. Sighted readers see the styled copy.
4. `aria-hidden="true"` stops screen readers from reading the styled copy.
5. The `visually-hidden` class hides the plain copy from sighted readers.

### Best Practices

**Use the inline format when:**

- You apply features to whole words or phrases.
- The text does not split into pieces.
- You want to style text in an existing heading block quickly.

**Use the Typography Stylist block when:**

- You apply features to parts of words or to single letters.
- You make complex typographic designs.
- Accessibility is a primary concern.
- You need the most control over the typography.

**General tips:**

- Test with screen readers (NVDA on Windows, VoiceOver on macOS).
- With the inline format, always select whole words.
- Read the partial word notices.
- Use the conversion button when the editor offers it.
- Think about whether the decorative typography adds meaning or is only visual.

### WCAG

The plugin helps you meet WCAG 2.1 Level AA:

- It keeps the semantic HTML structure.
- It keeps the heading hierarchy correct.
- It gives screen readers a plain copy of styled text.
- The editor panels work with the keyboard.
- Screen reader users can move through the headings.

---

## Troubleshooting

### Fonts Do Not Show in the Editor

**Check:**

1. The font upload completed with no error messages.
2. For Adobe Fonts: the embed code is correct, and the domain is authorized.
3. For custom fonts: your site loads the font.
4. The browser cache. Do a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on Mac).
5. The browser console (F12 → Console) for errors.

**Solution:**

- Upload the font kit again if it is damaged.
- Check the Adobe Fonts embed code.
- Make sure that your theme loads the custom fonts.
- Clear the browser cache and the WordPress caches.

### OpenType Features Do Not Work

**Common causes:**

1. **The font does not have the feature.** Each font has its own set of features.
2. **The browser does not support font-feature-settings.** Use a modern browser.
3. **CSS conflict.** A different plugin or the theme can override the styles.

**How to check:**

1. Use the preview on the Font Features tab, or the Glyphs Panel, to see the features of the font.
2. Test in a different browser.
3. In the browser DevTools (F12 → Elements), look at the styles of the text.
4. Look for the `font-feature-settings` CSS property.

**Solution:**

- Choose features that your font has.
- Update your browser.
- Look for CSS conflicts in DevTools.
- Deactivate other plugins for a short time to find a conflict.

### Uploaded Fonts Do Not Load on the Front End

**Check:**

1. The font files are in `wp-content/uploads/typography-stylist/fonts/`.
2. The web server can read the files (file permissions).
3. The `.htaccess` file does not block the font files.
4. The browser console shows no CORS errors.

**Solution:**

- Check the file permissions (644 for files, 755 for directories).
- Make sure that the `.htaccess` file in the uploads directory does not block fonts.
- Check the CORS configuration of the server for font files.

### The ZIP Upload Fails

**Common issues:**

1. **The file is too large.** The maximum is 10 MB.
2. **Incorrect file types.** The ZIP must contain only CSS and font files.
3. **The ZIP is damaged.** Download it from the font vendor again.
4. **Server upload limits.** Check the PHP `upload_max_filesize` setting.
5. **No usable fonts.** The message “No CSS file was found in the font kit, and no usable font files were found to generate one from” means that the ZIP has no stylesheet and no valid font files. Since v2.1.0, a CSS file is optional, so a ZIP with only font files usually works.

**Solution:**

- Remove files that you do not need from the ZIP to make it smaller.
- Make sure that the ZIP contains only CSS and font files.
- Download the kit from the vendor again.
- Ask your hosting provider to increase the upload limits.

**The “review the generated font styles” warning:** This warning shows when the plugin made the stylesheet from the file names (for WOFF2 files, or for font files that it could not read). Check the family names and the weights on the new font cards. If something is wrong, delete the kit. Then upload it again with TTF or OTF files (the plugin can read their metadata), or put your own CSS file in the ZIP.

### Features Are Applied but Do Not Show

**Possible causes:**

1. The font style (for example the italic) does not have that feature.
2. The font size is too small to see the difference.
3. The feature changes only some letter combinations.
4. A browser rendering problem.

**Solution:**

- Test with a larger font size.
- Try different letter combinations. Some features are contextual.
- Use the specimen sheet of the font to see which letters change.
- Compare the text with and without the feature in the Font Features preview.

### Screen Reader Problems

**If a screen reader reads text incorrectly:**

1. Use the Typography Stylist block instead of the inline format.
2. With the inline format, select whole words.
3. Choose a screen reader class in the Accessibility panel of the block.
4. Test with more than one screen reader (NVDA, JAWS, VoiceOver).

**Solution:**

- Convert inline formats to Typography Stylist blocks.
- Read the partial word notices.
- Make sure that the semantic heading structure stays correct.

### Performance Problems

**If the editor or the front end is slow:**

1. **Too many fonts load.** Each font adds file size.
2. **The font files are too large.** WOFF2 files are the smallest.

**Solution:**

- Load only the fonts that you use. Clear “Load on all pages” for fonts that do not need it.
- Use WOFF2 font files.

---

## Developer Guide

[HOOKS.md](HOOKS.md) has the full reference of the PHP and JavaScript hooks.

### Hooks and Filters

#### Add a Custom OpenType Feature

```php
add_filter('typost_available_features', function($features) {
    $features[] = array(
        'id' => 'cv01',
        'name' => __('Character Variant 1', 'your-textdomain'),
        'category' => 'other',
        'description' => __('Alternative character design', 'your-textdomain')
    );
    return $features;
});
```

#### Add a Preset

```php
add_filter('typost_presets', function($presets) {
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

All REST API endpoints are at `/wp-json/typost/v1/`.

#### Get All Presets

```javascript
fetch('/wp-json/typost/v1/presets')
    .then(response => response.json())
    .then(data => console.log(data));
```

#### Upload a Font Kit

```javascript
const formData = new FormData();
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

#### Add an Adobe Fonts Project

```javascript
fetch('/wp-json/typost/v1/adobe-fonts', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': wpApiSettings.nonce
    },
    body: JSON.stringify({
        embed_code: '<link rel="stylesheet" href="https://use.typekit.net/abc1234.css">',
        font_families: ['proxima-nova', 'futura-pt']
    })
})
.then(response => response.json())
.then(data => console.log(data));
```

### CSS Classes Reference

#### Front-End Classes

```css
/* Inline format wrapper */
.typost-styled {
    /* Inline OpenType features applied here */
}

/* Block wrapper */
.wp-block-typost {
    /* Block container */
}

/* Screen reader only content */
.visually-hidden, .sr-only, .screen-reader-text {
    /* Hidden from visual display, visible to screen readers */
}

/* Paragraph style */
.typost-ps-1 {
    /* One class for each paragraph style */
}
```

#### Data Attributes

```html
<!-- The inline format stores the features -->
<span class="typost-styled"
      data-features="calt,ss02,swsh"
      style="font-feature-settings: 'calt' 1, 'ss02' 1, 'swsh' 1">
    Text
</span>
```

Other attributes on the span: `data-font-id`, `data-fontsize`, `data-fontweight`, `data-letterspacing`, `data-lineheight`, `data-style-id`, and `data-font-variation-settings`.

### File Structure

```
typography-stylist/
├── typography-stylist.php            # Main plugin file
├── includes/
│   ├── admin-page.php                # Settings page
│   ├── class-typost-font-sources.php # Font storage and font IDs
│   ├── class-typost-font-library-bridge.php  # WordPress Font Library integration
│   └── class-typost-font-metadata.php        # Font file metadata
├── assets/
│   ├── js/
│   │   ├── block-editor.js           # Inline editor
│   │   ├── admin-page.js             # Settings page
│   │   ├── editor-font-kits.js       # Adobe Fonts kits in the editor
│   │   ├── font-options.js           # Font list helpers
│   │   ├── font-picker.js            # Searchable font menus
│   │   └── utils.js                  # Shared utility functions
│   ├── css/
│   │   ├── block-editor.css          # Editor styles
│   │   ├── admin-page.css            # Settings page styles
│   │   └── frontend.css              # Front-end styles
│   └── images/icons/                 # Toolbar and block icons
├── blocks/
│   └── typography-stylist/
│       ├── block.json                # Block metadata
│       ├── index.js                  # Block registration
│       ├── edit.js                   # Block editor component
│       ├── save.js                   # Front-end markup
│       ├── utils.js                  # Block utility functions
│       ├── editor.css                # Block editor styles
│       ├── style.css                 # Block front-end styles
│       └── build/                    # Compiled block assets
├── glyphs-panel/                     # Bundled Glyphs Panel module
├── variable-fonts/                   # Bundled Variable Fonts module
├── paragraph-styles/                 # Bundled Paragraph Styles module
├── languages/
│   └── typography-stylist.pot        # Translation template
└── README.md                         # Developer documentation
```

### Security Best Practices

When you extend the plugin:

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

## Support and Resources

### Getting Help

- **Documentation:** This file and README.md.
- **Issues:** Report bugs on the [GitHub issue tracker](https://github.com/mattcowan/typography-stylist-for-wordpress/issues).
- **WordPress.org:** Use the [plugin support forum](https://wordpress.org/support/plugin/typography-stylist/).

### Useful Links

- [OpenType Feature Reference](https://docs.microsoft.com/en-us/typography/opentype/spec/featurelist)
- [CSS font-feature-settings](https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings)
- [WordPress Block Editor Handbook](https://developer.wordpress.org/block-editor/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### Recommended Fonts

These fonts have good OpenType support:

**Script fonts:**

- Calgary Script (Sudtipos)
- Affair, Adios Script (Sudtipos)
- Parfumerie Script (Sudtipos)

**Serif fonts:**

- Adobe Caslon Pro
- Freight Display Pro
- Playfair Display (Google Fonts, limited support)

**Sans serif fonts:**

- Many professional sans serif families have features. Read the specimen of each font.

---

## Changelog

See [README.md](README.md#changelog) for the version history.

---

**Thank you for using Typography Stylist!**
