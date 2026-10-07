# Translation Files

This directory holds the translation files for the core of the Typography Stylist plugin. The text domain is `typography-stylist`.

## Available translations

- French (France), `fr_FR`
- Spanish (Spain), `es_ES`

More translations are welcome.

## The catalogs

The plugin has four catalogs. Each catalog has its own text domain and its own `languages/` directory.

| Part of the plugin | Text domain | Directory |
| --- | --- | --- |
| Core | `typography-stylist` | `languages/` |
| Glyphs Panel | `typost-glyphs-panel` | `glyphs-panel/languages/` |
| Variable Fonts | `typost-variable-fonts` | `variable-fonts/languages/` |
| Paragraph Styles | `typost-paragraph-styles` | `paragraph-styles/languages/` |

Each directory contains these files:

- **`{domain}.pot`:** The template. It holds all the translatable strings and no translations.
- **`{domain}-{locale}.po`:** The translations for one language, for example `typography-stylist-fr_FR.po`.
- **`{domain}-{locale}.mo`:** The compiled form of the `.po` file. WordPress reads this file for PHP strings.
- **`{domain}-{locale}-{md5}.json`:** The translations for one JavaScript file, in JED format. WordPress reads this file for the strings in that script.

## JavaScript translations

WordPress does not make the `.json` files. The plugin ships them, one file for each script and each language.

The `{md5}` part of the file name is the MD5 hash of the script path, relative to the plugin root. The core catalog has `.json` files for these two scripts:

- `assets/js/block-editor.js` (the inline editor)
- `blocks/typography-stylist/build/index.js` (the Typography Stylist block)

WordPress uses the path without `.min` when it calculates the hash. Thus one `.json` file serves both `block-editor.js` and `block-editor.min.js`.

The block’s source files (`edit.js` and the others) go into `build/index.js` when you build the block. WordPress loads `build/index.js`, so the block’s strings must come from that file. If they come from `edit.js`, the hash does not match and WordPress does not find the file.

A module’s `.json` file name also uses the path from the plugin root, for example `paragraph-styles/assets/js/editor.js`.

## For translators

1. Open the `.pot` file of the catalog in [Poedit](https://poedit.net/) or a different gettext editor.
2. Make a new translation from the template.
3. Translate the strings.
4. Save the file as `{domain}-{locale}.po`, for example `typography-stylist-de_DE.po`.
5. Use the WordPress locale code, for example `de_DE` for German.

Send the `.po` file to the developer. The developer makes the `.mo` and `.json` files.

## For developers

Run all the commands from the plugin root. The commands need [WP-CLI](https://wp-cli.org/).

### Make the core template

```bash
wp i18n make-pot . languages/typography-stylist.pot --domain=typography-stylist --exclude=node_modules,vendor,tests,test-results,playwright-report-sr,playwright-profile,private,glyphs-panel,variable-fonts,paragraph-styles,blocks/typography-stylist/edit.js,blocks/typography-stylist/save.js,blocks/typography-stylist/utils.js,blocks/typography-stylist/index.js,blocks/typography-stylist/deprecated.js,blocks/typography-stylist/__tests__,blocks/typography-stylist/__mocks__,*.min.js
```

The command reads the block’s strings from `blocks/typography-stylist/build/index.js`, so build the block first (`npm run build:block`). If you do not, the template gets the strings of the old build.

### Make a module template

Give the module folder as the source. The command still runs from the plugin root. For example:

```bash
wp i18n make-pot variable-fonts variable-fonts/languages/typost-variable-fonts.pot --domain=typost-variable-fonts --exclude=__tests__,node_modules,*.min.js
```

After you change a template, update the French and Spanish `.po` files to match it.

### Compile the `.mo` files

Use `wp i18n make-mo` for the core catalog and for each module:

```bash
wp i18n make-mo languages languages
wp i18n make-mo paragraph-styles/languages paragraph-styles/languages
```

`make-mo` keeps `msgctxt` entries. The block title, description, and keywords from `block.json` need them.

### Make the `.json` files

```bash
wp i18n make-json languages --no-purge
```

Always use `--no-purge`. Without it, the command removes the JavaScript strings from the `.po` files.

This command is correct only for the core catalog. In a module catalog, the file references are relative to the module folder (`assets/js/admin.js`). WordPress looks for the md5 hash of the path from the plugin root (`variable-fonts/assets/js/admin.js`). So, after you run `make-json` in a module, rename each file to the hash of the full path. To get the hash, run `php -r "echo md5('variable-fonts/assets/js/admin.js');"`.

### Add a translatable string

- **PHP:** Use `__()`, `_e()`, `_n()`, `_x()`, `esc_html__()`, `esc_attr__()`, or `esc_html_e()`.
- **JavaScript:** Use `__()`, `_n()`, `_x()`, or `sprintf()` from `wp.i18n`.
- **Text domain:** Use the domain of the part of the plugin that holds the string (see the table above).

Then update the `.pot` file and both `.po` files of that catalog.

### Test a translation

1. Put the `.po`, `.mo`, and `.json` files in the correct `languages/` directory.
2. Set the site language in Settings → General.
3. Clear all caches.
4. Open the block editor and the Typography Stylist settings page, and look at the strings.

## Resources

- [WordPress internationalization documentation](https://developer.wordpress.org/apis/internationalization/)
- [Poedit](https://poedit.net/), a translation editor
- [WP-CLI i18n commands](https://developer.wordpress.org/cli/commands/i18n/)
- [WordPress locale codes](https://make.wordpress.org/polyglots/teams/)
