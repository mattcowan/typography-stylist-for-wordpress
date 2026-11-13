# REST API

- **Topic:** every route in the `typost/v1` namespace with its capability, and what all routes share: the write rate limit, nonces and caching.
- **Issues:** #205 (export and import routes), #239 (rate limit review)
- **Code:** `includes/class-typost-rest-controller.php`, `typography-stylist.php`, `paragraph-styles/paragraph-styles.php`, `variable-fonts/variable-fonts.php`, `includes/class-typost-export.php`, `tests/Unit/RestRateLimitTest.php`

Moved from the root [CLAUDE.md](../../CLAUDE.md) by #361.

## REST API Endpoints

**Export & Import (v2.3.5+, #205):**
- `POST /wp-json/typost/v1/export` - `{sections, allFonts, sectionArgs}` → `{file, notes, filename}` (requires `edit_posts`, each section's capability, and `manage_options` for `allFonts`)
- `POST /wp-json/typost/v1/import/preview` - `{fileText}` → fonts with match status, each section's preview (requires `manage_options`; saves nothing)
- `POST /wp-json/typost/v1/import` - `{fileText, choices}` (requires `manage_options` — an overwritten style restyles every post that uses it)

**Presets:**
- `GET /wp-json/typost/v1/presets` - Get all presets
- `POST /wp-json/typost/v1/presets` - Save new preset (requires `edit_posts` capability)
- `DELETE /wp-json/typost/v1/presets/{id}` - Delete preset (requires `edit_posts` capability)

**Custom Fonts (Uploaded Webfont Kits):**
- `GET /wp-json/typost/v1/fonts` - Get uploaded font kits
- `POST /wp-json/typost/v1/fonts` - Upload font kit ZIP file (multipart/form-data, requires `upload_files`)
- `DELETE /wp-json/typost/v1/fonts/{id}` - Delete font kit and files (requires `upload_files`)
- `PATCH /wp-json/typost/v1/fonts/{id}/fallback` - Update fallback fonts (requires `upload_files`)

**Adobe Fonts (Typekit):**
- `GET /wp-json/typost/v1/adobe-fonts` - Get Adobe Fonts projects
- `POST /wp-json/typost/v1/adobe-fonts` - Add Adobe Fonts project via embed code (requires `upload_files`)
- `DELETE /wp-json/typost/v1/adobe-fonts/{id}` - Delete Adobe Fonts project (requires `upload_files`)
- `PATCH /wp-json/typost/v1/adobe-fonts/{id}/fallback` - Update fallback fonts (requires `upload_files`)

**Custom Font Definitions (Theme/Plugin/CDN Fonts):**
- `GET /wp-json/typost/v1/manual-fonts` - Get custom font definitions
- `POST /wp-json/typost/v1/manual-fonts` - Add custom font definition (requires `edit_posts`)
- `DELETE /wp-json/typost/v1/manual-fonts/{id}` - Delete custom font (requires `edit_posts`)

**WP Font Library (v2.1+, WP 6.5+):**
- `POST /wp-json/typost/v1/fonts/{id}/wp-library` - Register an uploaded font in the Font Library (requires `manage_options` — site-wide configuration)
- `DELETE /wp-json/typost/v1/fonts/{id}/wp-library` - Remove from the Font Library (requires `manage_options`)
- `POST /wp-json/typost/v1/fonts/wp-library/bulk` - Register all unregistered uploaded fonts (requires `manage_options`)
- `POST /wp-json/typost/v1/wp-fonts/adopt` - Adopt a Library font for editor use, allocating a numeric font_id; idempotent (requires `edit_posts` — authors pick fonts)

**Variable Fonts (bundled module):**
- `GET|POST|DELETE /wp-json/typost/v1/variable-font-axes[/{id}]` - Axis definitions per font string ID (requires `manage_options` — site-wide configuration)
- `POST /wp-json/typost/v1/variable-font-axes/{id}/redetect` - Re-read axes from an uploaded font's own files and return them **without** writing the option; the admin form repopulates its rows for review and the user still saves (requires `manage_options`). Uploaded kit fonts only — Adobe/manual fonts have no server-side files and fall back to the browser parser.

**Paragraph Styles (bundled module, v2.3+):**
- `GET|POST /wp-json/typost/v1/paragraph-styles` - List / create paragraph styles (requires `edit_posts` — styles are author-facing content)
- `PATCH|DELETE /wp-json/typost/v1/paragraph-styles/{id}` - Rename/update properties / delete (requires `edit_posts`). POST and PATCH also take `grepRules` (#196; a custom pattern in it needs `manage_options`) and `nestedRules` (#195)
- `GET /wp-json/typost/v1/paragraph-styles/{id}/admin-card` - The admin tab card's details and preview HTML plus the regenerated style CSS, fetched after the edit form saves (#221; requires `edit_posts`)
- `GET /wp-json/typost/v1/paragraph-styles/editor-css` - The main and nested rule CSS, fetched by the editor after a style changes (#354; requires `edit_posts`)

All endpoints include:
- Rate limiting: 50 write requests (POST/PUT/PATCH/DELETE) per minute per user across every `typost/v1` route, modules included. `enforce_rest_rate_limit()` on `rest_dispatch_request` counts a request only after its permission callback passes; `check_permissions()` shares the counter (`consume_rate_limit()`, private) so extensions in their own namespace stay limited, and an `SplObjectStorage` guard counts each request once — all in `Typost_Rest_Controller` (`includes/class-typost-rest-controller.php`, #360), with `Typost::check_permissions()` and `Typost::enforce_rest_rate_limit()` kept as delegating wrappers (2026-10, PR #239 review: inline `current_user_can()` routes had no limit before). Admin bursts must stay under it: feature-visibility saves are debounced for this reason. The window is fixed (`{count, start}` in the `typost_rate_limit_window` **user meta**, reset once `start` is 60 s old); it used to be a transient re-set to a fresh 60 s on every write, so a steady 30/min hit 429 after ~100 s, and on persistent-object-cache sites `clear_cache()` → `wp_cache_flush()` wiped the transient on every save, so the limit never fired (both CodeRabbit, PR #239). Best-effort: read and write are separate, so concurrent writes can slip past 50. uninstall.php deletes the meta.
- Nonce verification by WordPress core for cookie-authenticated requests (the plugin does not check nonces itself on REST routes)
- Transient caching where appropriate
