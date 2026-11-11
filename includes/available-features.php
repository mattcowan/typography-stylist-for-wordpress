<?php
/**
 * The OpenType features the plugin offers, in display order.
 *
 * Plain data, extracted from Typost::get_available_features() (#360). The
 * file returns a new array each time it is included; include it with
 * `require` (never `require_once`) from inside that method, so the
 * esc_html__() calls run at the moment the list is first needed, as before:
 * never at plugin load, which is before `init` and would load the text
 * domain too early (WordPress 6.7+) and return English strings.
 *
 * Each entry: id (OpenType feature tag), name, category (UI group, see
 * Typost::get_feature_category_titles()), description.
 *
 * @since 2.4.0
 * @return array[]
 */

if (!defined('ABSPATH')) {
    exit;
}

return array(
    array(
        'id' => 'liga',
        'name' => esc_html__('Standard Ligatures', 'typography-stylist'),
        'category' => 'ligatures',
        'description' => esc_html__('Common letter combinations like fi, fl', 'typography-stylist')
    ),
    array(
        'id' => 'dlig',
        'name' => esc_html__('Discretionary Ligatures', 'typography-stylist'),
        'category' => 'ligatures',
        'description' => esc_html__('Optional decorative ligatures', 'typography-stylist')
    ),
    array(
        'id' => 'calt',
        'name' => esc_html__('Contextual Alternates', 'typography-stylist'),
        'category' => 'ligatures',
        'description' => esc_html__('Context-aware letter forms', 'typography-stylist')
    ),
    array(
        'id' => 'clig',
        'name' => esc_html__('Contextual Ligatures', 'typography-stylist'),
        'category' => 'ligatures',
        'description' => esc_html__('Context-dependent ligature substitutions', 'typography-stylist')
    ),
    array(
        'id' => 'hlig',
        'name' => esc_html__('Historical Ligatures', 'typography-stylist'),
        'category' => 'ligatures',
        'description' => esc_html__('Archaic and historical ligature forms', 'typography-stylist')
    ),
    array(
        'id' => 'ss01',
        'name' => esc_html__('Stylistic Set 1', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss02',
        'name' => esc_html__('Stylistic Set 2', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss03',
        'name' => esc_html__('Stylistic Set 3', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss04',
        'name' => esc_html__('Stylistic Set 4', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss05',
        'name' => esc_html__('Stylistic Set 5', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss06',
        'name' => esc_html__('Stylistic Set 6', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss07',
        'name' => esc_html__('Stylistic Set 7', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss08',
        'name' => esc_html__('Stylistic Set 8', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss09',
        'name' => esc_html__('Stylistic Set 9', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss10',
        'name' => esc_html__('Stylistic Set 10', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss11',
        'name' => esc_html__('Stylistic Set 11', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss12',
        'name' => esc_html__('Stylistic Set 12', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss13',
        'name' => esc_html__('Stylistic Set 13', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss14',
        'name' => esc_html__('Stylistic Set 14', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss15',
        'name' => esc_html__('Stylistic Set 15', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss16',
        'name' => esc_html__('Stylistic Set 16', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss17',
        'name' => esc_html__('Stylistic Set 17', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss18',
        'name' => esc_html__('Stylistic Set 18', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss19',
        'name' => esc_html__('Stylistic Set 19', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'ss20',
        'name' => esc_html__('Stylistic Set 20', 'typography-stylist'),
        'category' => 'stylistic-sets',
        'description' => esc_html__('Alternate character designs', 'typography-stylist')
    ),
    array(
        'id' => 'swsh',
        'name' => esc_html__('Swashes', 'typography-stylist'),
        'category' => 'alternates',
        'description' => esc_html__('Decorative flourishes', 'typography-stylist')
    ),
    array(
        'id' => 'cswh',
        'name' => esc_html__('Contextual Swashes', 'typography-stylist'),
        'category' => 'alternates',
        'description' => esc_html__('Context-aware decorative flourishes', 'typography-stylist')
    ),
    array(
        'id' => 'salt',
        'name' => esc_html__('Stylistic Alternates', 'typography-stylist'),
        'category' => 'alternates',
        'description' => esc_html__('Alternative character forms', 'typography-stylist')
    ),
    array(
        'id' => 'titl',
        'name' => esc_html__('Titling', 'typography-stylist'),
        'category' => 'alternates',
        'description' => esc_html__('Optimized for large titles', 'typography-stylist')
    ),
    array(
        'id' => 'hist',
        'name' => esc_html__('Historical Forms', 'typography-stylist'),
        'category' => 'alternates',
        'description' => esc_html__('Archaic and historical letterforms', 'typography-stylist')
    ),
    array(
        'id' => 'ornm',
        'name' => esc_html__('Ornaments', 'typography-stylist'),
        'category' => 'decorative',
        'description' => esc_html__('Decorative ornaments', 'typography-stylist')
    ),
    // Numerals & Figures
    array(
        'id' => 'pnum',
        'name' => esc_html__('Proportional Figures', 'typography-stylist'),
        'category' => 'numerals',
        'description' => esc_html__('Variable-width number spacing', 'typography-stylist')
    ),
    array(
        'id' => 'tnum',
        'name' => esc_html__('Tabular Figures', 'typography-stylist'),
        'category' => 'numerals',
        'description' => esc_html__('Fixed-width number spacing for alignment', 'typography-stylist')
    ),
    array(
        'id' => 'lnum',
        'name' => esc_html__('Lining Figures', 'typography-stylist'),
        'category' => 'numerals',
        'description' => esc_html__('Numbers aligned to the baseline', 'typography-stylist')
    ),
    array(
        'id' => 'onum',
        'name' => esc_html__('Oldstyle Figures', 'typography-stylist'),
        'category' => 'numerals',
        'description' => esc_html__('Numbers with varying heights and descenders', 'typography-stylist')
    ),
    array(
        'id' => 'frac',
        'name' => esc_html__('Fractions', 'typography-stylist'),
        'category' => 'numerals',
        'description' => esc_html__('Automatic fraction formation', 'typography-stylist')
    ),
    array(
        'id' => 'zero',
        'name' => esc_html__('Slashed Zero', 'typography-stylist'),
        'category' => 'numerals',
        'description' => esc_html__('Zero with slash to distinguish from letter O', 'typography-stylist')
    ),
    // Capitals & Case
    array(
        'id' => 'smcp',
        'name' => esc_html__('Small Capitals', 'typography-stylist'),
        'category' => 'capitals',
        'description' => esc_html__('Lowercase letters as small capital forms', 'typography-stylist')
    ),
    array(
        'id' => 'c2sc',
        'name' => esc_html__('Capitals to Small Caps', 'typography-stylist'),
        'category' => 'capitals',
        'description' => esc_html__('Convert uppercase letters to small capitals', 'typography-stylist')
    ),
    array(
        'id' => 'pcap',
        'name' => esc_html__('Petite Capitals', 'typography-stylist'),
        'category' => 'capitals',
        'description' => esc_html__('Smaller than small capitals, matching x-height', 'typography-stylist')
    ),
    array(
        'id' => 'case',
        'name' => esc_html__('Case-Sensitive Forms', 'typography-stylist'),
        'category' => 'capitals',
        'description' => esc_html__('Punctuation and symbols adjusted for all-caps text', 'typography-stylist')
    ),
    // Positional Forms
    array(
        'id' => 'init',
        'name' => esc_html__('Initial Forms', 'typography-stylist'),
        'category' => 'positional',
        'description' => esc_html__('Letterforms used at the beginning of a word', 'typography-stylist')
    ),
    array(
        'id' => 'medi',
        'name' => esc_html__('Medial Forms', 'typography-stylist'),
        'category' => 'positional',
        'description' => esc_html__('Letterforms used in the middle of a word', 'typography-stylist')
    ),
    array(
        'id' => 'fina',
        'name' => esc_html__('Terminal Forms', 'typography-stylist'),
        'category' => 'positional',
        'description' => esc_html__('Letterforms used at the end of a word', 'typography-stylist')
    ),
    array(
        'id' => 'isol',
        'name' => esc_html__('Isolated Forms', 'typography-stylist'),
        'category' => 'positional',
        'description' => esc_html__('Standalone letterforms not connected to adjacent characters', 'typography-stylist')
    ),
    // Superscript & Ordinals
    array(
        'id' => 'sups',
        'name' => esc_html__('Superscript', 'typography-stylist'),
        'category' => 'super-sub',
        'description' => esc_html__('Raised characters for footnotes and exponents', 'typography-stylist')
    ),
    array(
        'id' => 'subs',
        'name' => esc_html__('Subscript', 'typography-stylist'),
        'category' => 'super-sub',
        'description' => esc_html__('Lowered characters for chemical formulas and indices', 'typography-stylist')
    ),
    array(
        'id' => 'ordn',
        'name' => esc_html__('Ordinals', 'typography-stylist'),
        'category' => 'super-sub',
        'description' => esc_html__('Ordinal indicators like 1st, 2nd, 3rd', 'typography-stylist')
    ),
    // Other Features
    array(
        'id' => 'kern',
        'name' => esc_html__('Kerning', 'typography-stylist'),
        'category' => 'other',
        'description' => esc_html__('Fine-tuned letter spacing adjustments', 'typography-stylist')
    ),
    array(
        'id' => 'locl',
        'name' => esc_html__('Localized Forms', 'typography-stylist'),
        'category' => 'other',
        'description' => esc_html__('Script and language-specific character variants', 'typography-stylist')
    ),
    array(
        'id' => 'rand',
        'name' => esc_html__('Randomize', 'typography-stylist'),
        'category' => 'other',
        'description' => esc_html__('Randomized glyph variants for handwriting and calligraphic fonts', 'typography-stylist')
    )
);
