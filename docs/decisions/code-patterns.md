# Code patterns

- **Topic:** sanitization, nonces, localization, the no-logging rule, PHPCS exceptions and the translation catalogs to update.
- **Issues:** none
- **Code:** all shipped PHP and JavaScript; `languages/`, and each module's own `languages/`

Moved from the root [CLAUDE.md](../../CLAUDE.md) by #361. The guide keeps the logging and translation rules as one line each.

## Code Patterns

**Sanitization:** All user input is sanitized using `sanitize_key()` for IDs, `sanitize_text_field()` for text, and `array_map()` for arrays

**Nonce verification:** REST API uses `wp_create_nonce('wp_rest')` and `check_permissions()` method checks `current_user_can('edit_posts')`

**Localization:** All strings use `__()` with text domain `typography-stylist`, except in the bundled modules, which use their own text domains: `typost-glyphs-panel`, `typost-variable-fonts` and `typost-paragraph-styles`

**Debug and Console Logging:**

**JavaScript (Browser Console):**
- **NEVER** use `console.log()`, `console.warn()`, `console.error()`, or `console.debug()` in production code
- WordPress Plugin Directory standards **prohibit** console logging in submitted plugins
- All console statements must be removed before committing
- Browser DevTools and WordPress debug tools provide runtime debugging without polluting production code
- For test files (Jest, Playwright):
  - Use test framework logging mechanisms (e.g., `test.skip()` in Playwright)
  - Never use `console.log()` for conditional test skipping or debugging
  - Test output should integrate with test reporters

**PHP (Server-side Logging):**
- Do NOT add `error_log()` statements to production code
- Only use `error_log()` temporarily when debugging specific issues locally
- Remove all `error_log()` statements before committing changes
- If persistent logging is needed, use WordPress debugging functions with `WP_DEBUG_LOG`

**Rationale:**
- Console/error logging statements violate WordPress Plugin Directory submission standards
- Logging output can expose sensitive information or implementation details
- Production plugins should handle errors gracefully without diagnostic output
- Proper error handling (try/catch, validation) should remain intact without logging side effects

**WordPress Coding Standards Exceptions:**
- Use `// phpcs:disable RuleName -- Reason` to suppress specific PHPCS warnings when justified
- Always provide a clear reason after `--` explaining why the exception is necessary
- Re-enable the rule with `// phpcs:enable RuleName` as soon as possible
- Common valid reasons: performance optimization, security requirements, backward compatibility
- Example: Performance-critical code that reads only 4 bytes vs loading entire multi-MB files

**Translation Management:**
- All user-facing strings MUST be wrapped in translation functions (`__()`, `esc_html__()`, `esc_attr__()`, `sprintf()`)
- After adding new translatable strings, update ALL translation files in this order:
  1. **Base template:** [languages/typography-stylist.pot](../../languages/typography-stylist.pot)
  2. **French translation:** [languages/typography-stylist-fr_FR.po](../../languages/typography-stylist-fr_FR.po)
  3. **Spanish translation:** [languages/typography-stylist-es_ES.po](../../languages/typography-stylist-es_ES.po)
- Format for .pot and .po files:
  ```
  #: path/to/file.php:123
  msgid "String to translate"
  msgstr ""
  ```
- For .po files, the `msgstr` should contain the translation (not empty)
- For strings with placeholders, use `#, php-format` directive and `sprintf()`:
  ```
  #: path/to/file.php:123
  #, php-format
  msgid "Click to apply %s feature"
  msgstr ""
  ```
- **IMPORTANT:** Always update French and Spanish .po files when updating the .pot file - this step is often forgotten!
