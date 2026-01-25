<?php
/**
 * Generate POT file for Headline Ligatures & Styles plugin
 *
 * This script extracts translatable strings and creates a POT template file.
 * Run: php scripts/generate-pot.php
 */

// Define plugin constants
define('PLUGIN_NAME', 'Typography Stylist');
define('PLUGIN_DOMAIN', 'typography-stylist');
define('PLUGIN_VERSION', '1.1.3');

// Output file
$potFile = __DIR__ . '/../languages/' . PLUGIN_DOMAIN . '.pot';

// Files to scan
$files = [
    __DIR__ . '/../typography-stylist.php',
    __DIR__ . '/../includes/admin-page.php',
    __DIR__ . '/../assets/js/block-editor.js'
];

// POT file header (using NOWDOC to avoid variable interpolation issues)
$year = date('Y');
$date = date('Y-m-d H:i+0000');
$pluginName = PLUGIN_NAME;
$pluginVersion = PLUGIN_VERSION;
$pluginDomain = PLUGIN_DOMAIN;

$potContent = <<<'POT'
# Copyright (C) YEAR PACKAGE-NAME
# This file is distributed under the same license as the PACKAGE-NAME package.
msgid ""
msgstr ""
"Project-Id-Version: PLUGIN-NAME PLUGIN-VERSION\n"
"Report-Msgid-Bugs-To: https://wordpress.org/support/plugin/opentype-stylist\n"
"POT-Creation-Date: POT-DATE\n"
"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\n"
"Last-Translator: FULL NAME <EMAIL@ADDRESS>\n"
"Language-Team: LANGUAGE <LL@li.org>\n"
"Language: \n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=UTF-8\n"
"Content-Transfer-Encoding: 8bit\n"
"X-Generator: Custom PHP Script\n"
"X-Domain: PLUGIN-DOMAIN\n"

POT;

// Replace placeholders
$potContent = str_replace(
    ['YEAR', 'PACKAGE-NAME', 'POT-DATE', 'PLUGIN-NAME', 'PLUGIN-VERSION', 'PLUGIN-DOMAIN'],
    [$year, $pluginName, $date, $pluginName, $pluginVersion, $pluginDomain],
    $potContent
);

