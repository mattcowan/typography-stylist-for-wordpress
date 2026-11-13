# OpenType features and presets

- **Topic:** the 51 OpenType features the plugin offers, the shape of a feature entry, and where to add features or default presets.
- **Issues:** none
- **Code:** `typography-stylist.php` (`get_available_features()`, `get_default_presets()`), `includes/available-features.php`, `blocks/typography-stylist/feature-categories.js`

Moved from the root [CLAUDE.md](../../CLAUDE.md) by #361. The filters `typost_available_features` and `typost_presets` are listed in [extension-api.md](extension-api.md) and HOOKS.md.

## Available OpenType Features

The plugin supports these feature categories (51 features total):
- **Ligatures:** liga, dlig, calt, clig, hlig
- **Stylistic Sets:** ss01-ss20
- **Swashes & Alternates:** swsh, cswh, salt, titl, hist
- **Decorative:** ornm
- **Numerals & Figures:** pnum, tnum, lnum, onum, frac, zero
- **Capitals & Case:** smcp, c2sc, pcap, case
- **Positional Forms:** init, medi, fina, isol
- **Superscript & Ordinals:** sups, subs, ordn
- **Other Features:** kern, locl, rand

Feature data structure in [includes/available-features.php](../../includes/available-features.php):
```php
array(
    'id' => 'calt',           // OpenType feature code
    'name' => 'Contextual Alternates',
    'category' => 'ligatures', // Used for UI grouping
    'description' => '...'
)
```

## Modifying Features or Presets

**To add new OpenType features:** Edit the list in [includes/available-features.php](../../includes/available-features.php) (`Typost::get_available_features()` reads it and applies the `typost_available_features` filter)

**To add default presets:** Edit `get_default_presets()` in [typography-stylist.php](../../typography-stylist.php)