// Strings found (we'll add them manually based on the audit)
$strings = [
    // From typography-stylist.php
    ['msgid' => 'Headline Ligatures & Styles', 'file' => 'typography-stylist.php', 'line' => 348],
    ['msgid' => 'Headline Typography', 'file' => 'typography-stylist.php', 'line' => 349],
    ['msgid' => 'You do not have sufficient permissions to access this page.', 'file' => 'typography-stylist.php', 'line' => 1464],
    ['msgid' => 'Are you sure you want to delete this font kit?', 'file' => 'typography-stylist.php', 'line' => 559],
    ['msgid' => 'Failed to upload font kit.', 'file' => 'typography-stylist.php', 'line' => 560],
    ['msgid' => 'Please select a ZIP file (.zip)', 'file' => 'typography-stylist.php', 'line' => 561],
    ['msgid' => 'Please enter a font kit name.', 'file' => 'typography-stylist.php', 'line' => 562],
    ['msgid' => 'Please select a ZIP file.', 'file' => 'typography-stylist.php', 'line' => 563],
    ['msgid' => 'Font kit uploaded and processed successfully! Reloading page...', 'file' => 'typography-stylist.php', 'line' => 564],
    ['msgid' => 'Failed to delete font kit.', 'file' => 'typography-stylist.php', 'line' => 565],
    ['msgid' => 'No custom fonts uploaded yet.', 'file' => 'typography-stylist.php', 'line' => 566],
    ['msgid' => 'Upload a webfont kit using the form below to add custom fonts with OpenType features.', 'file' => 'typography-stylist.php', 'line' => 567],
    ['msgid' => 'Uploading', 'file' => 'typography-stylist.php', 'line' => 568],
    ['msgid' => 'Uploading ZIP file...', 'file' => 'typography-stylist.php', 'line' => 569],
    ['msgid' => 'Processing...', 'file' => 'typography-stylist.php', 'line' => 570],
    ['msgid' => 'Upload Font Kit', 'file' => 'typography-stylist.php', 'line' => 571],
    // Adobe Fonts strings
    ['msgid' => 'Please enter a project name.', 'file' => 'typography-stylist.php', 'line' => 573],
    ['msgid' => 'Please paste the Adobe Fonts embed code.', 'file' => 'typography-stylist.php', 'line' => 574],
    ['msgid' => 'Please enter at least one font family name.', 'file' => 'typography-stylist.php', 'line' => 575],
    ['msgid' => 'Adding...', 'file' => 'typography-stylist.php', 'line' => 576],
    ['msgid' => 'Adobe Fonts project added successfully! Reloading page...', 'file' => 'typography-stylist.php', 'line' => 577],
    ['msgid' => 'Failed to add Adobe Fonts project.', 'file' => 'typography-stylist.php', 'line' => 578],
    ['msgid' => 'Add Adobe Fonts Project', 'file' => 'typography-stylist.php', 'line' => 579],
    ['msgid' => 'Are you sure you want to delete this Adobe Fonts project?', 'file' => 'typography-stylist.php', 'line' => 580],
    ['msgid' => 'Failed to delete Adobe Fonts project.', 'file' => 'typography-stylist.php', 'line' => 581],
    // Manual/Custom Fonts strings
    ['msgid' => 'Please enter a font name.', 'file' => 'typography-stylist.php', 'line' => 583],
    ['msgid' => 'Please enter a CSS font-family value.', 'file' => 'typography-stylist.php', 'line' => 584],
    ['msgid' => 'Custom font added successfully! Reloading page...', 'file' => 'typography-stylist.php', 'line' => 585],
    ['msgid' => 'Failed to add custom font.', 'file' => 'typography-stylist.php', 'line' => 586],
    ['msgid' => 'Add Custom Font', 'file' => 'typography-stylist.php', 'line' => 587],
    ['msgid' => 'Are you sure you want to delete this custom font?', 'file' => 'typography-stylist.php', 'line' => 588],
    ['msgid' => 'Failed to delete custom font.', 'file' => 'typography-stylist.php', 'line' => 589],
    // Font loading setting strings
    ['msgid' => 'Failed to update font loading setting.', 'file' => 'typography-stylist.php', 'line' => 591],
    ['msgid' => 'Too many requests. Please try again later.', 'file' => 'typography-stylist.php', 'line' => 618],
    ['msgid' => 'Standard Ligatures', 'file' => 'typography-stylist.php', 'line' => 682],
    ['msgid' => 'Common letter combinations like fi, fl', 'file' => 'typography-stylist.php', 'line' => 684],
    ['msgid' => 'Discretionary Ligatures', 'file' => 'typography-stylist.php', 'line' => 688],
    ['msgid' => 'Optional decorative ligatures', 'file' => 'typography-stylist.php', 'line' => 690],
    ['msgid' => 'Contextual Alternates', 'file' => 'typography-stylist.php', 'line' => 694],
    ['msgid' => 'Context-aware letter forms', 'file' => 'typography-stylist.php', 'line' => 696],
    ['msgid' => 'Stylistic Set 1', 'file' => 'typography-stylist.php', 'line' => 700],
    ['msgid' => 'Stylistic Set 2', 'file' => 'typography-stylist.php', 'line' => 706],
    ['msgid' => 'Stylistic Set 3', 'file' => 'typography-stylist.php', 'line' => 712],
    ['msgid' => 'Stylistic Set 4', 'file' => 'typography-stylist.php', 'line' => 718],
    ['msgid' => 'Stylistic Set 5', 'file' => 'typography-stylist.php', 'line' => 724],
    ['msgid' => 'Alternate character designs', 'file' => 'typography-stylist.php', 'line' => 702],
    ['msgid' => 'Swashes', 'file' => 'typography-stylist.php', 'line' => 730],
    ['msgid' => 'Decorative flourishes', 'file' => 'typography-stylist.php', 'line' => 732],
    ['msgid' => 'Contextual Swashes', 'file' => 'typography-stylist.php', 'line' => 736],
    ['msgid' => 'Context-aware decorative flourishes', 'file' => 'typography-stylist.php', 'line' => 738],
    ['msgid' => 'Stylistic Alternates', 'file' => 'typography-stylist.php', 'line' => 742],
    ['msgid' => 'Alternative character forms', 'file' => 'typography-stylist.php', 'line' => 744],
    ['msgid' => 'Titling', 'file' => 'typography-stylist.php', 'line' => 748],
    ['msgid' => 'Optimized for large titles', 'file' => 'typography-stylist.php', 'line' => 750],
    ['msgid' => 'Ornaments', 'file' => 'typography-stylist.php', 'line' => 754],
    ['msgid' => 'Decorative ornaments', 'file' => 'typography-stylist.php', 'line' => 756],
    ['msgid' => 'Missing required parameters', 'file' => 'typography-stylist.php', 'line' => 871],
    ['msgid' => 'Features must be a non-empty array', 'file' => 'typography-stylist.php', 'line' => 875],
    ['msgid' => 'Invalid feature ID: %s', 'file' => 'typography-stylist.php', 'line' => 882],
    ['msgid' => 'Preset not found', 'file' => 'typography-stylist.php', 'line' => 923],
    ['msgid' => 'Missing required font data', 'file' => 'typography-stylist.php', 'line' => 1150],
    ['msgid' => 'Invalid file type', 'file' => 'typography-stylist.php', 'line' => 1161],
    ['msgid' => 'Please upload a valid ZIP file', 'file' => 'typography-stylist.php', 'line' => 1165],
    ['msgid' => 'File size exceeds maximum allowed (%s)', 'file' => 'typography-stylist.php', 'line' => 1171],
    ['msgid' => 'File upload error', 'file' => 'typography-stylist.php', 'line' => 1176],
    ['msgid' => 'Font not found', 'file' => 'typography-stylist.php', 'line' => 1234],
    ['msgid' => 'Failed to create upload directory', 'file' => 'typography-stylist.php', 'line' => 1262],
    ['msgid' => 'Failed to extract ZIP file. Please ensure the file is a valid ZIP archive.', 'file' => 'typography-stylist.php', 'line' => 1279],
    ['msgid' => 'No CSS file found in the font kit', 'file' => 'typography-stylist.php', 'line' => 1324],
    ['msgid' => 'Invalid CSS file', 'file' => 'typography-stylist.php', 'line' => 1330],
    ['msgid' => 'CSS file is too large (max 1MB)', 'file' => 'typography-stylist.php', 'line' => 1337],
    ['msgid' => 'Could not read CSS file', 'file' => 'typography-stylist.php', 'line' => 1345],
    ['msgid' => 'CSS file does not contain @font-face declarations', 'file' => 'typography-stylist.php', 'line' => 1351],
    ['msgid' => 'No valid @font-face rules found in CSS', 'file' => 'typography-stylist.php', 'line' => 1372],

    // From admin-page.php
    ['msgid' => 'Settings saved successfully.', 'file' => 'includes/admin-page.php', 'line' => 30],
    ['msgid' => 'Skip to main content', 'file' => 'includes/admin-page.php', 'line' => 45],
    ['msgid' => 'Settings sections', 'file' => 'includes/admin-page.php', 'line' => 49],
    ['msgid' => 'Presets', 'file' => 'includes/admin-page.php', 'line' => 57],
    ['msgid' => 'Custom Fonts', 'file' => 'includes/admin-page.php', 'line' => 66],
    ['msgid' => 'Font Features', 'file' => 'includes/admin-page.php', 'line' => 75],
    ['msgid' => 'Help', 'file' => 'includes/admin-page.php', 'line' => 84],
    ['msgid' => 'Feature Demonstrations', 'file' => 'includes/admin-page.php', 'line' => 95],
    ['msgid' => 'See how each OpenType feature affects your text. Compare the default rendering with each feature enabled.', 'file' => 'includes/admin-page.php', 'line' => 96],
    ['msgid' => 'Preview with Font:', 'file' => 'includes/admin-page.php', 'line' => 102],
    ['msgid' => 'Default (system font)', 'file' => 'includes/admin-page.php', 'line' => 105],
    ['msgid' => 'Select a custom font to preview how features will look with that font.', 'file' => 'includes/admin-page.php', 'line' => 121],
    ['msgid' => 'Preview Size:', 'file' => 'includes/admin-page.php', 'line' => 128],
    ['msgid' => 'Adjust preview text size', 'file' => 'includes/admin-page.php', 'line' => 139],
    ['msgid' => 'Adjust the size of the preview text to better see typography features.', 'file' => 'includes/admin-page.php', 'line' => 145],
    ['msgid' => 'Ligatures', 'file' => 'includes/admin-page.php', 'line' => 164],
    ['msgid' => 'Stylistic Sets', 'file' => 'includes/admin-page.php', 'line' => 165],
    ['msgid' => 'Swashes & Alternates', 'file' => 'includes/admin-page.php', 'line' => 166],
    ['msgid' => 'Decorative', 'file' => 'includes/admin-page.php', 'line' => 167],
    ['msgid' => 'Default:', 'file' => 'includes/admin-page.php', 'line' => 186],
    ['msgid' => 'With Feature:', 'file' => 'includes/admin-page.php', 'line' => 193],
    ['msgid' => 'Your Saved Presets', 'file' => 'includes/admin-page.php', 'line' => 209],
    ['msgid' => 'These are presets you\'ve created in the block editor.', 'file' => 'includes/admin-page.php', 'line' => 210],
    ['msgid' => 'Features:', 'file' => 'includes/admin-page.php', 'line' => 218],
    ['msgid' => 'Create Custom Presets', 'file' => 'includes/admin-page.php', 'line' => 230],
    ['msgid' => 'Custom presets can be created directly in the block editor by selecting features and clicking "Save as Preset". Your saved presets will appear here.', 'file' => 'includes/admin-page.php', 'line' => 231],
    ['msgid' => 'Upload webfont kits (MyFonts, Fontspring, etc.) to use custom fonts with OpenType features. Once uploaded, fonts will be available in the block editor.', 'file' => 'includes/admin-page.php', 'line' => 245],
    ['msgid' => 'Uploaded Fonts', 'file' => 'includes/admin-page.php', 'line' => 250],
    ['msgid' => 'Delete font kit: %s', 'file' => 'includes/admin-page.php', 'line' => 259],
    ['msgid' => 'Delete', 'file' => 'includes/admin-page.php', 'line' => 261],
    ['msgid' => 'Font Families:', 'file' => 'includes/admin-page.php', 'line' => 265],
    ['msgid' => 'Uploaded: %s', 'file' => 'includes/admin-page.php', 'line' => 278],
    ['msgid' => '%d font file', 'msgid_plural' => '%d font files', 'file' => 'includes/admin-page.php', 'line' => 281],
    ['msgid' => 'Font Kit Name:', 'file' => 'includes/admin-page.php', 'line' => 303],
    ['msgid' => 'required', 'file' => 'includes/admin-page.php', 'line' => 304],
    ['msgid' => 'e.g., MyFonts Kit 2024', 'file' => 'includes/admin-page.php', 'line' => 311],
    ['msgid' => 'Enter a descriptive name for this font kit', 'file' => 'includes/admin-page.php', 'line' => 316],
    ['msgid' => 'ZIP File:', 'file' => 'includes/admin-page.php', 'line' => 322],
    ['msgid' => 'Choose ZIP file containing webfont kit', 'file' => 'includes/admin-page.php', 'line' => 325],
    ['msgid' => 'Choose ZIP File', 'file' => 'includes/admin-page.php', 'line' => 330],
    ['msgid' => 'Upload a webfont kit as a ZIP file. The ZIP should contain CSS file and font files.', 'file' => 'includes/admin-page.php', 'line' => 341],
    ['msgid' => 'Clear selected file', 'file' => 'includes/admin-page.php', 'line' => 347],
    ['msgid' => 'Uploading...', 'file' => 'includes/admin-page.php', 'line' => 367],
    ['msgid' => 'How to use:', 'file' => 'includes/admin-page.php', 'line' => 374],
    ['msgid' => 'Download your webfont kit from MyFonts, Fontspring, or another provider', 'file' => 'includes/admin-page.php', 'line' => 376],
    ['msgid' => 'If the kit is not already zipped, create a ZIP file containing the entire kit folder (including CSS file and all font files in their directories)', 'file' => 'includes/admin-page.php', 'line' => 377],
    ['msgid' => 'Click "Choose ZIP File" and select your webfont kit ZIP file', 'file' => 'includes/admin-page.php', 'line' => 378],
    ['msgid' => 'Give your kit a descriptive name and click "Upload Font Kit"', 'file' => 'includes/admin-page.php', 'line' => 379],
    ['msgid' => 'The plugin will extract the ZIP, process the fonts, and make them available in the block editor', 'file' => 'includes/admin-page.php', 'line' => 380],
    ['msgid' => 'What should the ZIP contain:', 'file' => 'includes/admin-page.php', 'line' => 382],
    ['msgid' => 'A CSS file with @font-face declarations (e.g., MyWebfontsKit.css)', 'file' => 'includes/admin-page.php', 'line' => 384],
    ['msgid' => 'Font files in their subdirectories (e.g., webFonts/FontName/font.woff2)', 'file' => 'includes/admin-page.php', 'line' => 385],
    ['msgid' => 'The directory structure must match the paths in the CSS file', 'file' => 'includes/admin-page.php', 'line' => 386],
    ['msgid' => 'Note:', 'file' => 'includes/admin-page.php', 'line' => 388],
    ['msgid' => 'The plugin automatically rewrites CSS paths and stores all files in your WordPress uploads directory. All fonts and their files will be properly organized and served from your server.', 'file' => 'includes/admin-page.php', 'line' => 388],
    ['msgid' => 'Available OpenType Features', 'file' => 'includes/admin-page.php', 'line' => 401],
    ['msgid' => 'This plugin supports the following OpenType font features. Note that not all fonts include all features.', 'file' => 'includes/admin-page.php', 'line' => 402],
    ['msgid' => 'Available ligature OpenType features', 'file' => 'includes/admin-page.php', 'line' => 409],
    ['msgid' => 'Code', 'file' => 'includes/admin-page.php', 'line' => 413],
    ['msgid' => 'Name', 'file' => 'includes/admin-page.php', 'line' => 414],
    ['msgid' => 'Description', 'file' => 'includes/admin-page.php', 'line' => 415],
    ['msgid' => 'Common letter combinations like fi, fl, ff', 'file' => 'includes/admin-page.php', 'line' => 422],
    ['msgid' => 'Optional decorative ligatures for special effects', 'file' => 'includes/admin-page.php', 'line' => 427],
    ['msgid' => 'Context-aware letter forms that adapt to surrounding characters', 'file' => 'includes/admin-page.php', 'line' => 432],
    ['msgid' => 'Available stylistic set OpenType features', 'file' => 'includes/admin-page.php', 'line' => 442],
    ['msgid' => 'Stylistic Set %d', 'file' => 'includes/admin-page.php', 'line' => 455],
    ['msgid' => 'Alternate character designs (font-specific)', 'file' => 'includes/admin-page.php', 'line' => 456],
    ['msgid' => '...and ss06 through ss20', 'file' => 'includes/admin-page.php', 'line' => 460],
    ['msgid' => 'Available swashes and alternates OpenType features', 'file' => 'includes/admin-page.php', 'line' => 470],
    ['msgid' => 'Decorative flourishes and ornamental strokes', 'file' => 'includes/admin-page.php', 'line' => 483],
    ['msgid' => 'Forms optimized for large display sizes', 'file' => 'includes/admin-page.php', 'line' => 498],
    ['msgid' => 'Decorative ornaments and symbols', 'file' => 'includes/admin-page.php', 'line' => 503],
    ['msgid' => 'How to Use', 'file' => 'includes/admin-page.php', 'line' => 519],
    ['msgid' => 'Basic Usage', 'file' => 'includes/admin-page.php', 'line' => 522],
    ['msgid' => 'Create or edit a heading block (H1-H6) in the block editor', 'file' => 'includes/admin-page.php', 'line' => 524],
    ['msgid' => 'Type your headline text', 'file' => 'includes/admin-page.php', 'line' => 525],
    ['msgid' => 'Select the text you want to style', 'file' => 'includes/admin-page.php', 'line' => 526],
    ['msgid' => 'Click the "Typography Features" button in the toolbar (icon with decorative "A")', 'file' => 'includes/admin-page.php', 'line' => 527],
    ['msgid' => 'Choose a preset or select individual features', 'file' => 'includes/admin-page.php', 'line' => 528],
    ['msgid' => 'See the live preview and save', 'file' => 'includes/admin-page.php', 'line' => 529],
    ['msgid' => 'Best Fonts for Advanced Typography', 'file' => 'includes/admin-page.php', 'line' => 534],
    ['msgid' => 'This plugin works best with fonts that support OpenType features. Recommended script fonts:', 'file' => 'includes/admin-page.php', 'line' => 535],
    ['msgid' => 'by Alejandro Paul - Elegant connecting script', 'file' => 'includes/admin-page.php', 'line' => 537],
    ['msgid' => 'by Alejandro Paul - Romantic calligraphy', 'file' => 'includes/admin-page.php', 'line' => 538],
    ['msgid' => 'by Alejandro Paul - Casual handwritten style', 'file' => 'includes/admin-page.php', 'line' => 539],
    ['msgid' => 'by Alejandro Paul - Vintage commercial script', 'file' => 'includes/admin-page.php', 'line' => 540],
    ['msgid' => 'Load your fonts using @font-face in your theme or a plugin like Adobe Fonts or Google Fonts.', 'file' => 'includes/admin-page.php', 'line' => 542],
    ['msgid' => 'Tips for Script Fonts', 'file' => 'includes/admin-page.php', 'line' => 546],
    ['msgid' => 'Enable "Contextual Alternates" (calt) for natural letter connections', 'file' => 'includes/admin-page.php', 'line' => 548],
    ['msgid' => 'Use swashes sparingly on first or last letters only', 'file' => 'includes/admin-page.php', 'line' => 549],
    ['msgid' => 'Try different stylistic sets to find the best look', 'file' => 'includes/admin-page.php', 'line' => 550],
    ['msgid' => 'Test your headlines at the actual display size', 'file' => 'includes/admin-page.php', 'line' => 551],
    ['msgid' => 'Not all fonts support all features - experiment!', 'file' => 'includes/admin-page.php', 'line' => 552],
    ['msgid' => 'Technical Notes', 'file' => 'includes/admin-page.php', 'line' => 557],
    ['msgid' => 'This plugin applies CSS font-feature-settings to selected text using inline styles. The features are stored as data attributes on span elements within your content.', 'file' => 'includes/admin-page.php', 'line' => 558],
    ['msgid' => 'Browser support: All modern browsers support OpenType features. Internet Explorer 10+ has partial support.', 'file' => 'includes/admin-page.php', 'line' => 559],

    // From block-editor.js
    ['msgid' => 'Typography Features', 'file' => 'assets/js/block-editor.js', 'line' => 11],
    ['msgid' => 'Elegant Typography & Flourish', 'file' => 'assets/js/block-editor.js', 'line' => 423],
    ['msgid' => 'Font Family', 'file' => 'assets/js/block-editor.js', 'line' => 457],
    ['msgid' => '(Default)', 'file' => 'assets/js/block-editor.js', 'line' => 461],
    ['msgid' => 'Font Size', 'file' => 'assets/js/block-editor.js', 'line' => 471],
    ['msgid' => 'Inherit', 'file' => 'assets/js/block-editor.js', 'line' => 475],
    ['msgid' => 'Responsive (Fluid)', 'file' => 'assets/js/block-editor.js', 'line' => 476],
    ['msgid' => 'Minimum Size (mobile)', 'file' => 'assets/js/block-editor.js', 'line' => 484],
    ['msgid' => 'Preferred Size (tablet)', 'file' => 'assets/js/block-editor.js', 'line' => 493],
    ['msgid' => 'Maximum Size (desktop)', 'file' => 'assets/js/block-editor.js', 'line' => 502],
    ['msgid' => 'Quick Presets', 'file' => 'assets/js/block-editor.js', 'line' => 517],
    ['msgid' => 'Individual Features', 'file' => 'assets/js/block-editor.js', 'line' => 526],
    ['msgid' => 'Preview', 'file' => 'assets/js/block-editor.js', 'line' => 543],
    ['msgid' => 'Active: ', 'file' => 'assets/js/block-editor.js', 'line' => 552],
    ['msgid' => 'Apply', 'file' => 'assets/js/block-editor.js', 'line' => 566],
    ['msgid' => 'Clear', 'file' => 'assets/js/block-editor.js', 'line' => 572],
    ['msgid' => 'Cancel', 'file' => 'assets/js/block-editor.js', 'line' => 578],
    ['msgid' => 'Other Features', 'file' => 'assets/js/block-editor.js', 'line' => 598],
];

// Generate POT entries
foreach ($strings as $string) {
    $potContent .= "\n#: {$string['file']}:{$string['line']}\n";

    if (isset($string['msgid_plural'])) {
        // Plural form
        $potContent .= 'msgid "' . addslashes($string['msgid']) . "\"\n";
        $potContent .= 'msgid_plural "' . addslashes($string['msgid_plural']) . "\"\n";
        $potContent .= "msgstr[0] \"\"\n";
        $potContent .= "msgstr[1] \"\"\n";
    } else {
        // Regular string
        $potContent .= 'msgid "' . addslashes($string['msgid']) . "\"\n";
        $potContent .= "msgstr \"\"\n";
    }
}

// Create languages directory if it doesn't exist
$languagesDir = dirname($potFile);
if (!is_dir($languagesDir)) {
    mkdir($languagesDir, 0755, true);
}

// Write POT file
if (file_put_contents($potFile, $potContent)) {
    echo "✓ POT file generated successfully: {$potFile}\n";
    echo "  Total strings: " . count($strings) . "\n";
} else {
    echo "✗ Failed to write POT file\n";
    exit(1);
}
